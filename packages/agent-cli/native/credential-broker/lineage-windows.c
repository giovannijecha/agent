#include "lineage-windows.h"

HANDLE agent_windows_open_lineage_directory(
  const wchar_t *path,
  const struct agent_windows_lineage_observation *observation
) {
  HANDLE handle = CreateFileW(
    path,
    FILE_READ_ATTRIBUTES | SYNCHRONIZE,
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
    (
      observation != NULL &&
      (
        observation->account == NULL || observation->owner == NULL ||
        EqualSid(observation->account, observation->owner) != 0
      )
    )
  ) {
    if (handle != INVALID_HANDLE_VALUE) {
      CloseHandle(handle);
    }
    return INVALID_HANDLE_VALUE;
  }
  return handle;
}
