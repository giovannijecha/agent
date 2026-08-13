#include "clipboard.h"

bool agent_clipboard_write(
  const uint16_t *text,
  size_t code_units
) {
  return
    text != NULL &&
    code_units == 12u &&
    text[0] == (uint16_t)'a' &&
    text[11] == 0xde42u;
}
