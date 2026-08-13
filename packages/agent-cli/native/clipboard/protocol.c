#include "protocol.h"

#include <stdlib.h>

#define AGENT_CLIPBOARD_HEADER_BYTES 12u
#define AGENT_CLIPBOARD_WRITE_KIND 1u

static uint32_t agent_read_u32(const unsigned char *bytes) {
  return
    (uint32_t)bytes[0] |
    ((uint32_t)bytes[1] << 8u) |
    ((uint32_t)bytes[2] << 16u) |
    ((uint32_t)bytes[3] << 24u);
}

static bool agent_read_exact(
  FILE *input,
  unsigned char *bytes,
  size_t length
) {
  size_t offset = 0u;
  while (offset < length) {
    const size_t count = fread(bytes + offset, 1u, length - offset, input);
    if (count == 0u) {
      return false;
    }
    offset += count;
  }
  return true;
}

static bool agent_valid_units(
  const uint16_t *text,
  size_t code_units
) {
  for (size_t index = 0u; index < code_units; index += 1u) {
    const uint16_t unit = text[index];
    if (unit == 0u) {
      return false;
    }
    if (unit >= 0xd800u && unit <= 0xdbffu) {
      if (index + 1u >= code_units) {
        return false;
      }
      const uint16_t next = text[index + 1u];
      if (next < 0xdc00u || next > 0xdfffu) {
        return false;
      }
      index += 1u;
    } else if (unit >= 0xdc00u && unit <= 0xdfffu) {
      return false;
    }
  }
  return true;
}

bool agent_clipboard_request_read(
  FILE *input,
  struct agent_clipboard_request *request
) {
  if (input == NULL || request == NULL) {
    return false;
  }
  request->text = NULL;
  request->code_units = 0u;
  unsigned char header[AGENT_CLIPBOARD_HEADER_BYTES];
  if (!agent_read_exact(input, header, sizeof(header))) {
    return false;
  }
  if (
    header[0] != 'A' ||
    header[1] != 'G' ||
    header[2] != 'C' ||
    header[3] != 'B' ||
    header[4] != AGENT_CLIPBOARD_PROTOCOL_VERSION ||
    header[5] != AGENT_CLIPBOARD_WRITE_KIND ||
    header[6] != 0u ||
    header[7] != 0u
  ) {
    return false;
  }
  const uint32_t payload_bytes = agent_read_u32(header + 8u);
  if (
    payload_bytes == 0u ||
    payload_bytes > AGENT_CLIPBOARD_MAX_PAYLOAD_BYTES ||
    payload_bytes % 2u != 0u
  ) {
    return false;
  }
  const size_t code_units = (size_t)payload_bytes / 2u;
  unsigned char *payload = malloc((size_t)payload_bytes);
  uint16_t *text = calloc(code_units + 1u, sizeof(uint16_t));
  if (payload == NULL || text == NULL) {
    free(payload);
    free(text);
    return false;
  }
  if (!agent_read_exact(input, payload, (size_t)payload_bytes)) {
    free(payload);
    free(text);
    return false;
  }
  for (size_t index = 0u; index < code_units; index += 1u) {
    const size_t offset = index * 2u;
    text[index] = (uint16_t)(
      (uint16_t)payload[offset] |
      ((uint16_t)payload[offset + 1u] << 8u)
    );
  }
  free(payload);
  if (!agent_valid_units(text, code_units) || fgetc(input) != EOF) {
    free(text);
    return false;
  }
  request->text = text;
  request->code_units = code_units;
  return true;
}

void agent_clipboard_request_dispose(
  struct agent_clipboard_request *request
) {
  if (request == NULL) {
    return;
  }
  free(request->text);
  request->text = NULL;
  request->code_units = 0u;
}
