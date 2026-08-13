#ifndef AGENT_CLIPBOARD_H
#define AGENT_CLIPBOARD_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define AGENT_CLIPBOARD_MAX_CODE_UNITS 65536u
#define AGENT_CLIPBOARD_MAX_PAYLOAD_BYTES \
  (AGENT_CLIPBOARD_MAX_CODE_UNITS * 2u)
#define AGENT_CLIPBOARD_PROTOCOL_VERSION 1u

bool agent_clipboard_write(
  const uint16_t *text,
  size_t code_units
);

#endif
