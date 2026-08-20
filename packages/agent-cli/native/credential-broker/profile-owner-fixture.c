#include "lineage-windows.h"

#include <aclapi.h>
#include <shlobj.h>
#include <stdbool.h>
#include <stdlib.h>
#include <windows.h>

static TOKEN_USER *agent_current_account(HANDLE token) {
  DWORD length = 0u;
  if (
    GetTokenInformation(token, TokenUser, NULL, 0u, &length) != 0 ||
    GetLastError() != ERROR_INSUFFICIENT_BUFFER ||
    length == 0u
  ) {
    return NULL;
  }
  TOKEN_USER *account = malloc(length);
  if (
    account == NULL ||
    GetTokenInformation(token, TokenUser, account, length, &length) == 0
  ) {
    free(account);
    return NULL;
  }
  return account;
}

int main(int argc, char **argv) {
  (void)argv;
  if (argc != 1) {
    return 1;
  }
  HANDLE token = NULL;
  if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token) == 0) {
    return 2;
  }
  TOKEN_USER *account = agent_current_account(token);
  PWSTR profile = NULL;
  const bool resolved = SUCCEEDED(
    SHGetKnownFolderPath(&FOLDERID_Profile, KF_FLAG_DEFAULT, NULL, &profile)
  );
  HANDLE directory = resolved
    ? agent_windows_open_lineage_directory(profile)
    : INVALID_HANDLE_VALUE;
  HANDLE metadata = resolved
    ? CreateFileW(
        profile,
        FILE_READ_ATTRIBUTES | READ_CONTROL,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        NULL,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
        NULL
      )
    : INVALID_HANDLE_VALUE;
  PSID owner = NULL;
  PSECURITY_DESCRIPTOR descriptor = NULL;
  const DWORD status = metadata == INVALID_HANDLE_VALUE
    ? ERROR_INVALID_HANDLE
    : GetSecurityInfo(
        metadata,
        SE_FILE_OBJECT,
        OWNER_SECURITY_INFORMATION,
        &owner,
        NULL,
        NULL,
        NULL,
        &descriptor
      );
  int result = 3;
  if (account != NULL) {
    result = resolved ? 5 : 4;
    if (resolved && directory != INVALID_HANDLE_VALUE) {
      result = status == ERROR_SUCCESS && owner != NULL ? 7 : 6;
      if (
        status == ERROR_SUCCESS && owner != NULL &&
        EqualSid(owner, account->User.Sid) == 0
      ) {
        result = 0;
      }
    }
  }
  LocalFree(descriptor);
  if (metadata != INVALID_HANDLE_VALUE) {
    CloseHandle(metadata);
  }
  if (directory != INVALID_HANDLE_VALUE) {
    CloseHandle(directory);
  }
  CoTaskMemFree(profile);
  free(account);
  CloseHandle(token);
  return result;
}
