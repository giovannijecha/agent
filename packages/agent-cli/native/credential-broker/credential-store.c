#include "credential-store.h"

#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define AGENT_CREDENTIAL_HEADER_MAX_BYTES 128u
#define AGENT_CREDENTIAL_RECORD_MAX_BYTES 32896u
#define AGENT_CREDENTIAL_MAX_REVISION UINT64_C(9007199254740991)

struct agent_record {
  unsigned char *value;
  size_t value_length;
  uint64_t revision;
};

static void agent_clear(unsigned char *bytes, size_t length) {
  if (bytes == NULL) {
    return;
  }
  volatile unsigned char *cursor = bytes;
  while (length > 0u) {
    *cursor = 0u;
    cursor += 1;
    length -= 1u;
  }
}

static void agent_record_dispose(struct agent_record *record) {
  if (record == NULL) {
    return;
  }
  agent_clear(record->value, record->value_length);
  free(record->value);
  record->value = NULL;
  record->value_length = 0u;
  record->revision = 0u;
}

static bool agent_unicode_whitespace(uint32_t point) {
  return
    (point >= 0x0009u && point <= 0x000du) ||
    point == 0x0020u || point == 0x00a0u || point == 0x1680u ||
    (point >= 0x2000u && point <= 0x200au) ||
    point == 0x2028u || point == 0x2029u || point == 0x202fu ||
    point == 0x205fu || point == 0x3000u || point == 0xfeffu;
}

static bool agent_valid_value(
  const unsigned char *value,
  size_t length
) {
  if (value == NULL || length == 0u || length > AGENT_CREDENTIAL_KEY_MAX_BYTES) {
    return false;
  }
  size_t offset = 0u;
  size_t code_units = 0u;
  while (offset < length) {
    const unsigned char first = value[offset];
    uint32_t point = 0u;
    size_t width = 0u;
    if (first <= 0x7fu) {
      point = first;
      width = 1u;
    } else if (first >= 0xc2u && first <= 0xdfu && offset + 1u < length) {
      const unsigned char second = value[offset + 1u];
      if ((second & 0xc0u) != 0x80u) {
        return false;
      }
      point = ((uint32_t)(first & 0x1fu) << 6u) |
        (uint32_t)(second & 0x3fu);
      width = 2u;
    } else if (first >= 0xe0u && first <= 0xefu && offset + 2u < length) {
      const unsigned char second = value[offset + 1u];
      const unsigned char third = value[offset + 2u];
      if (
        (second & 0xc0u) != 0x80u || (third & 0xc0u) != 0x80u ||
        (first == 0xe0u && second < 0xa0u) ||
        (first == 0xedu && second >= 0xa0u)
      ) {
        return false;
      }
      point = ((uint32_t)(first & 0x0fu) << 12u) |
        ((uint32_t)(second & 0x3fu) << 6u) |
        (uint32_t)(third & 0x3fu);
      width = 3u;
    } else if (first >= 0xf0u && first <= 0xf4u && offset + 3u < length) {
      const unsigned char second = value[offset + 1u];
      const unsigned char third = value[offset + 2u];
      const unsigned char fourth = value[offset + 3u];
      if (
        (second & 0xc0u) != 0x80u || (third & 0xc0u) != 0x80u ||
        (fourth & 0xc0u) != 0x80u ||
        (first == 0xf0u && second < 0x90u) ||
        (first == 0xf4u && second >= 0x90u)
      ) {
        return false;
      }
      point = ((uint32_t)(first & 0x07u) << 18u) |
        ((uint32_t)(second & 0x3fu) << 12u) |
        ((uint32_t)(third & 0x3fu) << 6u) |
        (uint32_t)(fourth & 0x3fu);
      width = 4u;
    } else {
      return false;
    }
    if (
      point <= 0x001fu || (point >= 0x007fu && point <= 0x009fu) ||
      agent_unicode_whitespace(point)
    ) {
      return false;
    }
    code_units += point > 0xffffu ? 2u : 1u;
    if (code_units > 8192u) {
      return false;
    }
    offset += width;
  }
  return code_units > 0u;
}

static bool agent_parse_decimal(
  const unsigned char *bytes,
  size_t length,
  uint64_t maximum,
  uint64_t *value
) {
  if (
    bytes == NULL || value == NULL || length == 0u ||
    (length > 1u && bytes[0] == '0')
  ) {
    return false;
  }
  uint64_t parsed = 0u;
  for (size_t index = 0u; index < length; index += 1u) {
    if (bytes[index] < '0' || bytes[index] > '9') {
      return false;
    }
    const uint64_t digit = (uint64_t)(bytes[index] - '0');
    if (parsed > (maximum - digit) / 10u) {
      return false;
    }
    parsed = parsed * 10u + digit;
  }
  if (parsed == 0u || parsed > maximum) {
    return false;
  }
  *value = parsed;
  return true;
}

static bool agent_parse_header(
  const unsigned char *header,
  size_t header_length,
  uint64_t *revision,
  size_t *value_length
) {
  static const unsigned char prefix[] =
    "agent/ollama-cloud/api-key/v1\nrevision=";
  static const unsigned char length_marker[] = "\nlength=";
  if (
    header == NULL || revision == NULL || value_length == NULL ||
    header_length < sizeof(prefix) + sizeof(length_marker) + 2u ||
    header_length > AGENT_CREDENTIAL_HEADER_MAX_BYTES ||
    memcmp(header, prefix, sizeof(prefix) - 1u) != 0 ||
    header[header_length - 2u] != '\n' ||
    header[header_length - 1u] != '\n'
  ) {
    return false;
  }
  const size_t revision_start = sizeof(prefix) - 1u;
  size_t marker = revision_start;
  while (marker + sizeof(length_marker) - 1u <= header_length) {
    if (
      memcmp(header + marker, length_marker, sizeof(length_marker) - 1u) == 0
    ) {
      break;
    }
    marker += 1u;
  }
  if (
    marker == revision_start ||
    marker + sizeof(length_marker) - 1u >= header_length - 2u
  ) {
    return false;
  }
  uint64_t parsed_revision = 0u;
  uint64_t parsed_length = 0u;
  const size_t length_start = marker + sizeof(length_marker) - 1u;
  if (
    !agent_parse_decimal(
      header + revision_start,
      marker - revision_start,
      AGENT_CREDENTIAL_MAX_REVISION,
      &parsed_revision
    ) ||
    !agent_parse_decimal(
      header + length_start,
      header_length - length_start - 2u,
      AGENT_CREDENTIAL_KEY_MAX_BYTES,
      &parsed_length
    )
  ) {
    return false;
  }
  *revision = parsed_revision;
  *value_length = (size_t)parsed_length;
  return true;
}

static bool agent_encode_record(
  const unsigned char *value,
  size_t value_length,
  uint64_t revision,
  unsigned char **bytes,
  size_t *length
) {
  if (
    bytes == NULL || length == NULL ||
    revision == 0u || revision > AGENT_CREDENTIAL_MAX_REVISION ||
    !agent_valid_value(value, value_length)
  ) {
    return false;
  }
  char header[AGENT_CREDENTIAL_HEADER_MAX_BYTES + 1u];
  const int header_length = snprintf(
    header,
    sizeof(header),
    "agent/ollama-cloud/api-key/v1\nrevision=%" PRIu64
      "\nlength=%zu\n\n",
    revision,
    value_length
  );
  if (
    header_length <= 0 ||
    (size_t)header_length > AGENT_CREDENTIAL_HEADER_MAX_BYTES ||
    (size_t)header_length > AGENT_CREDENTIAL_RECORD_MAX_BYTES - value_length
  ) {
    return false;
  }
  const size_t record_length = (size_t)header_length + value_length;
  unsigned char *record = malloc(record_length);
  if (record == NULL) {
    return false;
  }
  memcpy(record, header, (size_t)header_length);
  memcpy(record + (size_t)header_length, value, value_length);
  *bytes = record;
  *length = record_length;
  return true;
}

#ifdef _WIN32

#include "lineage-windows.h"

#include <aclapi.h>
#include <sddl.h>
#include <shlobj.h>
#include <windows.h>

struct agent_platform_state {
  HANDLE lock;
  PSID account;
  wchar_t *agent_root;
  wchar_t *credentials;
  wchar_t *committed;
  wchar_t *pending;
  wchar_t *retired;
  bool exclusive;
  bool environment_present;
  bool present;
  uint64_t revision;
};

typedef HANDLE agent_record_handle;

static wchar_t *agent_windows_join(const wchar_t *left, const wchar_t *right) {
  if (left == NULL || right == NULL) {
    return NULL;
  }
  const size_t left_length = wcslen(left);
  const size_t right_length = wcslen(right);
  if (
    left_length == 0u || right_length == 0u ||
    left_length > 32760u || right_length > 32760u ||
    left_length > 32766u - right_length - 1u
  ) {
    return NULL;
  }
  wchar_t *path = calloc(left_length + right_length + 2u, sizeof(wchar_t));
  if (path == NULL) {
    return NULL;
  }
  memcpy(path, left, left_length * sizeof(wchar_t));
  path[left_length] = L'\\';
  memcpy(path + left_length + 1u, right, (right_length + 1u) * sizeof(wchar_t));
  return path;
}

static bool agent_windows_account(PSID *account) {
  HANDLE token = NULL;
  DWORD required = 0u;
  if (
    account == NULL ||
    OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token) == 0
  ) {
    return false;
  }
  (void)GetTokenInformation(token, TokenUser, NULL, 0u, &required);
  TOKEN_USER *user = required == 0u ? NULL : malloc(required);
  if (
    user == NULL ||
    GetTokenInformation(token, TokenUser, user, required, &required) == 0
  ) {
    free(user);
    CloseHandle(token);
    return false;
  }
  const DWORD sid_length = GetLengthSid(user->User.Sid);
  PSID copy = malloc(sid_length);
  const bool copied = copy != NULL &&
    CopySid(sid_length, copy, user->User.Sid) != 0;
  free(user);
  CloseHandle(token);
  if (!copied) {
    free(copy);
    return false;
  }
  *account = copy;
  return true;
}

static bool agent_windows_security(
  PSID account,
  SECURITY_ATTRIBUTES *attributes,
  SECURITY_DESCRIPTOR *descriptor,
  PACL *acl
) {
  if (
    account == NULL || attributes == NULL || descriptor == NULL || acl == NULL
  ) {
    return false;
  }
  EXPLICIT_ACCESSW access;
  memset(&access, 0, sizeof(access));
  access.grfAccessPermissions = FILE_ALL_ACCESS;
  access.grfAccessMode = SET_ACCESS;
  access.grfInheritance = NO_INHERITANCE;
  access.Trustee.TrusteeForm = TRUSTEE_IS_SID;
  access.Trustee.TrusteeType = TRUSTEE_IS_USER;
  access.Trustee.ptstrName = account;
  *acl = NULL;
  if (
    SetEntriesInAclW(1u, &access, NULL, acl) != ERROR_SUCCESS ||
    InitializeSecurityDescriptor(
      descriptor,
      SECURITY_DESCRIPTOR_REVISION
    ) == 0 ||
    SetSecurityDescriptorOwner(descriptor, account, FALSE) == 0 ||
    SetSecurityDescriptorDacl(descriptor, TRUE, *acl, FALSE) == 0 ||
    SetSecurityDescriptorControl(
      descriptor,
      SE_DACL_PROTECTED,
      SE_DACL_PROTECTED
    ) == 0
  ) {
    LocalFree(*acl);
    *acl = NULL;
    return false;
  }
  attributes->nLength = sizeof(*attributes);
  attributes->lpSecurityDescriptor = descriptor;
  attributes->bInheritHandle = FALSE;
  return true;
}

static bool agent_windows_validate_security(
  HANDLE handle,
  PSID account,
  bool exact
) {
  PSID owner = NULL;
  PACL dacl = NULL;
  PSECURITY_DESCRIPTOR descriptor = NULL;
  const DWORD status = GetSecurityInfo(
    handle,
    SE_FILE_OBJECT,
    OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
    &owner,
    NULL,
    &dacl,
    NULL,
    &descriptor
  );
  bool valid = status == ERROR_SUCCESS && owner != NULL &&
    EqualSid(owner, account) != 0 && dacl != NULL;
  if (valid && exact) {
    SECURITY_DESCRIPTOR_CONTROL control = 0u;
    DWORD revision = 0u;
    ACL_SIZE_INFORMATION size;
    memset(&size, 0, sizeof(size));
    valid = GetSecurityDescriptorControl(descriptor, &control, &revision) != 0 &&
      (control & SE_DACL_PROTECTED) != 0 &&
      GetAclInformation(
        dacl,
        &size,
        sizeof(size),
        AclSizeInformation
      ) != 0 &&
      size.AceCount == 1u;
    if (valid) {
      void *entry = NULL;
      valid = GetAce(dacl, 0u, &entry) != 0 && entry != NULL;
      if (valid) {
        const ACCESS_ALLOWED_ACE *allow = entry;
        PSID sid = (PSID)&allow->SidStart;
        valid = allow->Header.AceType == ACCESS_ALLOWED_ACE_TYPE &&
          allow->Header.AceFlags == 0u &&
          allow->Mask == FILE_ALL_ACCESS &&
          EqualSid(sid, account) != 0;
      }
    }
  }
  LocalFree(descriptor);
  return valid;
}

static bool agent_windows_validate_handle(
  HANDLE handle,
  PSID account,
  bool directory,
  bool exact,
  bool link_one,
  bool empty
) {
  BY_HANDLE_FILE_INFORMATION information;
  FILE_ATTRIBUTE_TAG_INFO tags;
  if (
    handle == INVALID_HANDLE_VALUE ||
    GetFileInformationByHandle(handle, &information) == 0 ||
    GetFileInformationByHandleEx(
      handle,
      FileAttributeTagInfo,
      &tags,
      sizeof(tags)
    ) == 0 ||
    (tags.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0 ||
    (((tags.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) != directory) ||
    (link_one && information.nNumberOfLinks != 1u) ||
    (empty && (information.nFileSizeHigh != 0u || information.nFileSizeLow != 0u))
  ) {
    return false;
  }
  return agent_windows_validate_security(handle, account, exact);
}

static HANDLE agent_windows_open_directory(
  const wchar_t *path,
  PSID account,
  bool exact
) {
  HANDLE handle = CreateFileW(
    path,
    FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES | READ_CONTROL | SYNCHRONIZE,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    NULL,
    OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
    NULL
  );
  if (!agent_windows_validate_handle(handle, account, true, exact, false, false)) {
    if (handle != INVALID_HANDLE_VALUE) {
      CloseHandle(handle);
    }
    return INVALID_HANDLE_VALUE;
  }
  return handle;
}

#ifdef AGENT_CREDENTIAL_FIXTURE
static PWSTR agent_windows_fixture_lineage(PSID account) {
  PWSTR path = NULL;
  if (
    FAILED(
      SHGetKnownFolderPath(&FOLDERID_Public, KF_FLAG_DEFAULT, NULL, &path)
    )
  ) {
    CoTaskMemFree(path);
    return NULL;
  }
  HANDLE metadata = CreateFileW(
    path,
    FILE_READ_ATTRIBUTES | READ_CONTROL,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    NULL,
    OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
    NULL
  );
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
  unsigned char system_buffer[SECURITY_MAX_SID_SIZE];
  DWORD system_length = sizeof(system_buffer);
  unsigned char administrators_buffer[SECURITY_MAX_SID_SIZE];
  DWORD administrators_length = sizeof(administrators_buffer);
  bool administrative_owner = false;
  if (
    status == ERROR_SUCCESS && owner != NULL &&
    CreateWellKnownSid(
      WinLocalSystemSid,
      NULL,
      system_buffer,
      &system_length
    ) != 0 &&
    CreateWellKnownSid(
      WinBuiltinAdministratorsSid,
      NULL,
      administrators_buffer,
      &administrators_length
    ) != 0
  ) {
    administrative_owner = EqualSid(owner, system_buffer) != 0 ||
      EqualSid(owner, administrators_buffer) != 0;
  }
  const bool valid = administrative_owner && EqualSid(owner, account) == 0;
  LocalFree(descriptor);
  if (metadata != INVALID_HANDLE_VALUE) {
    CloseHandle(metadata);
  }
  if (!valid) {
    CoTaskMemFree(path);
    return NULL;
  }
  return path;
}
#endif

static bool agent_windows_ensure_directory(
  const wchar_t *path,
  PSID account,
  bool exact
) {
  SECURITY_ATTRIBUTES attributes;
  SECURITY_DESCRIPTOR descriptor;
  PACL acl = NULL;
  if (!agent_windows_security(account, &attributes, &descriptor, &acl)) {
    return false;
  }
  const BOOL created = CreateDirectoryW(path, &attributes);
  const DWORD error = created != 0 ? ERROR_SUCCESS : GetLastError();
  LocalFree(acl);
  if (created == 0 && error != ERROR_ALREADY_EXISTS) {
    return false;
  }
  HANDLE handle = exact
    ? agent_windows_open_directory(path, account, true)
    : agent_windows_open_lineage_directory(path);
  if (handle == INVALID_HANDLE_VALUE) {
    return false;
  }
  CloseHandle(handle);
  return true;
}

static HANDLE agent_windows_open_file(
  const wchar_t *path,
  PSID account,
  DWORD access,
  DWORD sharing,
  bool empty
) {
  HANDLE handle = CreateFileW(
    path,
    access | FILE_READ_ATTRIBUTES | READ_CONTROL,
    sharing,
    NULL,
    OPEN_EXISTING,
    FILE_FLAG_OPEN_REPARSE_POINT,
    NULL
  );
  if (!agent_windows_validate_handle(handle, account, false, true, true, empty)) {
    if (handle != INVALID_HANDLE_VALUE) {
      CloseHandle(handle);
    }
    return INVALID_HANDLE_VALUE;
  }
  return handle;
}

static bool agent_windows_ensure_lock(struct agent_platform_state *state) {
  wchar_t *path = agent_windows_join(
    state->agent_root,
    L".ollama-cloud-credential.lock"
  );
  if (path == NULL) {
    return false;
  }
  SECURITY_ATTRIBUTES attributes;
  SECURITY_DESCRIPTOR descriptor;
  PACL acl = NULL;
  if (!agent_windows_security(state->account, &attributes, &descriptor, &acl)) {
    free(path);
    return false;
  }
  HANDLE created = CreateFileW(
    path,
    GENERIC_READ | GENERIC_WRITE | READ_CONTROL,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    &attributes,
    CREATE_NEW,
    FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT,
    NULL
  );
  const DWORD error = created == INVALID_HANDLE_VALUE
    ? GetLastError()
    : ERROR_SUCCESS;
  LocalFree(acl);
  if (created != INVALID_HANDLE_VALUE) {
    CloseHandle(created);
  } else if (error != ERROR_FILE_EXISTS && error != ERROR_ALREADY_EXISTS) {
    free(path);
    return false;
  }
  state->lock = agent_windows_open_file(
    path,
    state->account,
    GENERIC_READ | GENERIC_WRITE,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    true
  );
  free(path);
  return state->lock != INVALID_HANDLE_VALUE;
}

static int agent_windows_lock(struct agent_platform_state *state) {
  OVERLAPPED range;
  memset(&range, 0, sizeof(range));
  DWORD flags = LOCKFILE_FAIL_IMMEDIATELY;
  if (state->exclusive) {
    flags |= LOCKFILE_EXCLUSIVE_LOCK;
  }
  if (LockFileEx(state->lock, flags, 0u, 1u, 0u, &range) != 0) {
    return 1;
  }
  return GetLastError() == ERROR_LOCK_VIOLATION ? 0 : -1;
}

static bool agent_windows_inventory(
  struct agent_platform_state *state,
  bool *committed,
  bool *pending,
  bool *retired
) {
  wchar_t *pattern = agent_windows_join(state->credentials, L"*");
  if (pattern == NULL) {
    return false;
  }
  *committed = false;
  *pending = false;
  *retired = false;
  WIN32_FIND_DATAW entry;
  HANDLE search = FindFirstFileW(pattern, &entry);
  free(pattern);
  if (search == INVALID_HANDLE_VALUE) {
    return GetLastError() == ERROR_FILE_NOT_FOUND;
  }
  bool valid = true;
  do {
    if (wcscmp(entry.cFileName, L".") == 0 || wcscmp(entry.cFileName, L"..") == 0) {
      continue;
    }
    bool *slot = NULL;
    if (wcscmp(entry.cFileName, L"ollama-cloud.api-key") == 0) {
      slot = committed;
    } else if (wcscmp(entry.cFileName, L".ollama-cloud.api-key.pending") == 0) {
      slot = pending;
    } else if (wcscmp(entry.cFileName, L".ollama-cloud.api-key.retired") == 0) {
      slot = retired;
    }
    if (slot == NULL || *slot) {
      valid = false;
      break;
    }
    *slot = true;
  } while (FindNextFileW(search, &entry) != 0);
  const DWORD error = GetLastError();
  FindClose(search);
  return valid && error == ERROR_NO_MORE_FILES;
}

static bool agent_windows_delete_recovery(
  struct agent_platform_state *state,
  const wchar_t *path
) {
  HANDLE handle = agent_windows_open_file(
    path,
    state->account,
    DELETE,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    false
  );
  if (handle == INVALID_HANDLE_VALUE) {
    return false;
  }
  BY_HANDLE_FILE_INFORMATION information;
  const bool bounded = GetFileInformationByHandle(handle, &information) != 0 &&
    information.nFileSizeHigh == 0u &&
    information.nFileSizeLow <= AGENT_CREDENTIAL_RECORD_MAX_BYTES;
  CloseHandle(handle);
  return bounded && DeleteFileW(path) != 0;
}

static bool agent_platform_recover(
  struct agent_platform_state *state,
  bool committed,
  bool pending,
  bool retired
) {
  if (pending && retired) {
    return false;
  }
  if (pending) {
    return agent_windows_delete_recovery(state, state->pending);
  }
  if (retired && !committed) {
    return agent_windows_delete_recovery(state, state->retired);
  }
  return !retired;
}

static bool agent_platform_open_record(
  struct agent_platform_state *state,
  agent_record_handle *record,
  uint64_t *size
) {
  *record = agent_windows_open_file(
    state->committed,
    state->account,
    GENERIC_READ,
    FILE_SHARE_READ,
    false
  );
  if (*record == INVALID_HANDLE_VALUE) {
    return false;
  }
  LARGE_INTEGER length;
  if (
    GetFileSizeEx(*record, &length) == 0 || length.QuadPart <= 0 ||
    (uint64_t)length.QuadPart > AGENT_CREDENTIAL_RECORD_MAX_BYTES
  ) {
    CloseHandle(*record);
    *record = INVALID_HANDLE_VALUE;
    return false;
  }
  *size = (uint64_t)length.QuadPart;
  return true;
}

static bool agent_platform_read_at(
  agent_record_handle record,
  uint64_t offset,
  unsigned char *bytes,
  size_t length
) {
  if (length > (size_t)UINT32_MAX || offset > (uint64_t)INT64_MAX) {
    return false;
  }
  OVERLAPPED position;
  memset(&position, 0, sizeof(position));
  position.Offset = (DWORD)(offset & UINT64_C(0xffffffff));
  position.OffsetHigh = (DWORD)(offset >> 32u);
  DWORD read = 0u;
  return ReadFile(record, bytes, (DWORD)length, &read, &position) != 0 &&
    read == (DWORD)length;
}

static void agent_platform_close_record(agent_record_handle record) {
  if (record != INVALID_HANDLE_VALUE) {
    CloseHandle(record);
  }
}

static bool agent_windows_write_record(
  struct agent_platform_state *state,
  const unsigned char *bytes,
  size_t length
) {
  SECURITY_ATTRIBUTES attributes;
  SECURITY_DESCRIPTOR descriptor;
  PACL acl = NULL;
  if (!agent_windows_security(state->account, &attributes, &descriptor, &acl)) {
    return false;
  }
  HANDLE file = CreateFileW(
    state->pending,
    GENERIC_READ | GENERIC_WRITE | READ_CONTROL,
    0u,
    &attributes,
    CREATE_NEW,
    FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT,
    NULL
  );
  LocalFree(acl);
  if (file == INVALID_HANDLE_VALUE) {
    return false;
  }
  bool written = agent_windows_validate_handle(
    file,
    state->account,
    false,
    true,
    true,
    true
  );
  size_t offset = 0u;
  while (written && offset < length) {
    const DWORD remaining = (DWORD)(length - offset);
    DWORD count = 0u;
    written = WriteFile(file, bytes + offset, remaining, &count, NULL) != 0 &&
      count > 0u;
    offset += count;
  }
  written = written && FlushFileBuffers(file) != 0;
  CloseHandle(file);
  return written;
}

#ifdef AGENT_CREDENTIAL_FIXTURE
static bool agent_windows_fixture_stop(const wchar_t *name) {
  const DWORD attributes = GetFileAttributesW(name);
  return attributes != INVALID_FILE_ATTRIBUTES &&
    (attributes & FILE_ATTRIBUTE_DIRECTORY) == 0u;
}
#endif

static bool agent_platform_publish(
  struct agent_platform_state *state,
  const unsigned char *bytes,
  size_t length,
  bool replace
) {
  if (!agent_windows_write_record(state, bytes, length)) {
    return false;
  }
#ifdef AGENT_CREDENTIAL_FIXTURE
  if (agent_windows_fixture_stop(L".fixture-stop-after-stage")) {
    return false;
  }
#endif
  if (replace) {
    return ReplaceFileW(
      state->committed,
      state->pending,
      NULL,
      0u,
      NULL,
      NULL
    ) != 0;
  }
  return MoveFileExW(
    state->pending,
    state->committed,
    MOVEFILE_WRITE_THROUGH
  ) != 0;
}

static bool agent_platform_remove(struct agent_platform_state *state) {
  if (MoveFileExW(
    state->committed,
    state->retired,
    MOVEFILE_WRITE_THROUGH
  ) == 0) {
    return false;
  }
#ifdef AGENT_CREDENTIAL_FIXTURE
  if (agent_windows_fixture_stop(L".fixture-stop-after-retire")) {
    return false;
  }
#endif
  return agent_windows_delete_recovery(state, state->retired);
}

static struct agent_platform_state *agent_platform_open(
  bool exclusive,
  bool environment_present,
  bool *busy,
  bool *present
) {
  *busy = false;
  *present = false;
  struct agent_platform_state *state = calloc(1u, sizeof(*state));
  if (state == NULL) {
    return NULL;
  }
  state->lock = INVALID_HANDLE_VALUE;
  state->exclusive = exclusive;
  state->environment_present = environment_present;
  PWSTR lineage = NULL;
  wchar_t *state_home = NULL;
  if (!agent_windows_account(&state->account)) {
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
#ifdef AGENT_CREDENTIAL_FIXTURE
  const DWORD home_length = GetCurrentDirectoryW(0u, NULL);
  state_home = home_length == 0u
    ? NULL
    : calloc(home_length, sizeof(wchar_t));
  lineage = agent_windows_fixture_lineage(state->account);
  if (
    state_home == NULL ||
    GetCurrentDirectoryW(home_length, state_home) == 0u ||
    lineage == NULL
  ) {
    free(state_home);
    CoTaskMemFree(lineage);
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
#else
  if (
    FAILED(
      SHGetKnownFolderPath(&FOLDERID_Profile, KF_FLAG_DEFAULT, NULL, &lineage)
    )
  ) {
    CoTaskMemFree(lineage);
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  state_home = lineage;
#endif
  HANDLE home_handle = agent_windows_open_lineage_directory(lineage);
  state->agent_root = agent_windows_join(state_home, L".agent");
#ifdef AGENT_CREDENTIAL_FIXTURE
  free(state_home);
#endif
  CoTaskMemFree(lineage);
  if (home_handle == INVALID_HANDLE_VALUE || state->agent_root == NULL) {
    if (home_handle != INVALID_HANDLE_VALUE) CloseHandle(home_handle);
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  CloseHandle(home_handle);
  state->credentials = agent_windows_join(state->agent_root, L"credentials");
  state->committed = agent_windows_join(state->credentials, L"ollama-cloud.api-key");
  state->pending = agent_windows_join(state->credentials, L".ollama-cloud.api-key.pending");
  state->retired = agent_windows_join(state->credentials, L".ollama-cloud.api-key.retired");
  if (
    state->credentials == NULL || state->committed == NULL ||
    state->pending == NULL || state->retired == NULL ||
    !agent_windows_ensure_directory(state->agent_root, state->account, false) ||
    !agent_windows_ensure_lock(state)
  ) {
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  const int locked = agent_windows_lock(state);
  if (locked <= 0) {
    *busy = locked == 0;
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  if (!agent_windows_ensure_directory(state->credentials, state->account, true)) {
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  bool committed = false;
  bool pending = false;
  bool retired = false;
  if (
    !agent_windows_inventory(state, &committed, &pending, &retired) ||
    (exclusive && !agent_platform_recover(state, committed, pending, retired))
  ) {
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  if (exclusive && (pending || retired)) {
    if (!agent_windows_inventory(state, &committed, &pending, &retired)) {
      agent_credential_store_close(&(struct agent_credential_session){ .state = state });
      return NULL;
    }
  }
  if ((!exclusive && (pending || retired)) || pending || retired) {
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  state->present = committed;
  *present = committed;
  return state;
}

#else

#include <dirent.h>
#include <fcntl.h>
#include <linux/openat2.h>
#include <pwd.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <unistd.h>

struct agent_platform_state {
  int home;
  int root;
  int credentials;
  int lock;
  bool exclusive;
  bool environment_present;
  bool present;
  uint64_t revision;
};

typedef int agent_record_handle;

static int agent_linux_openat2(
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

static bool agent_linux_validate(
  int descriptor,
  bool directory,
  bool exact_mode,
  bool link_one,
  bool empty
) {
  struct stat observed;
  if (descriptor < 0 || fstat(descriptor, &observed) != 0) {
    return false;
  }
  const bool kind = directory ? S_ISDIR(observed.st_mode) : S_ISREG(observed.st_mode);
  const mode_t expected = directory ? 0700u : 0600u;
  return kind && observed.st_uid == geteuid() &&
    (!exact_mode || (observed.st_mode & 07777u) == expected) &&
    (!link_one || observed.st_nlink == 1) &&
    (!empty || observed.st_size == 0);
}

static bool agent_linux_ensure_directory(
  int parent,
  const char *name,
  int *descriptor
) {
  if (mkdirat(parent, name, 0700u) != 0 && errno != EEXIST) {
    return false;
  }
  *descriptor = openat(
    parent,
    name,
    O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW
  );
  return agent_linux_validate(*descriptor, true, true, false, false);
}

static bool agent_linux_ensure_lock(struct agent_platform_state *state) {
  const char *name = ".ollama-cloud-credential.lock";
  int created = openat(
    state->root,
    name,
    O_RDWR | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW,
    0600u
  );
  if (created >= 0) {
    if (fchmod(created, 0600u) != 0 || fsync(created) != 0) {
      close(created);
      return false;
    }
    close(created);
    if (fsync(state->root) != 0) {
      return false;
    }
  } else if (errno != EEXIST) {
    return false;
  }
  state->lock = openat(
    state->root,
    name,
    O_RDWR | O_CLOEXEC | O_NOFOLLOW
  );
  return agent_linux_validate(state->lock, false, true, true, true);
}

static int agent_linux_lock(struct agent_platform_state *state) {
  struct flock range = {
    .l_type = state->exclusive ? F_WRLCK : F_RDLCK,
    .l_whence = SEEK_SET,
    .l_start = 0,
    .l_len = 1,
    .l_pid = 0
  };
  if (fcntl(state->lock, F_OFD_SETLK, &range) == 0) {
    return 1;
  }
  return errno == EACCES || errno == EAGAIN ? 0 : -1;
}

static bool agent_linux_inventory(
  struct agent_platform_state *state,
  bool *committed,
  bool *pending,
  bool *retired
) {
  const int opened = openat(
    state->credentials,
    ".",
    O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW
  );
  if (!agent_linux_validate(opened, true, true, false, false)) {
    if (opened >= 0) {
      close(opened);
    }
    return false;
  }
  DIR *directory = fdopendir(opened);
  if (directory == NULL) {
    close(opened);
    return false;
  }
  *committed = false;
  *pending = false;
  *retired = false;
  bool valid = true;
  errno = 0;
  for (struct dirent *entry = readdir(directory); entry != NULL; entry = readdir(directory)) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
      continue;
    }
    bool *slot = NULL;
    if (strcmp(entry->d_name, "ollama-cloud.api-key") == 0) {
      slot = committed;
    } else if (strcmp(entry->d_name, ".ollama-cloud.api-key.pending") == 0) {
      slot = pending;
    } else if (strcmp(entry->d_name, ".ollama-cloud.api-key.retired") == 0) {
      slot = retired;
    }
    if (slot == NULL || *slot) {
      valid = false;
      break;
    }
    *slot = true;
  }
  const int read_error = errno;
  closedir(directory);
  return valid && read_error == 0;
}

static bool agent_linux_delete_recovery(
  struct agent_platform_state *state,
  const char *name
) {
  const int file = openat(
    state->credentials,
    name,
    O_RDONLY | O_CLOEXEC | O_NOFOLLOW
  );
  struct stat observed;
  const bool valid = agent_linux_validate(file, false, true, true, false) &&
    fstat(file, &observed) == 0 && observed.st_size >= 0 &&
    (uint64_t)observed.st_size <= AGENT_CREDENTIAL_RECORD_MAX_BYTES;
  if (file >= 0) {
    close(file);
  }
  return valid && unlinkat(state->credentials, name, 0) == 0 &&
    fsync(state->credentials) == 0;
}

static bool agent_platform_recover(
  struct agent_platform_state *state,
  bool committed,
  bool pending,
  bool retired
) {
  if (pending && retired) {
    return false;
  }
  if (pending) {
    return agent_linux_delete_recovery(
      state,
      ".ollama-cloud.api-key.pending"
    );
  }
  if (retired && !committed) {
    return agent_linux_delete_recovery(
      state,
      ".ollama-cloud.api-key.retired"
    );
  }
  return !retired;
}

static bool agent_platform_open_record(
  struct agent_platform_state *state,
  agent_record_handle *record,
  uint64_t *size
) {
  *record = openat(
    state->credentials,
    "ollama-cloud.api-key",
    O_RDONLY | O_CLOEXEC | O_NOFOLLOW
  );
  struct stat observed;
  if (
    !agent_linux_validate(*record, false, true, true, false) ||
    fstat(*record, &observed) != 0 || observed.st_size <= 0 ||
    (uint64_t)observed.st_size > AGENT_CREDENTIAL_RECORD_MAX_BYTES
  ) {
    if (*record >= 0) close(*record);
    *record = -1;
    return false;
  }
  *size = (uint64_t)observed.st_size;
  return true;
}

static bool agent_platform_read_at(
  agent_record_handle record,
  uint64_t offset,
  unsigned char *bytes,
  size_t length
) {
  size_t read_length = 0u;
  while (read_length < length) {
    const ssize_t count = pread(
      record,
      bytes + read_length,
      length - read_length,
      (off_t)(offset + read_length)
    );
    if (count <= 0) {
      return false;
    }
    read_length += (size_t)count;
  }
  return true;
}

static void agent_platform_close_record(agent_record_handle record) {
  if (record >= 0) close(record);
}

static bool agent_linux_write_all(
  int file,
  const unsigned char *bytes,
  size_t length
) {
  size_t offset = 0u;
  while (offset < length) {
    const ssize_t count = write(file, bytes + offset, length - offset);
    if (count <= 0) {
      return false;
    }
    offset += (size_t)count;
  }
  return true;
}

#ifdef AGENT_CREDENTIAL_FIXTURE
static bool agent_linux_fixture_stop(const char *name) {
  struct stat observed;
  return lstat(name, &observed) == 0 && S_ISREG(observed.st_mode);
}
#endif

static bool agent_platform_publish(
  struct agent_platform_state *state,
  const unsigned char *bytes,
  size_t length,
  bool replace
) {
  const char *pending = ".ollama-cloud.api-key.pending";
  const char *committed = "ollama-cloud.api-key";
  const int file = openat(
    state->credentials,
    pending,
    O_RDWR | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW,
    0600u
  );
  if (file < 0) {
    return false;
  }
  const bool staged = fchmod(file, 0600u) == 0 &&
    agent_linux_validate(file, false, true, true, true) &&
    agent_linux_write_all(file, bytes, length) && fsync(file) == 0;
  close(file);
  if (!staged || fsync(state->credentials) != 0) {
    return false;
  }
#ifdef AGENT_CREDENTIAL_FIXTURE
  if (agent_linux_fixture_stop(".fixture-stop-after-stage")) {
    return false;
  }
#endif
  int renamed;
  if (replace) {
    renamed = renameat(
      state->credentials,
      pending,
      state->credentials,
      committed
    );
  } else {
    renamed = (int)syscall(
      SYS_renameat2,
      state->credentials,
      pending,
      state->credentials,
      committed,
      RENAME_NOREPLACE
    );
  }
  return renamed == 0 && fsync(state->credentials) == 0;
}

static bool agent_platform_remove(struct agent_platform_state *state) {
  const int retired = (int)syscall(
    SYS_renameat2,
    state->credentials,
    "ollama-cloud.api-key",
    state->credentials,
    ".ollama-cloud.api-key.retired",
    RENAME_NOREPLACE
  );
  if (retired != 0 || fsync(state->credentials) != 0) {
    return false;
  }
#ifdef AGENT_CREDENTIAL_FIXTURE
  if (agent_linux_fixture_stop(".fixture-stop-after-retire")) {
    return false;
  }
#endif
  return agent_linux_delete_recovery(
      state,
      ".ollama-cloud.api-key.retired"
    );
}

static struct agent_platform_state *agent_platform_open(
  bool exclusive,
  bool environment_present,
  bool *busy,
  bool *present
) {
  *busy = false;
  *present = false;
  struct agent_platform_state *state = calloc(1u, sizeof(*state));
  if (state == NULL) {
    return NULL;
  }
  state->home = -1;
  state->root = -1;
  state->credentials = -1;
  state->lock = -1;
  state->exclusive = exclusive;
  state->environment_present = environment_present;
  const char *home_path = NULL;
#ifdef AGENT_CREDENTIAL_FIXTURE
  char fixture_home[4096];
  home_path = getcwd(fixture_home, sizeof(fixture_home));
#else
  char account_buffer[65536];
  struct passwd account;
  struct passwd *found = NULL;
  if (getpwuid_r(
    geteuid(),
    &account,
    account_buffer,
    sizeof(account_buffer),
    &found
  ) == 0 && found != NULL) {
    home_path = account.pw_dir;
  }
#endif
  if (home_path == NULL || home_path[0] != '/') {
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  state->home = agent_linux_openat2(
    AT_FDCWD,
    home_path,
    O_RDONLY | O_DIRECTORY | O_CLOEXEC,
    RESOLVE_NO_MAGICLINKS | RESOLVE_NO_SYMLINKS
  );
  if (
    !agent_linux_validate(state->home, true, false, false, false) ||
    !agent_linux_ensure_directory(state->home, ".agent", &state->root) ||
    !agent_linux_ensure_lock(state)
  ) {
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  const int locked = agent_linux_lock(state);
  if (locked <= 0) {
    *busy = locked == 0;
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  if (!agent_linux_ensure_directory(
    state->root,
    "credentials",
    &state->credentials
  )) {
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  bool committed = false;
  bool pending = false;
  bool retired = false;
  if (
    !agent_linux_inventory(state, &committed, &pending, &retired) ||
    (exclusive && !agent_platform_recover(state, committed, pending, retired))
  ) {
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  if (exclusive && (pending || retired)) {
    if (!agent_linux_inventory(state, &committed, &pending, &retired)) {
      agent_credential_store_close(&(struct agent_credential_session){ .state = state });
      return NULL;
    }
  }
  if ((!exclusive && (pending || retired)) || pending || retired) {
    agent_credential_store_close(&(struct agent_credential_session){ .state = state });
    return NULL;
  }
  state->present = committed;
  *present = committed;
  return state;
}

#endif

static bool agent_open_record_envelope(
  struct agent_platform_state *state,
  agent_record_handle *file,
  size_t *header_length,
  size_t *value_length,
  uint64_t *revision
) {
  uint64_t file_size = 0u;
  if (
    file == NULL || header_length == NULL || value_length == NULL ||
    revision == NULL || !agent_platform_open_record(state, file, &file_size)
  ) {
    return false;
  }
  unsigned char header[AGENT_CREDENTIAL_HEADER_MAX_BYTES];
  size_t observed_header_length = 0u;
  bool complete = false;
  while (
    observed_header_length < sizeof(header) &&
    observed_header_length < file_size
  ) {
    if (!agent_platform_read_at(
      *file,
      observed_header_length,
      header + observed_header_length,
      1u
    )) {
      agent_platform_close_record(*file);
      return false;
    }
    observed_header_length += 1u;
    if (
      observed_header_length >= 2u &&
      header[observed_header_length - 2u] == '\n' &&
      header[observed_header_length - 1u] == '\n'
    ) {
      complete = true;
      break;
    }
  }
  if (
    !complete ||
    !agent_parse_header(
      header,
      observed_header_length,
      revision,
      value_length
    ) ||
    file_size != (uint64_t)observed_header_length + *value_length
  ) {
    agent_platform_close_record(*file);
    return false;
  }
  *header_length = observed_header_length;
  return true;
}

static bool agent_read_record_value(
  agent_record_handle file,
  size_t header_length,
  size_t value_length,
  uint64_t revision,
  struct agent_record *record
) {
  unsigned char *value = malloc(value_length);
  if (
    value == NULL ||
    !agent_platform_read_at(file, header_length, value, value_length)
  ) {
    agent_clear(value, value_length);
    free(value);
    agent_platform_close_record(file);
    return false;
  }
  agent_platform_close_record(file);
  if (!agent_valid_value(value, value_length)) {
    agent_clear(value, value_length);
    free(value);
    return false;
  }
  record->value = value;
  record->value_length = value_length;
  record->revision = revision;
  return true;
}

static bool agent_read_record(
  struct agent_platform_state *state,
  struct agent_record *record
) {
  agent_record_handle file;
  size_t header_length = 0u;
  size_t value_length = 0u;
  uint64_t revision = 0u;
  return agent_open_record_envelope(
    state,
    &file,
    &header_length,
    &value_length,
    &revision
  ) && agent_read_record_value(
    file,
    header_length,
    value_length,
    revision,
    record
  );
}

bool agent_credential_store_open(
  bool exclusive,
  bool environment_present,
  struct agent_credential_session *session,
  enum agent_credential_response_kind *response,
  unsigned char **value,
  size_t *value_length
) {
  if (
    session == NULL || response == NULL || value == NULL || value_length == NULL ||
    session->state != NULL
  ) {
    return false;
  }
  *value = NULL;
  *value_length = 0u;
  bool busy = false;
  bool present = false;
  struct agent_platform_state *state = agent_platform_open(
    exclusive,
    environment_present,
    &busy,
    &present
  );
  if (state == NULL) {
    *response = busy ? AGENT_CREDENTIAL_BUSY : AGENT_CREDENTIAL_STORE_FAILURE;
    return true;
  }
  session->state = state;
  if (!present) {
    *response = AGENT_CREDENTIAL_ABSENT;
    return true;
  }
  agent_record_handle file;
  size_t header_length = 0u;
  size_t record_value_length = 0u;
  uint64_t revision = 0u;
  if (!agent_open_record_envelope(
    state,
    &file,
    &header_length,
    &record_value_length,
    &revision
  )) {
    *response = AGENT_CREDENTIAL_STORE_FAILURE;
    agent_credential_store_close(session);
    return true;
  }
  if (environment_present) {
    agent_platform_close_record(file);
    *response = AGENT_CREDENTIAL_DUAL_AUTHORITY;
    agent_credential_store_close(session);
    return true;
  }
  struct agent_record record = {
    .value = NULL,
    .value_length = 0u,
    .revision = 0u
  };
  if (!agent_read_record_value(
    file,
    header_length,
    record_value_length,
    revision,
    &record
  )) {
    *response = AGENT_CREDENTIAL_STORE_FAILURE;
    agent_credential_store_close(session);
    return true;
  }
  state->revision = record.revision;
  if (exclusive) {
    agent_record_dispose(&record);
    *response = AGENT_CREDENTIAL_PRESENT;
    return true;
  }
  *value = record.value;
  *value_length = record.value_length;
  record.value = NULL;
  record.value_length = 0u;
  *response = AGENT_CREDENTIAL_VALUE;
  return true;
}

bool agent_credential_store_mutate(
  struct agent_credential_session *session,
  enum agent_credential_request_kind kind,
  const unsigned char *value,
  size_t value_length,
  enum agent_credential_response_kind *response
) {
  if (session == NULL || session->state == NULL || response == NULL) {
    return false;
  }
  struct agent_platform_state *state = session->state;
  if (!state->exclusive) {
    return false;
  }
  if (kind == AGENT_CREDENTIAL_CANCEL) {
    *response = AGENT_CREDENTIAL_CANCELLED;
    return true;
  }
  if (
    (kind == AGENT_CREDENTIAL_REGISTER || kind == AGENT_CREDENTIAL_REPLACE) &&
    (!agent_valid_value(value, value_length) || state->environment_present)
  ) {
    *response = state->environment_present
      ? AGENT_CREDENTIAL_INVALID_STATE
      : AGENT_CREDENTIAL_INVALID_VALUE;
    return true;
  }
  if (
    (kind == AGENT_CREDENTIAL_REGISTER && state->present) ||
    ((kind == AGENT_CREDENTIAL_REPLACE || kind == AGENT_CREDENTIAL_REMOVE) &&
      !state->present)
  ) {
    *response = AGENT_CREDENTIAL_INVALID_STATE;
    return true;
  }
  if (kind == AGENT_CREDENTIAL_REMOVE) {
    if (!agent_platform_remove(state)) {
      *response = AGENT_CREDENTIAL_STORE_FAILURE;
      return true;
    }
    state->present = false;
    state->revision = 0u;
    *response = AGENT_CREDENTIAL_REMOVED;
    return true;
  }
  if (
    kind != AGENT_CREDENTIAL_REGISTER && kind != AGENT_CREDENTIAL_REPLACE
  ) {
    *response = AGENT_CREDENTIAL_INVALID_STATE;
    return true;
  }
  const uint64_t revision = kind == AGENT_CREDENTIAL_REGISTER
    ? 1u
    : state->revision + 1u;
  if (
    revision == 0u || revision > AGENT_CREDENTIAL_MAX_REVISION
  ) {
    *response = AGENT_CREDENTIAL_INVALID_STATE;
    return true;
  }
  unsigned char *record = NULL;
  size_t record_length = 0u;
  if (!agent_encode_record(
    value,
    value_length,
    revision,
    &record,
    &record_length
  )) {
    *response = AGENT_CREDENTIAL_INVALID_VALUE;
    return true;
  }
  const bool published = agent_platform_publish(
    state,
    record,
    record_length,
    kind == AGENT_CREDENTIAL_REPLACE
  );
  agent_clear(record, record_length);
  free(record);
  if (!published) {
    *response = AGENT_CREDENTIAL_STORE_FAILURE;
    return true;
  }
  struct agent_record verified = {
    .value = NULL,
    .value_length = 0u,
    .revision = 0u
  };
  if (
    !agent_read_record(state, &verified) ||
    verified.revision != revision || verified.value_length != value_length ||
    memcmp(verified.value, value, value_length) != 0
  ) {
    agent_record_dispose(&verified);
    *response = AGENT_CREDENTIAL_STORE_FAILURE;
    return true;
  }
  agent_record_dispose(&verified);
  state->present = true;
  state->revision = revision;
  *response = kind == AGENT_CREDENTIAL_REGISTER
    ? AGENT_CREDENTIAL_REGISTERED
    : AGENT_CREDENTIAL_REPLACED;
  return true;
}

void agent_credential_store_close(struct agent_credential_session *session) {
  if (session == NULL || session->state == NULL) {
    return;
  }
  struct agent_platform_state *state = session->state;
#ifdef _WIN32
  if (state->lock != INVALID_HANDLE_VALUE) CloseHandle(state->lock);
  free(state->account);
  free(state->agent_root);
  free(state->credentials);
  free(state->committed);
  free(state->pending);
  free(state->retired);
#else
  if (state->lock >= 0) close(state->lock);
  if (state->credentials >= 0) close(state->credentials);
  if (state->root >= 0) close(state->root);
  if (state->home >= 0) close(state->home);
#endif
  free(state);
  session->state = NULL;
}
