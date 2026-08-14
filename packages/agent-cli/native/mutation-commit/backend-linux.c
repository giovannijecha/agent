#include "mutation-commit.h"

#include <errno.h>
#include <fcntl.h>
#include <linux/openat2.h>
#include <signal.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <unistd.h>

static volatile sig_atomic_t agent_lease_break_requested = 0;

static void agent_lease_break(int signal_number) {
  (void)signal_number;
  agent_lease_break_requested = 1;
}

static enum agent_mutation_status agent_linux_error(int error) {
  switch (error) {
    case EEXIST:
    case ENOENT:
    case ENOTDIR:
    case EAGAIN:
    case EBUSY:
      return AGENT_MUTATION_CONFLICT;
    case EACCES:
    case EPERM:
    case ELOOP:
    case EXDEV:
      return AGENT_MUTATION_PERMISSION;
    case ENOSYS:
    case EOPNOTSUPP:
    case EINVAL:
      return AGENT_MUTATION_UNSUPPORTED;
    case ENAMETOOLONG:
    case EFBIG:
      return AGENT_MUTATION_LIMIT;
    default:
      return AGENT_MUTATION_IO;
  }
}

static enum agent_mutation_status agent_linux_resolution_error(int error) {
  return error == ELOOP || error == EXDEV
    ? AGENT_MUTATION_CONFLICT
    : agent_linux_error(error);
}

static int agent_openat2(
  int directory,
  const char *path,
  uint64_t flags,
  uint64_t mode,
  uint64_t resolve
) {
  const struct open_how how = {
    .flags = flags,
    .mode = mode,
    .resolve = resolve
  };
  return (int)syscall(SYS_openat2, directory, path, &how, sizeof(how));
}

static bool agent_identity(
  int descriptor,
  uint64_t device,
  uint64_t inode,
  bool directory
) {
  struct stat status;
  if (fstat(descriptor, &status) != 0) {
    return false;
  }
  return
    (directory ? S_ISDIR(status.st_mode) : S_ISREG(status.st_mode)) &&
    (uint64_t)status.st_dev == device &&
    (uint64_t)status.st_ino == inode;
}

static char *agent_copy(const char *value) {
  const size_t length = strlen(value);
  char *copy = malloc(length + 1u);
  if (copy != NULL) {
    memcpy(copy, value, length + 1u);
  }
  return copy;
}

static enum agent_mutation_status agent_parent(
  int root,
  const char *relative_path,
  int *parent,
  char **base_name
) {
  char *path = agent_copy(relative_path);
  if (path == NULL) {
    return AGENT_MUTATION_IO;
  }
  char *separator = strrchr(path, '/');
  const char *parent_path = ".";
  const char *base = path;
  if (separator != NULL) {
    *separator = '\0';
    parent_path = path;
    base = separator + 1u;
  }
  *base_name = agent_copy(base);
  if (*base_name == NULL) {
    free(path);
    return AGENT_MUTATION_IO;
  }
  *parent = agent_openat2(
    root,
    parent_path,
    O_PATH | O_DIRECTORY | O_CLOEXEC,
    0u,
    RESOLVE_BENEATH | RESOLVE_NO_MAGICLINKS | RESOLVE_NO_SYMLINKS
  );
  const int error = errno;
  free(path);
  if (*parent < 0) {
    free(*base_name);
    *base_name = NULL;
    return agent_linux_resolution_error(error);
  }
  return AGENT_MUTATION_REPLACED;
}

static bool agent_read_expected(
  int file,
  const unsigned char *expected,
  size_t expected_length
) {
  struct stat status;
  if (
    fstat(file, &status) != 0 ||
    status.st_size < 0 ||
    (uint64_t)status.st_size != (uint64_t)expected_length
  ) {
    return false;
  }
  unsigned char buffer[65536];
  size_t offset = 0u;
  while (offset < expected_length) {
    const size_t remaining = expected_length - offset;
    const size_t requested = remaining < sizeof(buffer)
      ? remaining
      : sizeof(buffer);
    const ssize_t received = pread(file, buffer, requested, (off_t)offset);
    if (
      received <= 0 ||
      (size_t)received > requested ||
      memcmp(expected + offset, buffer, (size_t)received) != 0
    ) {
      return false;
    }
    offset += (size_t)received;
  }
  return true;
}

static bool agent_write_complete(
  int file,
  const unsigned char *content,
  size_t length
) {
  size_t offset = 0u;
  while (offset < length) {
    const size_t remaining = length - offset;
    const size_t requested = remaining < 65536u ? remaining : 65536u;
    const ssize_t written = pwrite(
      file,
      content + offset,
      requested,
      (off_t)offset
    );
    if (written <= 0 || (size_t)written > requested) {
      return false;
    }
    offset += (size_t)written;
  }
  return ftruncate(file, (off_t)length) == 0 && fsync(file) == 0;
}

static enum agent_mutation_status agent_linux_create(
  const struct agent_mutation_request *request,
  int root
) {
  int parent = -1;
  char *base_name = NULL;
  enum agent_mutation_status status = agent_parent(
    root,
    request->relative_path,
    &parent,
    &base_name
  );
  if (status != AGENT_MUTATION_REPLACED) {
    return status;
  }
  if (
    !agent_identity(
      parent,
      request->identity_device,
      request->identity_inode,
      true
    )
  ) {
    close(parent);
    free(base_name);
    return AGENT_MUTATION_CONFLICT;
  }
  const int temporary = openat(
    parent,
    ".",
    O_TMPFILE | O_RDWR | O_CLOEXEC,
    0666
  );
  if (temporary < 0) {
    status = agent_linux_error(errno);
    close(parent);
    free(base_name);
    return status;
  }
  if (
    !agent_write_complete(
      temporary,
      request->replacement_content,
      request->replacement_length
    )
  ) {
    close(temporary);
    close(parent);
    free(base_name);
    return AGENT_MUTATION_IO;
  }
  int linked = linkat(temporary, "", parent, base_name, AT_EMPTY_PATH);
  int link_error = errno;
  if (linked != 0 && link_error == EPERM) {
    char descriptor_path[64];
    const int length = snprintf(
      descriptor_path,
      sizeof(descriptor_path),
      "/proc/self/fd/%d",
      temporary
    );
    if (length <= 0 || (size_t)length >= sizeof(descriptor_path)) {
      link_error = EOVERFLOW;
    } else {
      linked = linkat(
        AT_FDCWD,
        descriptor_path,
        parent,
        base_name,
        AT_SYMLINK_FOLLOW
      );
      link_error = errno;
    }
  }
  const bool temporary_closed = close(temporary) == 0;
  const bool parent_closed = close(parent) == 0;
  free(base_name);
  if (linked != 0) {
    return link_error == ENOENT
      ? AGENT_MUTATION_UNSUPPORTED
      : agent_linux_error(link_error);
  }
  return temporary_closed && parent_closed
    ? AGENT_MUTATION_CREATED
    : AGENT_MUTATION_IO;
}

static enum agent_mutation_status agent_linux_replace(
  const struct agent_mutation_request *request,
  int root
) {
  const int file = agent_openat2(
    root,
    request->relative_path,
    O_RDWR | O_CLOEXEC | O_NOFOLLOW,
    0u,
    RESOLVE_BENEATH | RESOLVE_NO_MAGICLINKS | RESOLVE_NO_SYMLINKS
  );
  if (file < 0) {
    return agent_linux_resolution_error(errno);
  }
  if (
    !agent_identity(
      file,
      request->identity_device,
      request->identity_inode,
      false
    )
  ) {
    close(file);
    return AGENT_MUTATION_CONFLICT;
  }
  struct sigaction action;
  struct sigaction previous_action;
  memset(&action, 0, sizeof(action));
  action.sa_handler = agent_lease_break;
  sigemptyset(&action.sa_mask);
  agent_lease_break_requested = 0;
  if (sigaction(SIGIO, &action, &previous_action) != 0) {
    close(file);
    return AGENT_MUTATION_UNSUPPORTED;
  }
  if (fcntl(file, F_SETOWN, getpid()) != 0) {
    sigaction(SIGIO, &previous_action, NULL);
    close(file);
    return AGENT_MUTATION_UNSUPPORTED;
  }
  if (fcntl(file, F_SETLEASE, F_WRLCK) != 0) {
    const int error = errno;
    sigaction(SIGIO, &previous_action, NULL);
    close(file);
    return error == EAGAIN
      ? AGENT_MUTATION_CONFLICT
      : agent_linux_error(error);
  }
  enum agent_mutation_status status = AGENT_MUTATION_REPLACED;
  if (
    !agent_read_expected(
      file,
      request->expected_content,
      request->expected_length
    )
  ) {
    status = AGENT_MUTATION_CONFLICT;
  }
  sigset_t blocked;
  sigset_t previous_mask;
  sigemptyset(&blocked);
  sigaddset(&blocked, SIGIO);
  bool mask_changed = false;
  if (status == AGENT_MUTATION_REPLACED) {
    if (sigprocmask(SIG_BLOCK, &blocked, &previous_mask) != 0) {
      status = AGENT_MUTATION_IO;
    } else {
      mask_changed = true;
      sigset_t pending;
      const int pending_result = sigpending(&pending);
      const int pending_signal = pending_result == 0
        ? sigismember(&pending, SIGIO)
        : -1;
      if (pending_result != 0 || pending_signal < 0) {
        status = AGENT_MUTATION_IO;
      } else if (
        agent_lease_break_requested != 0 ||
        pending_signal == 1
      ) {
        status = AGENT_MUTATION_CONFLICT;
      }
    }
  }
  if (
    status == AGENT_MUTATION_REPLACED &&
    !agent_write_complete(
      file,
      request->replacement_content,
      request->replacement_length
    )
  ) {
    status = AGENT_MUTATION_IO;
  }
  if (fcntl(file, F_SETLEASE, F_UNLCK) != 0) {
    status = AGENT_MUTATION_IO;
  }
  if (mask_changed && sigprocmask(SIG_SETMASK, &previous_mask, NULL) != 0) {
    status = AGENT_MUTATION_IO;
  }
  if (sigaction(SIGIO, &previous_action, NULL) != 0) {
    status = AGENT_MUTATION_IO;
  }
  if (close(file) != 0) {
    status = AGENT_MUTATION_IO;
  }
  return status;
}

enum agent_mutation_status agent_mutation_commit(
  const struct agent_mutation_request *request
) {
  if (request == NULL || request->root[0] != '/') {
    return AGENT_MUTATION_PERMISSION;
  }
  const int root = open(
    request->root,
    O_PATH | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
  );
  if (root < 0) {
    return agent_linux_error(errno);
  }
  struct stat root_status;
  if (
    fstat(root, &root_status) != 0 ||
    !S_ISDIR(root_status.st_mode)
  ) {
    close(root);
    return AGENT_MUTATION_PERMISSION;
  }
  const enum agent_mutation_status status =
    request->operation == AGENT_MUTATION_CREATE
      ? agent_linux_create(request, root)
      : agent_linux_replace(request, root);
  close(root);
  return status;
}
