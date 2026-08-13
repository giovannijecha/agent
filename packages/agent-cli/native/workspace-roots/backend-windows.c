#include "workspace-roots.h"

#include <limits.h>
#include <shlobj.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <windows.h>

static char *agent_windows_utf8(const wchar_t *value) {
  if (value == NULL) {
    return NULL;
  }
  const size_t wide_length = wcslen(value);
  if (wide_length == 0u || wide_length > (size_t)INT_MAX) {
    return NULL;
  }
  const int required = WideCharToMultiByte(
    CP_UTF8,
    WC_ERR_INVALID_CHARS,
    value,
    (int)wide_length,
    NULL,
    0,
    NULL,
    NULL
  );
  if (
    required <= 0 ||
    (unsigned int)required > AGENT_WORKSPACE_ROOTS_MAX_PATH_BYTES
  ) {
    return NULL;
  }
  char *encoded = malloc((size_t)required + 1u);
  if (encoded == NULL) {
    return NULL;
  }
  const int written = WideCharToMultiByte(
    CP_UTF8,
    WC_ERR_INVALID_CHARS,
    value,
    (int)wide_length,
    encoded,
    required,
    NULL,
    NULL
  );
  if (written != required) {
    free(encoded);
    return NULL;
  }
  encoded[required] = '\0';
  return encoded;
}

static wchar_t *agent_windows_temporary_path(const wchar_t *local_data) {
  if (local_data == NULL) {
    return NULL;
  }
  const size_t base_length = wcslen(local_data);
  const bool has_separator = base_length > 0u &&
    (local_data[base_length - 1u] == L'\\' ||
      local_data[base_length - 1u] == L'/');
  static const wchar_t suffix_with_separator[] = L"\\Temp";
  static const wchar_t suffix_without_separator[] = L"Temp";
  const wchar_t *suffix = has_separator
    ? suffix_without_separator
    : suffix_with_separator;
  const size_t suffix_length = wcslen(suffix);
  if (base_length == 0u || base_length > SIZE_MAX - suffix_length - 1u) {
    return NULL;
  }
  wchar_t *temporary = calloc(
    base_length + suffix_length + 1u,
    sizeof(wchar_t)
  );
  if (temporary == NULL) {
    return NULL;
  }
  memcpy(temporary, local_data, base_length * sizeof(wchar_t));
  memcpy(
    temporary + base_length,
    suffix,
    (suffix_length + 1u) * sizeof(wchar_t)
  );
  return temporary;
}

bool agent_workspace_roots_discover(struct agent_workspace_roots *roots) {
  if (roots == NULL) {
    return false;
  }
  roots->home_directory = NULL;
  roots->temporary_directory = NULL;
  PWSTR profile = NULL;
  PWSTR local_data = NULL;
  wchar_t *temporary = NULL;
  const HRESULT initialized = CoInitializeEx(
    NULL,
    COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE
  );
  if (FAILED(initialized)) {
    return false;
  }
  const HRESULT profile_result = SHGetKnownFolderPath(
    &FOLDERID_Profile,
    KF_FLAG_DEFAULT,
    NULL,
    &profile
  );
  const HRESULT local_result = SHGetKnownFolderPath(
    &FOLDERID_LocalAppData,
    KF_FLAG_DEFAULT,
    NULL,
    &local_data
  );
  if (SUCCEEDED(profile_result) && SUCCEEDED(local_result)) {
    temporary = agent_windows_temporary_path(local_data);
    roots->home_directory = agent_windows_utf8(profile);
    roots->temporary_directory = agent_windows_utf8(temporary);
  }
  CoTaskMemFree(profile);
  CoTaskMemFree(local_data);
  free(temporary);
  CoUninitialize();
  if (
    roots->home_directory == NULL ||
    roots->temporary_directory == NULL
  ) {
    agent_workspace_roots_dispose(roots);
    return false;
  }
  return true;
}

void agent_workspace_roots_dispose(struct agent_workspace_roots *roots) {
  if (roots == NULL) {
    return;
  }
  free(roots->home_directory);
  free(roots->temporary_directory);
  roots->home_directory = NULL;
  roots->temporary_directory = NULL;
}
