#include "mutation-commit.h"

#include <windows.h>
#include <winternl.h>

#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#define AGENT_FILE_OPEN 1u
#define AGENT_FILE_CREATE 2u
#define AGENT_FILE_DIRECTORY_FILE 0x00000001u
#define AGENT_FILE_WRITE_THROUGH 0x00000002u
#define AGENT_FILE_NON_DIRECTORY_FILE 0x00000040u
#define AGENT_FILE_SYNCHRONOUS_IO_NONALERT 0x00000020u
#define AGENT_FILE_OPEN_REPARSE_POINT 0x00200000u

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

struct agent_windows_api {
  agent_nt_create_file create_file;
  agent_nt_status_to_dos_error status_to_error;
};

static enum agent_mutation_status agent_windows_error(DWORD error) {
  switch (error) {
    case ERROR_FILE_EXISTS:
    case ERROR_ALREADY_EXISTS:
    case ERROR_FILE_NOT_FOUND:
    case ERROR_PATH_NOT_FOUND:
    case ERROR_SHARING_VIOLATION:
      return AGENT_MUTATION_CONFLICT;
    case ERROR_ACCESS_DENIED:
    case ERROR_PRIVILEGE_NOT_HELD:
    case ERROR_CANT_ACCESS_FILE:
      return AGENT_MUTATION_PERMISSION;
    case ERROR_NOT_SUPPORTED:
    case ERROR_CALL_NOT_IMPLEMENTED:
    case ERROR_INVALID_FUNCTION:
      return AGENT_MUTATION_UNSUPPORTED;
    case ERROR_FILENAME_EXCED_RANGE:
      return AGENT_MUTATION_LIMIT;
    default:
      return AGENT_MUTATION_IO;
  }
}

static bool agent_windows_api_load(struct agent_windows_api *api) {
  HMODULE module = GetModuleHandleW(L"ntdll.dll");
  if (module == NULL) {
    return false;
  }
  FARPROC create = GetProcAddress(module, "NtCreateFile");
  FARPROC convert = GetProcAddress(module, "RtlNtStatusToDosError");
  if (create == NULL || convert == NULL) {
    return false;
  }
  memcpy(&api->create_file, &create, sizeof(api->create_file));
  memcpy(&api->status_to_error, &convert, sizeof(api->status_to_error));
  return true;
}

static wchar_t *agent_windows_wide(const char *text) {
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

static bool agent_windows_component(const wchar_t *component) {
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

static enum agent_mutation_status agent_windows_nt_error(
  const struct agent_windows_api *api,
  NTSTATUS status
) {
  return agent_windows_error(api->status_to_error(status));
}

static enum agent_mutation_status agent_windows_open_relative(
  const struct agent_windows_api *api,
  HANDLE parent,
  wchar_t *name,
  ACCESS_MASK access,
  ULONG share,
  ULONG disposition,
  ULONG options,
  HANDLE *handle
) {
  if (!agent_windows_component(name) || wcslen(name) > 32767u) {
    return AGENT_MUTATION_PERMISSION;
  }
  UNICODE_STRING object_name = {
    .Length = (USHORT)(wcslen(name) * sizeof(wchar_t)),
    .MaximumLength = (USHORT)(wcslen(name) * sizeof(wchar_t)),
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
    ? AGENT_MUTATION_REPLACED
    : agent_windows_nt_error(api, status);
}

static bool agent_windows_identity(
  HANDLE handle,
  uint64_t device,
  uint64_t inode,
  bool directory
) {
  BY_HANDLE_FILE_INFORMATION information;
  if (!GetFileInformationByHandle(handle, &information)) {
    return false;
  }
  const uint64_t file_index =
    ((uint64_t)information.nFileIndexHigh << 32u) |
    (uint64_t)information.nFileIndexLow;
  const bool is_directory =
    (information.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0u;
  return
    (information.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) == 0u &&
    is_directory == directory &&
    (uint64_t)information.dwVolumeSerialNumber == device &&
    file_index == inode;
}

static enum agent_mutation_status agent_windows_open_root(
  const struct agent_mutation_request *request,
  HANDLE *root
) {
  wchar_t *wide = agent_windows_wide(request->root);
  if (wide == NULL) {
    return AGENT_MUTATION_PERMISSION;
  }
  *root = CreateFileW(
    wide,
    FILE_LIST_DIRECTORY | FILE_TRAVERSE | FILE_READ_ATTRIBUTES | SYNCHRONIZE,
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
  BY_HANDLE_FILE_INFORMATION information;
  if (
    !GetFileInformationByHandle(*root, &information) ||
    (information.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0u ||
    (information.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0u
  ) {
    CloseHandle(*root);
    *root = NULL;
    return AGENT_MUTATION_PERMISSION;
  }
  return AGENT_MUTATION_REPLACED;
}

static enum agent_mutation_status agent_windows_parent(
  const struct agent_windows_api *api,
  HANDLE root,
  const char *relative_path,
  HANDLE *parent,
  wchar_t **base_name
) {
  wchar_t *wide = agent_windows_wide(relative_path);
  if (wide == NULL) {
    return AGENT_MUTATION_PERMISSION;
  }
  for (wchar_t *cursor = wide; *cursor != L'\0'; cursor += 1) {
    if (*cursor == L'\\') {
      free(wide);
      return AGENT_MUTATION_PERMISSION;
    }
  }
  wchar_t *last_separator = wcsrchr(wide, L'/');
  wchar_t *base = last_separator == NULL ? wide : last_separator + 1u;
  *base_name = _wcsdup(base);
  if (*base_name == NULL || !agent_windows_component(*base_name)) {
    free(*base_name);
    *base_name = NULL;
    free(wide);
    return AGENT_MUTATION_PERMISSION;
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
    const enum agent_mutation_status status = agent_windows_open_relative(
      api,
      current,
      component,
      FILE_LIST_DIRECTORY | FILE_TRAVERSE | FILE_READ_ATTRIBUTES | SYNCHRONIZE,
      FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
      AGENT_FILE_OPEN,
      AGENT_FILE_DIRECTORY_FILE |
        AGENT_FILE_OPEN_REPARSE_POINT |
        AGENT_FILE_SYNCHRONOUS_IO_NONALERT,
      &opened
    );
    if (status != AGENT_MUTATION_REPLACED) {
      if (current != root) {
        CloseHandle(current);
      }
      free(*base_name);
      *base_name = NULL;
      free(wide);
      return status;
    }
    BY_HANDLE_FILE_INFORMATION information;
    if (
      !GetFileInformationByHandle(opened, &information) ||
      (information.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0u ||
      (information.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0u
    ) {
      CloseHandle(opened);
      if (current != root) {
        CloseHandle(current);
      }
      free(*base_name);
      *base_name = NULL;
      free(wide);
      return AGENT_MUTATION_CONFLICT;
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
  *parent = current;
  return AGENT_MUTATION_REPLACED;
}

static bool agent_windows_seek_start(HANDLE file) {
  LARGE_INTEGER zero;
  zero.QuadPart = 0;
  return SetFilePointerEx(file, zero, NULL, FILE_BEGIN) != 0;
}

static bool agent_windows_read_expected(
  HANDLE file,
  const unsigned char *expected,
  size_t expected_length
) {
  LARGE_INTEGER size;
  if (
    !GetFileSizeEx(file, &size) ||
    size.QuadPart < 0 ||
    (uint64_t)size.QuadPart != (uint64_t)expected_length ||
    !agent_windows_seek_start(file)
  ) {
    return false;
  }
  unsigned char buffer[65536];
  size_t offset = 0u;
  while (offset < expected_length) {
    const size_t remaining = expected_length - offset;
    const DWORD requested = (DWORD)(remaining < sizeof(buffer)
      ? remaining
      : sizeof(buffer));
    DWORD received = 0u;
    if (
      !ReadFile(file, buffer, requested, &received, NULL) ||
      received == 0u ||
      received > requested ||
      memcmp(expected + offset, buffer, received) != 0
    ) {
      return false;
    }
    offset += received;
  }
  return true;
}

static bool agent_windows_write_complete(
  HANDLE file,
  const unsigned char *content,
  size_t length
) {
  if (!agent_windows_seek_start(file)) {
    return false;
  }
  size_t offset = 0u;
  while (offset < length) {
    const size_t remaining = length - offset;
    const DWORD requested = (DWORD)(remaining < 65536u ? remaining : 65536u);
    DWORD written = 0u;
    if (
      !WriteFile(file, content + offset, requested, &written, NULL) ||
      written == 0u ||
      written > requested
    ) {
      return false;
    }
    offset += written;
  }
  return SetEndOfFile(file) != 0 && FlushFileBuffers(file) != 0;
}

static enum agent_mutation_status agent_windows_replace(
  const struct agent_windows_api *api,
  const struct agent_mutation_request *request,
  HANDLE root
) {
  HANDLE parent = NULL;
  wchar_t *base_name = NULL;
  enum agent_mutation_status status = agent_windows_parent(
    api,
    root,
    request->relative_path,
    &parent,
    &base_name
  );
  if (status != AGENT_MUTATION_REPLACED) {
    return status;
  }
  HANDLE file = NULL;
  status = agent_windows_open_relative(
    api,
    parent,
    base_name,
    FILE_READ_DATA |
      FILE_WRITE_DATA |
      FILE_READ_ATTRIBUTES |
      FILE_WRITE_ATTRIBUTES |
      SYNCHRONIZE,
    0u,
    AGENT_FILE_OPEN,
    AGENT_FILE_NON_DIRECTORY_FILE |
      AGENT_FILE_OPEN_REPARSE_POINT |
      AGENT_FILE_SYNCHRONOUS_IO_NONALERT |
      AGENT_FILE_WRITE_THROUGH,
    &file
  );
  if (parent != root) {
    CloseHandle(parent);
  }
  free(base_name);
  if (status != AGENT_MUTATION_REPLACED) {
    return status;
  }
  if (
    !agent_windows_identity(
      file,
      request->identity_device,
      request->identity_inode,
      false
    ) ||
    !agent_windows_read_expected(
      file,
      request->expected_content,
      request->expected_length
    )
  ) {
    CloseHandle(file);
    return AGENT_MUTATION_CONFLICT;
  }
  const bool written = agent_windows_write_complete(
    file,
    request->replacement_content,
    request->replacement_length
  );
  const bool closed = CloseHandle(file) != 0;
  return written && closed ? AGENT_MUTATION_REPLACED : AGENT_MUTATION_IO;
}

static enum agent_mutation_status agent_windows_create(
  const struct agent_windows_api *api,
  const struct agent_mutation_request *request,
  HANDLE root
) {
  HANDLE parent = NULL;
  wchar_t *base_name = NULL;
  enum agent_mutation_status status = agent_windows_parent(
    api,
    root,
    request->relative_path,
    &parent,
    &base_name
  );
  if (status != AGENT_MUTATION_REPLACED) {
    return status;
  }
  if (
    !agent_windows_identity(
      parent,
      request->identity_device,
      request->identity_inode,
      true
    )
  ) {
    if (parent != root) {
      CloseHandle(parent);
    }
    free(base_name);
    return AGENT_MUTATION_CONFLICT;
  }
  HANDLE file = NULL;
  status = agent_windows_open_relative(
    api,
    parent,
    base_name,
    FILE_READ_DATA |
      FILE_WRITE_DATA |
      FILE_READ_ATTRIBUTES |
      FILE_WRITE_ATTRIBUTES |
      DELETE |
      SYNCHRONIZE,
    0u,
    AGENT_FILE_CREATE,
    AGENT_FILE_NON_DIRECTORY_FILE |
      AGENT_FILE_OPEN_REPARSE_POINT |
      AGENT_FILE_SYNCHRONOUS_IO_NONALERT |
      AGENT_FILE_WRITE_THROUGH,
    &file
  );
  if (status != AGENT_MUTATION_REPLACED) {
    if (parent != root) {
      CloseHandle(parent);
    }
    free(base_name);
    return status;
  }
  FILE_DISPOSITION_INFO disposition = { .DeleteFile = TRUE };
  const bool pending_delete = SetFileInformationByHandle(
    file,
    FileDispositionInfo,
    &disposition,
    sizeof(disposition)
  ) != 0;
  const bool written = pending_delete && agent_windows_write_complete(
    file,
    request->replacement_content,
    request->replacement_length
  );
  bool retained = false;
  if (written) {
    disposition.DeleteFile = FALSE;
    retained = SetFileInformationByHandle(
      file,
      FileDispositionInfo,
      &disposition,
      sizeof(disposition)
    ) != 0;
  }
  const bool closed = CloseHandle(file) != 0;
  if (parent != root) {
    CloseHandle(parent);
  }
  free(base_name);
  if (!pending_delete || !written || !closed) {
    return AGENT_MUTATION_IO;
  }
  return retained ? AGENT_MUTATION_CREATED : AGENT_MUTATION_IO;
}

enum agent_mutation_status agent_mutation_commit(
  const struct agent_mutation_request *request
) {
  if (request == NULL) {
    return AGENT_MUTATION_IO;
  }
  struct agent_windows_api api;
  if (!agent_windows_api_load(&api)) {
    return AGENT_MUTATION_UNSUPPORTED;
  }
  HANDLE root = NULL;
  const enum agent_mutation_status opened = agent_windows_open_root(
    request,
    &root
  );
  if (opened != AGENT_MUTATION_REPLACED) {
    return opened;
  }
  const enum agent_mutation_status status =
    request->operation == AGENT_MUTATION_CREATE
      ? agent_windows_create(&api, request, root)
      : agent_windows_replace(&api, request, root);
  CloseHandle(root);
  return status;
}
