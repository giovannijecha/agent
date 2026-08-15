#include "namespace-commit.h"

#include <windows.h>
#include <winternl.h>

#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#define AGENT_FILE_OPEN 1u
#define AGENT_FILE_CREATE 2u
#define AGENT_FILE_DIRECTORY_FILE 0x00000001u
#define AGENT_FILE_NON_DIRECTORY_FILE 0x00000040u
#define AGENT_FILE_SYNCHRONOUS_IO_NONALERT 0x00000020u
#define AGENT_FILE_OPEN_REPARSE_POINT 0x00200000u
#define AGENT_FILE_RENAME_INFORMATION_CLASS ((FILE_INFORMATION_CLASS)10)

#ifndef NT_SUCCESS
#define NT_SUCCESS(status) (((NTSTATUS)(status)) >= 0)
#endif

typedef NTSTATUS (NTAPI *agent_nt_create_file)(
  PHANDLE,
  ACCESS_MASK,
  POBJECT_ATTRIBUTES,
  PIO_STATUS_BLOCK,
  PLARGE_INTEGER,
  ULONG,
  ULONG,
  ULONG,
  ULONG,
  PVOID,
  ULONG
);

typedef ULONG (NTAPI *agent_nt_status_to_dos_error)(NTSTATUS);

typedef NTSTATUS (NTAPI *agent_nt_set_information_file)(
  HANDLE,
  PIO_STATUS_BLOCK,
  PVOID,
  ULONG,
  FILE_INFORMATION_CLASS
);

struct agent_windows_api {
  agent_nt_create_file create_file;
  agent_nt_set_information_file set_information_file;
  agent_nt_status_to_dos_error status_to_error;
};

struct agent_windows_rename_information {
  BOOLEAN replace_if_exists;
  HANDLE root_directory;
  ULONG file_name_length;
  wchar_t file_name[1];
};

struct agent_windows_parent {
  HANDLE handle;
  wchar_t *base_name;
};

static enum agent_namespace_status agent_windows_error(DWORD error) {
  switch (error) {
    case ERROR_FILE_EXISTS:
    case ERROR_ALREADY_EXISTS:
    case ERROR_FILE_NOT_FOUND:
    case ERROR_PATH_NOT_FOUND:
    case ERROR_SHARING_VIOLATION:
    case ERROR_DIR_NOT_EMPTY:
    case ERROR_DIRECTORY:
      return AGENT_NAMESPACE_CONFLICT;
    case ERROR_ACCESS_DENIED:
    case ERROR_PRIVILEGE_NOT_HELD:
    case ERROR_CANT_ACCESS_FILE:
    case ERROR_NOT_SAME_DEVICE:
      return AGENT_NAMESPACE_PERMISSION;
    case ERROR_NOT_SUPPORTED:
    case ERROR_CALL_NOT_IMPLEMENTED:
    case ERROR_INVALID_FUNCTION:
      return AGENT_NAMESPACE_UNSUPPORTED;
    case ERROR_FILENAME_EXCED_RANGE:
      return AGENT_NAMESPACE_LIMIT;
    default:
      return AGENT_NAMESPACE_IO;
  }
}

static bool agent_windows_api_load(struct agent_windows_api *api) {
  HMODULE module = GetModuleHandleW(L"ntdll.dll");
  if (module == NULL) {
    return false;
  }
  FARPROC create = GetProcAddress(module, "NtCreateFile");
  FARPROC convert = GetProcAddress(module, "RtlNtStatusToDosError");
  FARPROC set_information = GetProcAddress(module, "NtSetInformationFile");
  if (create == NULL || convert == NULL || set_information == NULL) {
    return false;
  }
  memcpy(&api->create_file, &create, sizeof(api->create_file));
  memcpy(
    &api->set_information_file,
    &set_information,
    sizeof(api->set_information_file)
  );
  memcpy(&api->status_to_error, &convert, sizeof(api->status_to_error));
  return true;
}

static wchar_t *agent_wide(const char *text) {
  const int required = MultiByteToWideChar(
    CP_UTF8,
    MB_ERR_INVALID_CHARS,
    text,
    -1,
    NULL,
    0
  );
  if (required <= 0) {
    return NULL;
  }
  wchar_t *wide = malloc((size_t)required * sizeof(*wide));
  if (
    wide == NULL ||
    MultiByteToWideChar(
      CP_UTF8,
      MB_ERR_INVALID_CHARS,
      text,
      -1,
      wide,
      required
    ) != required
  ) {
    free(wide);
    return NULL;
  }
  return wide;
}

static bool agent_component(const wchar_t *component) {
  const size_t length = wcslen(component);
  if (
    length == 0u ||
    component[length - 1u] == L' ' ||
    component[length - 1u] == L'.'
  ) {
    return false;
  }
  for (size_t index = 0u; index < length; index += 1u) {
    const wchar_t value = component[index];
    if (
      value == L'\\' ||
      value == L'/' ||
      value == L':' ||
      value == L'*' ||
      value == L'?' ||
      value == L'"' ||
      value == L'<' ||
      value == L'>' ||
      value == L'|'
    ) {
      return false;
    }
  }
  return true;
}

static enum agent_namespace_status agent_nt_error(
  const struct agent_windows_api *api,
  NTSTATUS status
) {
  return agent_windows_error(api->status_to_error(status));
}

static enum agent_namespace_status agent_open_relative(
  const struct agent_windows_api *api,
  HANDLE parent,
  wchar_t *name,
  ACCESS_MASK access,
  ULONG share,
  ULONG disposition,
  ULONG options,
  HANDLE *handle
) {
  const size_t length = wcslen(name);
  if (!agent_component(name) || length > 32767u) {
    return AGENT_NAMESPACE_PERMISSION;
  }
  UNICODE_STRING object_name = {
    .Length = (USHORT)(length * sizeof(wchar_t)),
    .MaximumLength = (USHORT)(length * sizeof(wchar_t)),
    .Buffer = name
  };
  OBJECT_ATTRIBUTES attributes = {
    .Length = sizeof(attributes),
    .RootDirectory = parent,
    .Attributes = OBJ_CASE_INSENSITIVE,
    .ObjectName = &object_name,
    .SecurityDescriptor = NULL,
    .SecurityQualityOfService = NULL
  };
  IO_STATUS_BLOCK status_block;
  const NTSTATUS status = api->create_file(
    handle,
    access,
    &attributes,
    &status_block,
    NULL,
    FILE_ATTRIBUTE_NORMAL,
    share,
    disposition,
    options,
    NULL,
    0u
  );
  return NT_SUCCESS(status)
    ? AGENT_NAMESPACE_DIRECTORY_CREATED
    : agent_nt_error(api, status);
}

static bool agent_identity(
  HANDLE handle,
  enum agent_namespace_entry_kind kind,
  struct agent_namespace_identity identity
) {
  BY_HANDLE_FILE_INFORMATION observed;
  if (!GetFileInformationByHandle(handle, &observed)) {
    return false;
  }
  const uint64_t inode =
    ((uint64_t)observed.nFileIndexHigh << 32u) |
    (uint64_t)observed.nFileIndexLow;
  const bool is_directory =
    (observed.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0u;
  const bool kind_matches = kind == AGENT_NAMESPACE_DIRECTORY
    ? is_directory
    : kind == AGENT_NAMESPACE_FILE && !is_directory;
  return
    (observed.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) == 0u &&
    kind_matches &&
    (uint64_t)observed.dwVolumeSerialNumber == identity.device &&
    inode == identity.inode;
}

static enum agent_namespace_status agent_open_root(
  const struct agent_namespace_request *request,
  HANDLE *root
) {
  wchar_t *wide = agent_wide(request->root);
  if (wide == NULL) {
    return AGENT_NAMESPACE_PERMISSION;
  }
  *root = CreateFileW(
    wide,
    FILE_LIST_DIRECTORY |
      FILE_ADD_FILE |
      FILE_ADD_SUBDIRECTORY |
      FILE_TRAVERSE |
      FILE_READ_ATTRIBUTES |
      SYNCHRONIZE,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    NULL,
    OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
    NULL
  );
  free(wide);
  if (*root == INVALID_HANDLE_VALUE) {
    *root = NULL;
    return agent_windows_error(GetLastError());
  }
  BY_HANDLE_FILE_INFORMATION observed;
  if (
    !GetFileInformationByHandle(*root, &observed) ||
    (observed.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0u ||
    (observed.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0u
  ) {
    CloseHandle(*root);
    *root = NULL;
    return AGENT_NAMESPACE_PERMISSION;
  }
  return AGENT_NAMESPACE_DIRECTORY_CREATED;
}

static void agent_parent_dispose(
  HANDLE root,
  struct agent_windows_parent *parent
) {
  if (parent->handle != NULL && parent->handle != root) {
    CloseHandle(parent->handle);
  }
  free(parent->base_name);
  parent->handle = NULL;
  parent->base_name = NULL;
}

static bool agent_directory_handle(HANDLE handle) {
  BY_HANDLE_FILE_INFORMATION observed;
  return
    GetFileInformationByHandle(handle, &observed) != 0 &&
    (observed.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0u &&
    (observed.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) == 0u;
}

static enum agent_namespace_status agent_parent(
  const struct agent_windows_api *api,
  HANDLE root,
  const char *relative_path,
  struct agent_windows_parent *parent
) {
  wchar_t *wide = agent_wide(relative_path);
  if (wide == NULL) {
    return AGENT_NAMESPACE_PERMISSION;
  }
  for (wchar_t *cursor = wide; *cursor != L'\0'; cursor += 1u) {
    if (*cursor == L'\\') {
      free(wide);
      return AGENT_NAMESPACE_PERMISSION;
    }
  }
  wchar_t *last_separator = wcsrchr(wide, L'/');
  wchar_t *base = last_separator == NULL ? wide : last_separator + 1u;
  const size_t base_length = wcslen(base);
  parent->base_name = malloc((base_length + 1u) * sizeof(wchar_t));
  if (parent->base_name != NULL) {
    memcpy(parent->base_name, base, (base_length + 1u) * sizeof(wchar_t));
  }
  if (parent->base_name == NULL || !agent_component(parent->base_name)) {
    free(parent->base_name);
    parent->base_name = NULL;
    free(wide);
    return AGENT_NAMESPACE_PERMISSION;
  }
  if (last_separator != NULL) {
    *last_separator = L'\0';
  }
  HANDLE current = root;
  wchar_t *component = wide;
  while (last_separator != NULL && *component != L'\0') {
    wchar_t *separator = wcschr(component, L'/');
    if (separator != NULL) {
      *separator = L'\0';
    }
    HANDLE opened = NULL;
    const enum agent_namespace_status status = agent_open_relative(
      api,
      current,
      component,
      FILE_LIST_DIRECTORY |
        FILE_ADD_FILE |
        FILE_ADD_SUBDIRECTORY |
        FILE_TRAVERSE |
        FILE_READ_ATTRIBUTES |
        SYNCHRONIZE,
      FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
      AGENT_FILE_OPEN,
      AGENT_FILE_DIRECTORY_FILE |
        AGENT_FILE_OPEN_REPARSE_POINT |
        AGENT_FILE_SYNCHRONOUS_IO_NONALERT,
      &opened
    );
    if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
      if (current != root) {
        CloseHandle(current);
      }
      free(parent->base_name);
      parent->base_name = NULL;
      free(wide);
      return status;
    }
    if (!agent_directory_handle(opened)) {
      CloseHandle(opened);
      if (current != root) {
        CloseHandle(current);
      }
      free(parent->base_name);
      parent->base_name = NULL;
      free(wide);
      return AGENT_NAMESPACE_CONFLICT;
    }
    if (current != root) {
      CloseHandle(current);
    }
    current = opened;
    if (separator == NULL) {
      break;
    }
    component = separator + 1u;
  }
  free(wide);
  parent->handle = current;
  return AGENT_NAMESPACE_DIRECTORY_CREATED;
}

static enum agent_namespace_status agent_create_directory(
  const struct agent_windows_api *api,
  const struct agent_namespace_request *request,
  HANDLE root
) {
  struct agent_windows_parent parent = { .handle = NULL, .base_name = NULL };
  enum agent_namespace_status status = agent_parent(
    api,
    root,
    request->relative_path,
    &parent
  );
  if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
    return status;
  }
  if (
    !agent_identity(
      parent.handle,
      AGENT_NAMESPACE_DIRECTORY,
      request->source_parent_identity
    )
  ) {
    agent_parent_dispose(root, &parent);
    return AGENT_NAMESPACE_CONFLICT;
  }
  HANDLE created = NULL;
  status = agent_open_relative(
    api,
    parent.handle,
    parent.base_name,
    FILE_LIST_DIRECTORY | FILE_TRAVERSE | FILE_READ_ATTRIBUTES | SYNCHRONIZE,
    0u,
    AGENT_FILE_CREATE,
    AGENT_FILE_DIRECTORY_FILE |
      AGENT_FILE_OPEN_REPARSE_POINT |
      AGENT_FILE_SYNCHRONOUS_IO_NONALERT,
    &created
  );
  agent_parent_dispose(root, &parent);
  if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
    return status;
  }
  return CloseHandle(created) != 0
    ? AGENT_NAMESPACE_DIRECTORY_CREATED
    : AGENT_NAMESPACE_IO;
}

static enum agent_namespace_status agent_open_target(
  const struct agent_windows_api *api,
  HANDLE parent,
  wchar_t *base_name,
  enum agent_namespace_entry_kind kind,
  HANDLE *target
) {
  const ULONG type = kind == AGENT_NAMESPACE_DIRECTORY
    ? AGENT_FILE_DIRECTORY_FILE
    : AGENT_FILE_NON_DIRECTORY_FILE;
  return agent_open_relative(
    api,
    parent,
    base_name,
    DELETE | FILE_READ_ATTRIBUTES | SYNCHRONIZE,
    0u,
    AGENT_FILE_OPEN,
    type | AGENT_FILE_OPEN_REPARSE_POINT | AGENT_FILE_SYNCHRONOUS_IO_NONALERT,
    target
  );
}

static enum agent_namespace_status agent_remove(
  const struct agent_windows_api *api,
  const struct agent_namespace_request *request,
  HANDLE root
) {
  struct agent_windows_parent parent = { .handle = NULL, .base_name = NULL };
  enum agent_namespace_status status = agent_parent(
    api,
    root,
    request->relative_path,
    &parent
  );
  if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
    return status;
  }
  if (
    !agent_identity(
      parent.handle,
      AGENT_NAMESPACE_DIRECTORY,
      request->source_parent_identity
    )
  ) {
    agent_parent_dispose(root, &parent);
    return AGENT_NAMESPACE_CONFLICT;
  }
  HANDLE target = NULL;
  status = agent_open_target(
    api,
    parent.handle,
    parent.base_name,
    request->entry_kind,
    &target
  );
  agent_parent_dispose(root, &parent);
  if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
    return status;
  }
  if (!agent_identity(target, request->entry_kind, request->identity)) {
    CloseHandle(target);
    return AGENT_NAMESPACE_CONFLICT;
  }
  FILE_DISPOSITION_INFO disposition = { .DeleteFile = TRUE };
  const bool removed = SetFileInformationByHandle(
    target,
    FileDispositionInfo,
    &disposition,
    sizeof(disposition)
  ) != 0;
  const DWORD error = removed ? ERROR_SUCCESS : GetLastError();
  const bool closed = CloseHandle(target) != 0;
  if (!removed) {
    return agent_windows_error(error);
  }
  return closed ? AGENT_NAMESPACE_REMOVED : AGENT_NAMESPACE_IO;
}

static enum agent_namespace_status agent_move(
  const struct agent_windows_api *api,
  const struct agent_namespace_request *request,
  HANDLE root
) {
  struct agent_windows_parent source = { .handle = NULL, .base_name = NULL };
  struct agent_windows_parent destination = {
    .handle = NULL,
    .base_name = NULL
  };
  enum agent_namespace_status status = agent_parent(
    api,
    root,
    request->relative_path,
    &source
  );
  if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
    return status;
  }
  status = agent_parent(api, root, request->destination_path, &destination);
  if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
    agent_parent_dispose(root, &source);
    return status;
  }
  if (
    !agent_identity(
      source.handle,
      AGENT_NAMESPACE_DIRECTORY,
      request->source_parent_identity
    ) ||
    !agent_identity(
      destination.handle,
      AGENT_NAMESPACE_DIRECTORY,
      request->destination_parent_identity
    )
  ) {
    agent_parent_dispose(root, &source);
    agent_parent_dispose(root, &destination);
    return AGENT_NAMESPACE_CONFLICT;
  }
  HANDLE target = NULL;
  status = agent_open_target(
    api,
    source.handle,
    source.base_name,
    request->entry_kind,
    &target
  );
  if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
    agent_parent_dispose(root, &source);
    agent_parent_dispose(root, &destination);
    return status;
  }
  if (!agent_identity(target, request->entry_kind, request->identity)) {
    CloseHandle(target);
    agent_parent_dispose(root, &source);
    agent_parent_dispose(root, &destination);
    return AGENT_NAMESPACE_CONFLICT;
  }
  const size_t name_length = wcslen(destination.base_name);
  const size_t rename_size =
    FIELD_OFFSET(struct agent_windows_rename_information, file_name) +
    name_length * sizeof(wchar_t);
  if (rename_size > (size_t)UINT32_MAX) {
    CloseHandle(target);
    agent_parent_dispose(root, &source);
    agent_parent_dispose(root, &destination);
    return AGENT_NAMESPACE_LIMIT;
  }
  struct agent_windows_rename_information *rename = calloc(1u, rename_size);
  if (rename == NULL) {
    CloseHandle(target);
    agent_parent_dispose(root, &source);
    agent_parent_dispose(root, &destination);
    return AGENT_NAMESPACE_IO;
  }
  rename->replace_if_exists = FALSE;
  rename->root_directory = destination.handle;
  rename->file_name_length = (ULONG)(name_length * sizeof(wchar_t));
  memcpy(rename->file_name, destination.base_name, rename->file_name_length);
  IO_STATUS_BLOCK status_block;
  const NTSTATUS rename_status = api->set_information_file(
    target,
    &status_block,
    rename,
    (ULONG)rename_size,
    AGENT_FILE_RENAME_INFORMATION_CLASS
  );
  free(rename);
  const bool closed = CloseHandle(target) != 0;
  agent_parent_dispose(root, &source);
  agent_parent_dispose(root, &destination);
  if (!NT_SUCCESS(rename_status)) {
    return agent_nt_error(api, rename_status);
  }
  return closed ? AGENT_NAMESPACE_MOVED : AGENT_NAMESPACE_IO;
}

enum agent_namespace_status agent_namespace_commit(
  const struct agent_namespace_request *request
) {
  if (request == NULL) {
    return AGENT_NAMESPACE_IO;
  }
  struct agent_windows_api api;
  if (!agent_windows_api_load(&api)) {
    return AGENT_NAMESPACE_UNSUPPORTED;
  }
  HANDLE root = NULL;
  enum agent_namespace_status status = agent_open_root(request, &root);
  if (status != AGENT_NAMESPACE_DIRECTORY_CREATED) {
    return status;
  }
  if (request->operation == AGENT_NAMESPACE_CREATE_DIRECTORY) {
    status = agent_create_directory(&api, request, root);
  } else if (request->operation == AGENT_NAMESPACE_MOVE) {
    status = agent_move(&api, request, root);
  } else if (request->operation == AGENT_NAMESPACE_REMOVE) {
    status = agent_remove(&api, request, root);
  } else {
    status = AGENT_NAMESPACE_UNSUPPORTED;
  }
  const bool closed = CloseHandle(root) != 0;
  return !closed && status <= AGENT_NAMESPACE_REMOVED
    ? AGENT_NAMESPACE_IO
    : status;
}
