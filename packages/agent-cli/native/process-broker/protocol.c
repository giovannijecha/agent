#include "broker.h"

#include <limits.h>
#include <stdlib.h>
#include <string.h>

#define AGENT_COMMAND_LAUNCH 1u
#define AGENT_COMMAND_CANCEL 2u
#define AGENT_STATUS_STARTED 1u
#define AGENT_STATUS_FINISHED 2u
#define AGENT_STATUS_FAILURE 3u

struct agent_cursor {
  const unsigned char *bytes;
  size_t length;
  size_t offset;
};

static uint32_t agent_read_u32(const unsigned char *bytes) {
  return ((uint32_t)bytes[0]) |
    ((uint32_t)bytes[1] << 8u) |
    ((uint32_t)bytes[2] << 16u) |
    ((uint32_t)bytes[3] << 24u);
}

static void agent_write_u32(unsigned char *bytes, uint32_t value) {
  bytes[0] = (unsigned char)(value & 0xffu);
  bytes[1] = (unsigned char)((value >> 8u) & 0xffu);
  bytes[2] = (unsigned char)((value >> 16u) & 0xffu);
  bytes[3] = (unsigned char)((value >> 24u) & 0xffu);
}

static void agent_write_u64(unsigned char *bytes, uint64_t value) {
  for (size_t index = 0u; index < 8u; index += 1u) {
    bytes[index] = (unsigned char)((value >> (index * 8u)) & 0xffu);
  }
}

static bool agent_read_exact(FILE *input, unsigned char *bytes, size_t length) {
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

static bool agent_write_exact(
  FILE *output,
  const unsigned char *bytes,
  size_t length
) {
  size_t offset = 0u;
  while (offset < length) {
    const size_t count = fwrite(bytes + offset, 1u, length - offset, output);
    if (count == 0u) {
      return false;
    }
    offset += count;
  }
  return fflush(output) == 0;
}

static bool agent_read_header(
  FILE *input,
  uint8_t expected_kind,
  uint32_t *payload_length
) {
  unsigned char header[12];
  if (!agent_read_exact(input, header, sizeof(header))) {
    return false;
  }
  if (
    memcmp(header, "AGPC", 4u) != 0 ||
    header[4] != AGENT_BROKER_PROTOCOL_VERSION ||
    header[5] != expected_kind ||
    header[6] != 0u ||
    header[7] != 0u
  ) {
    return false;
  }
  *payload_length = agent_read_u32(header + 8u);
  return *payload_length <= AGENT_BROKER_MAX_FRAME_BYTES;
}

static bool agent_utf8_continuation(unsigned char byte) {
  return (byte & 0xc0u) == 0x80u;
}

static bool agent_utf8_valid(const unsigned char *bytes, size_t length) {
  size_t index = 0u;
  while (index < length) {
    const unsigned char first = bytes[index];
    if (first == 0u) {
      return false;
    }
    if (first <= 0x7fu) {
      index += 1u;
      continue;
    }
    if (first >= 0xc2u && first <= 0xdfu) {
      if (index + 1u >= length || !agent_utf8_continuation(bytes[index + 1u])) {
        return false;
      }
      index += 2u;
      continue;
    }
    if (first >= 0xe0u && first <= 0xefu) {
      if (
        index + 2u >= length ||
        !agent_utf8_continuation(bytes[index + 1u]) ||
        !agent_utf8_continuation(bytes[index + 2u]) ||
        (first == 0xe0u && bytes[index + 1u] < 0xa0u) ||
        (first == 0xedu && bytes[index + 1u] >= 0xa0u)
      ) {
        return false;
      }
      index += 3u;
      continue;
    }
    if (first >= 0xf0u && first <= 0xf4u) {
      if (
        index + 3u >= length ||
        !agent_utf8_continuation(bytes[index + 1u]) ||
        !agent_utf8_continuation(bytes[index + 2u]) ||
        !agent_utf8_continuation(bytes[index + 3u]) ||
        (first == 0xf0u && bytes[index + 1u] < 0x90u) ||
        (first == 0xf4u && bytes[index + 1u] >= 0x90u)
      ) {
        return false;
      }
      index += 4u;
      continue;
    }
    return false;
  }
  return true;
}

static bool agent_cursor_u32(struct agent_cursor *cursor, uint32_t *value) {
  if (cursor->offset > cursor->length || cursor->length - cursor->offset < 4u) {
    return false;
  }
  *value = agent_read_u32(cursor->bytes + cursor->offset);
  cursor->offset += 4u;
  return true;
}

static bool agent_cursor_string(
  struct agent_cursor *cursor,
  bool allow_empty,
  char **value
) {
  uint32_t length = 0u;
  if (!agent_cursor_u32(cursor, &length)) {
    return false;
  }
  if (
    length > AGENT_BROKER_MAX_STRING_BYTES ||
    (!allow_empty && length == 0u) ||
    cursor->offset > cursor->length ||
    (size_t)length > cursor->length - cursor->offset ||
    !agent_utf8_valid(cursor->bytes + cursor->offset, (size_t)length)
  ) {
    return false;
  }
  char *text = malloc((size_t)length + 1u);
  if (text == NULL) {
    return false;
  }
  memcpy(text, cursor->bytes + cursor->offset, (size_t)length);
  text[length] = '\0';
  cursor->offset += (size_t)length;
  *value = text;
  return true;
}

bool agent_protocol_read_launch(
  FILE *input,
  struct agent_broker_request *request
) {
  memset(request, 0, sizeof(*request));
  uint32_t payload_length = 0u;
  if (!agent_read_header(input, AGENT_COMMAND_LAUNCH, &payload_length)) {
    return false;
  }
  if (payload_length < 22u) {
    return false;
  }
  unsigned char *payload = malloc((size_t)payload_length);
  if (payload == NULL) {
    return false;
  }
  if (!agent_read_exact(input, payload, (size_t)payload_length)) {
    free(payload);
    return false;
  }

  struct agent_cursor cursor = {
    .bytes = payload,
    .length = (size_t)payload_length,
    .offset = 0u
  };
  bool valid = agent_cursor_u32(&cursor, &request->timeout_ms) &&
    agent_cursor_u32(&cursor, &request->process_limit) &&
    request->timeout_ms >= AGENT_BROKER_MIN_TIMEOUT_MS &&
    request->timeout_ms <= AGENT_BROKER_MAX_TIMEOUT_MS &&
    request->process_limit >= 1u &&
    request->process_limit <= AGENT_BROKER_MAX_PROCESSES &&
    agent_cursor_string(&cursor, false, &request->program) &&
    agent_cursor_string(&cursor, false, &request->working_directory) &&
    agent_cursor_u32(&cursor, &request->argument_count) &&
    request->argument_count <= AGENT_BROKER_MAX_ARGUMENTS;

  if (valid && request->argument_count > 0u) {
    request->arguments = calloc(request->argument_count, sizeof(char *));
    valid = request->arguments != NULL;
  }
  for (uint32_t index = 0u; valid && index < request->argument_count; index += 1u) {
    valid = agent_cursor_string(&cursor, true, &request->arguments[index]);
  }
  valid = valid && cursor.offset == cursor.length;
  free(payload);
  if (!valid) {
    agent_protocol_dispose_request(request);
  }
  return valid;
}

bool agent_protocol_read_cancel(FILE *input) {
  uint32_t payload_length = UINT32_MAX;
  return agent_read_header(input, AGENT_COMMAND_CANCEL, &payload_length) &&
    payload_length == 0u;
}

static bool agent_write_status(
  FILE *output,
  uint8_t kind,
  const unsigned char *payload,
  uint32_t payload_length
) {
  unsigned char header[12] = {
    'A', 'G', 'P', 'S',
    AGENT_BROKER_PROTOCOL_VERSION,
    kind,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u
  };
  agent_write_u32(header + 8u, payload_length);
  if (!agent_write_exact(output, header, sizeof(header))) {
    return false;
  }
  return payload_length == 0u ||
    agent_write_exact(output, payload, (size_t)payload_length);
}

bool agent_protocol_write_started(FILE *output, uint64_t process_id) {
  unsigned char payload[8];
  agent_write_u64(payload, process_id);
  return agent_write_status(output, AGENT_STATUS_STARTED, payload, sizeof(payload));
}

bool agent_protocol_write_finished(
  FILE *output,
  const struct agent_broker_result *result
) {
  unsigned char payload[8] = {
    result->outcome,
    result->exit_code_known ? 1u : 0u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u
  };
  agent_write_u32(payload + 4u, (uint32_t)result->exit_code);
  return agent_write_status(output, AGENT_STATUS_FINISHED, payload, sizeof(payload));
}

bool agent_protocol_write_failure(FILE *output, uint32_t failure) {
  unsigned char payload[4];
  agent_write_u32(payload, failure);
  return agent_write_status(output, AGENT_STATUS_FAILURE, payload, sizeof(payload));
}

void agent_protocol_dispose_request(struct agent_broker_request *request) {
  if (request->arguments != NULL) {
    for (uint32_t index = 0u; index < request->argument_count; index += 1u) {
      free(request->arguments[index]);
    }
  }
  free(request->arguments);
  free(request->program);
  free(request->working_directory);
  memset(request, 0, sizeof(*request));
}
