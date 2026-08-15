#include "namespace-commit.h"

#include <errno.h>
#include <fcntl.h>
#include <linux/openat2.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

#ifndef RENAME_NOREPLACE
#define RENAME_NOREPLACE (1u << 0u)
#endif

struct agent_namespace_parent {
  int descriptor;
  char *base_name;
};

static enum agent_namespace_status agent_linux_error(int error) {
  switch (error) {
    case EEXIST:
    case ENOENT:
    case ENOTDIR:
    case EBUSY:
    case ENOTEMPTY:
    case EISDIR:
      return AGENT_NAMESPACE_CONFLICT;
    case EACCES:
    case EPERM:
    case ELOOP:
    case EXDEV:
      return AGENT_NAMESPACE_PERMISSION;
    case ENOSYS:
    case EOPNOTSUPP:
    case EINVAL:
      return AGENT_NAMESPACE_UNSUPPORTED;
    case ENAMETOOLONG:
    case EFBIG:
      return AGENT_NAMESPACE_LIMIT;
    default:
      return AGENT_NAMESPACE_IO;
  }
}

static enum agent_namespace_status agent_resolution_error(int error) {
  return error == ELOOP || error == EXDEV
    ? AGENT_NAMESPACE_CONFLICT
    : agent_linux_error(error);
}

static int agent_openat2(
  int directory,
  const char *path,
  uint64_t flags,
  uint64_t resolve
) {
  const struct open_how how = {
    .flags = flags,
    .mode = 0u,
    .resolve = resolve
  };
  return (int)syscall(SYS_openat2, directory, path, &how, sizeof(how));
}

static bool agent_identity(
  int descriptor,
  enum agent_namespace_entry_kind kind,
  struct agent_namespace_identity identity
) {
  struct stat observed;
  if (fstat(descriptor, &observed) != 0) {
    return false;
  }
  const bool kind_matches = kind == AGENT_NAMESPACE_DIRECTORY
    ? S_ISDIR(observed.st_mode)
    : kind == AGENT_NAMESPACE_FILE && S_ISREG(observed.st_mode);
  return
    kind_matches &&
    (uint64_t)observed.st_dev == identity.device &&
    (uint64_t)observed.st_ino == identity.inode;
}

static char *agent_copy(const char *value) {
  const size_t length = strlen(value);
  char *copy = malloc(length + 1u);
  if (copy != NULL) {
    memcpy(copy, value, length + 1u);
  }
  return copy;
}

static void agent_parent_dispose(struct agent_namespace_parent *parent) {
  if (parent->descriptor >= 0) {
    close(parent->descriptor);
  }
  free(parent->base_name);
  parent->descriptor = -1;
  parent->base_name = NULL;
}

static enum agent_namespace_status agent_parent(
  int root,
  const char *relative_path,
  struct agent_namespace_parent *parent
) {
  char *path = agent_copy(relative_path);
  if (path == NULL) {
    return AGENT_NAMESPACE_IO;
  }
  char *separator = strrchr(path, '/');
  const char *parent_path = ".";
  const char *base_name = path;
  if (separator != NULL) {
    *separator = '\0';
    parent_path = path;
    base_name = separator + 1u;
  }
  parent->base_name = agent_copy(base_name);
  if (parent->base_name == NULL) {
    free(path);
    return AGENT_NAMESPACE_IO;
  }
  parent->descriptor = agent_openat2(
    root,
    parent_path,
    O_PATH | O_DIRECTORY | O_CLOEXEC,
    RESOLVE_BENEATH | RESOLVE_NO_MAGICLINKS | RESOLVE_NO_SYMLINKS
  );
  const int error = errno;
  free(path);
  if (parent->descriptor < 0) {
    free(parent->base_name);
    parent->base_name = NULL;
    return agent_resolution_error(error);
  }
  return AGENT_NAMESPACE_DIRECTORY_CREATED;
}

static enum agent_namespace_status agent_create_directory(
  const struct agent_namespace_request *request,
  int root
) {
  struct agent_namespace_parent parent = { .descriptor = -1, .base_name = NULL };
  enum agent_namespace_status status = agent_parent(
    root,
    request->relative_path,
    &parent
  );
  if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
    return status;
  }
  if (
    !agent_identity(
      parent.descriptor,
      AGENT_NAMESPACE_DIRECTORY,
      request->source_parent_identity
    )
  ) {
    agent_parent_dispose(&parent);
    return AGENT_NAMESPACE_CONFLICT;
  }
  const int result = mkdirat(parent.descriptor, parent.base_name, 0777);
  const int error = errno;
  agent_parent_dispose(&parent);
  return result == 0
    ? AGENT_NAMESPACE_DIRECTORY_CREATED
    : agent_linux_error(error);
}

static enum agent_namespace_status agent_remove(
  const struct agent_namespace_request *request,
  int root
) {
  struct agent_namespace_parent parent = { .descriptor = -1, .base_name = NULL };
  enum agent_namespace_status status = agent_parent(
    root,
    request->relative_path,
    &parent
  );
  if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
    return status;
  }
  if (
    !agent_identity(
      parent.descriptor,
      AGENT_NAMESPACE_DIRECTORY,
      request->source_parent_identity
    )
  ) {
    agent_parent_dispose(&parent);
    return AGENT_NAMESPACE_CONFLICT;
  }
  const int target = agent_openat2(
    parent.descriptor,
    parent.base_name,
    O_PATH | O_CLOEXEC | O_NOFOLLOW,
    RESOLVE_BENEATH | RESOLVE_NO_MAGICLINKS | RESOLVE_NO_SYMLINKS
  );
  if (target < 0) {
    status = agent_resolution_error(errno);
    agent_parent_dispose(&parent);
    return status;
  }
  if (!agent_identity(target, request->entry_kind, request->identity)) {
    close(target);
    agent_parent_dispose(&parent);
    return AGENT_NAMESPACE_CONFLICT;
  }
  if (close(target) != 0) {
    agent_parent_dispose(&parent);
    return AGENT_NAMESPACE_IO;
  }
  const int flags = request->entry_kind == AGENT_NAMESPACE_DIRECTORY
    ? AT_REMOVEDIR
    : 0;
  const int result = unlinkat(parent.descriptor, parent.base_name, flags);
  const int error = errno;
  agent_parent_dispose(&parent);
  return result == 0 ? AGENT_NAMESPACE_REMOVED : agent_linux_error(error);
}

static enum agent_namespace_status agent_move(
  const struct agent_namespace_request *request,
  int root
) {
  struct agent_namespace_parent source = { .descriptor = -1, .base_name = NULL };
  struct agent_namespace_parent destination = {
    .descriptor = -1,
    .base_name = NULL
  };
  enum agent_namespace_status status = agent_parent(
    root,
    request->relative_path,
    &source
  );
  if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
    return status;
  }
  status = agent_parent(root, request->destination_path, &destination);
  if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
    agent_parent_dispose(&source);
    return status;
  }
  if (
    !agent_identity(
      source.descriptor,
      AGENT_NAMESPACE_DIRECTORY,
      request->source_parent_identity
    ) ||
    !agent_identity(
      destination.descriptor,
      AGENT_NAMESPACE_DIRECTORY,
      request->destination_parent_identity
    )
  ) {
    agent_parent_dispose(&source);
    agent_parent_dispose(&destination);
    return AGENT_NAMESPACE_CONFLICT;
  }
  const int target = agent_openat2(
    source.descriptor,
    source.base_name,
    O_PATH | O_CLOEXEC | O_NOFOLLOW,
    RESOLVE_BENEATH | RESOLVE_NO_MAGICLINKS | RESOLVE_NO_SYMLINKS
  );
  if (target < 0) {
    status = agent_resolution_error(errno);
    agent_parent_dispose(&source);
    agent_parent_dispose(&destination);
    return status;
  }
  if (!agent_identity(target, request->entry_kind, request->identity)) {
    close(target);
    agent_parent_dispose(&source);
    agent_parent_dispose(&destination);
    return AGENT_NAMESPACE_CONFLICT;
  }
  if (close(target) != 0) {
    agent_parent_dispose(&source);
    agent_parent_dispose(&destination);
    return AGENT_NAMESPACE_IO;
  }
  const long result = syscall(
    SYS_renameat2,
    source.descriptor,
    source.base_name,
    destination.descriptor,
    destination.base_name,
    RENAME_NOREPLACE
  );
  const int error = errno;
  agent_parent_dispose(&source);
  agent_parent_dispose(&destination);
  return result == 0 ? AGENT_NAMESPACE_MOVED : agent_linux_error(error);
}

enum agent_namespace_status agent_namespace_commit(
  const struct agent_namespace_request *request
) {
  if (request == NULL || request->root[0] != '/') {
    return AGENT_NAMESPACE_PERMISSION;
  }
  const int root = open(
    request->root,
    O_PATH | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
  );
  if (root < 0) {
    return agent_linux_error(errno);
  }
  struct stat observed;
  if (fstat(root, &observed) != 0 || !S_ISDIR(observed.st_mode)) {
    close(root);
    return AGENT_NAMESPACE_PERMISSION;
  }
  enum agent_namespace_status status = AGENT_NAMESPACE_UNSUPPORTED;
  if (request->operation == AGENT_NAMESPACE_CREATE_DIRECTORY) {
    status = agent_create_directory(request, root);
  } else if (request->operation == AGENT_NAMESPACE_MOVE) {
    status = agent_move(request, root);
  } else if (request->operation == AGENT_NAMESPACE_REMOVE) {
    status = agent_remove(request, root);
  }
  if (close(root) != 0 && status <= AGENT_NAMESPACE_REMOVED) {
    return AGENT_NAMESPACE_IO;
  }
  return status;
}
