#include "lineage-windows.h"

#include <aclapi.h>
#include <stdbool.h>

static bool agent_windows_validate_lineage_owner(
  HANDLE handle,
  PSID account,
  const struct agent_windows_lineage_observation *observation
) {
  PSID owner = NULL;
  PSECURITY_DESCRIPTOR descriptor = NULL;
  const DWORD status = GetSecurityInfo(
    handle,
    SE_FILE_OBJECT,
    OWNER_SECURITY_INFORMATION,
    &owner,
    NULL,
    NULL,
    NULL,
    &descriptor
  );
  const bool native_owner_valid = status == ERROR_SUCCESS && owner != NULL &&
    IsValidSid(owner) != 0;
  if (native_owner_valid && observation != NULL) {
    owner = observation->owner;
  }
  const bool comparable = native_owner_valid && account != NULL &&
    IsValidSid(account) != 0 && owner != NULL && IsValidSid(owner) != 0;
  const bool current_owner = comparable && EqualSid(owner, account) != 0;
  const bool alternate_owner = comparable && EqualSid(owner, account) == 0;
  const bool valid = observation == NULL
    ? current_owner || alternate_owner
    : alternate_owner;
  LocalFree(descriptor);
  return valid;
}

HANDLE agent_windows_open_lineage_directory(
  const wchar_t *path,
  PSID account,
  const struct agent_windows_lineage_observation *observation
) {
  HANDLE handle = CreateFileW(
    path,
    FILE_READ_ATTRIBUTES | READ_CONTROL | SYNCHRONIZE,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    NULL,
    OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
    NULL
  );
  FILE_ATTRIBUTE_TAG_INFO tags;
  if (
    handle == INVALID_HANDLE_VALUE ||
    GetFileInformationByHandleEx(
      handle,
      FileAttributeTagInfo,
      &tags,
      sizeof(tags)
    ) == 0 ||
    (tags.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0 ||
    (tags.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0 ||
    !agent_windows_validate_lineage_owner(handle, account, observation)
  ) {
    if (handle != INVALID_HANDLE_VALUE) {
      CloseHandle(handle);
    }
    return INVALID_HANDLE_VALUE;
  }
  return handle;
}
