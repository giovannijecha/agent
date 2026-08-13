#include "clipboard.h"

#include <stdlib.h>
#include <windows.h>

#define AGENT_CLIPBOARD_OPEN_ATTEMPTS 8u
#define AGENT_CLIPBOARD_RETRY_MILLISECONDS 10u

_Static_assert(sizeof(wchar_t) == sizeof(uint16_t), "wide text must be UTF-16");

static HWND agent_clipboard_window(void) {
  return CreateWindowExW(
    0u,
    L"STATIC",
    L"agent clipboard",
    0u,
    0,
    0,
    0,
    0,
    NULL,
    NULL,
    GetModuleHandleW(NULL),
    NULL
  );
}

static bool agent_clipboard_open(HWND window) {
  for (
    unsigned int attempt = 0u;
    attempt < AGENT_CLIPBOARD_OPEN_ATTEMPTS;
    attempt += 1u
  ) {
    if (OpenClipboard(window) != 0) {
      return true;
    }
    if (attempt + 1u < AGENT_CLIPBOARD_OPEN_ATTEMPTS) {
      Sleep(AGENT_CLIPBOARD_RETRY_MILLISECONDS);
    }
  }
  return false;
}

bool agent_clipboard_write(
  const uint16_t *text,
  size_t code_units
) {
  if (
    text == NULL ||
    code_units == 0u ||
    code_units > AGENT_CLIPBOARD_MAX_CODE_UNITS ||
    code_units > (SIZE_MAX / sizeof(wchar_t)) - 1u
  ) {
    return false;
  }
  HGLOBAL memory = GlobalAlloc(
    GMEM_MOVEABLE | GMEM_ZEROINIT,
    (code_units + 1u) * sizeof(wchar_t)
  );
  if (memory == NULL) {
    return false;
  }
  wchar_t *destination = GlobalLock(memory);
  if (destination == NULL) {
    GlobalFree(memory);
    return false;
  }
  for (size_t index = 0u; index < code_units; index += 1u) {
    destination[index] = (wchar_t)text[index];
  }
  destination[code_units] = L'\0';
  SetLastError(NO_ERROR);
  if (GlobalUnlock(memory) == 0 && GetLastError() != NO_ERROR) {
    GlobalFree(memory);
    return false;
  }

  HWND window = agent_clipboard_window();
  if (window == NULL) {
    GlobalFree(memory);
    return false;
  }
  if (!agent_clipboard_open(window)) {
    DestroyWindow(window);
    GlobalFree(memory);
    return false;
  }
  bool transferred = false;
  if (
    EmptyClipboard() != 0 &&
    SetClipboardData(CF_UNICODETEXT, memory) != NULL
  ) {
    transferred = true;
  }
  const bool closed = CloseClipboard() != 0;
  DestroyWindow(window);
  if (!transferred) {
    GlobalFree(memory);
  }
  return transferred && closed;
}
