#include "credential-store.h"

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

#define AGENT_CREDENTIAL_HEADER_BYTES 12u

struct agent_credential_request {
  enum agent_credential_request_kind kind;
  bool environment_present;
  unsigned char *value;
  size_t value_length;
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

static uint32_t agent_read_u32(const unsigned char *bytes) {
  return (uint32_t)bytes[0] |
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
  return true;
}

static void agent_dispose_request(struct agent_credential_request *request) {
  if (request == NULL) {
    return;
  }
  agent_clear(request->value, request->value_length);
  free(request->value);
  request->value = NULL;
  request->value_length = 0u;
}

static bool agent_read_request(
  FILE *input,
  bool opening,
  struct agent_credential_request *request
) {
  unsigned char header[AGENT_CREDENTIAL_HEADER_BYTES];
  if (request == NULL || !agent_read_exact(input, header, sizeof(header))) {
    return false;
  }
  if (
    header[0] != 'A' || header[1] != 'G' ||
    header[2] != 'C' || header[3] != 'R' ||
    header[4] != 1u || header[6] != 0u || header[7] != 0u
  ) {
    return false;
  }
  const uint32_t length = agent_read_u32(header + 8u);
  const unsigned int kind = header[5];
  if (length > AGENT_CREDENTIAL_OPENAI_PAYLOAD_MAX_BYTES) {
    return false;
  }
  if (opening) {
    if (
      (((kind == AGENT_CREDENTIAL_SNAPSHOT ||
          kind == AGENT_CREDENTIAL_OPEN_MUTATION) && length != 1u) ||
        ((kind == AGENT_CREDENTIAL_OPENAI_SNAPSHOT ||
          kind == AGENT_CREDENTIAL_OPENAI_OPEN_MUTATION) && length != 0u)) ||
      (kind != AGENT_CREDENTIAL_SNAPSHOT &&
        kind != AGENT_CREDENTIAL_OPEN_MUTATION &&
        kind != AGENT_CREDENTIAL_OPENAI_SNAPSHOT &&
        kind != AGENT_CREDENTIAL_OPENAI_OPEN_MUTATION)
    ) {
      return false;
    }
  } else if (
    kind < AGENT_CREDENTIAL_REGISTER ||
    kind > AGENT_CREDENTIAL_OPENAI_CANCEL ||
    (((kind == AGENT_CREDENTIAL_REGISTER || kind == AGENT_CREDENTIAL_REPLACE ||
        kind == AGENT_CREDENTIAL_OPENAI_REGISTER ||
        kind == AGENT_CREDENTIAL_OPENAI_REPLACE))
      ? length == 0u
      : length != 0u)
  ) {
    return false;
  }
  unsigned char *value = NULL;
  if (length > 0u) {
    value = malloc(length);
    if (value == NULL || !agent_read_exact(input, value, length)) {
      agent_clear(value, length);
      free(value);
      return false;
    }
  }
  request->kind = (enum agent_credential_request_kind)kind;
  request->environment_present = false;
  request->value = value;
  request->value_length = length;
  if (opening) {
    if (
      (kind == AGENT_CREDENTIAL_SNAPSHOT ||
        kind == AGENT_CREDENTIAL_OPEN_MUTATION) && value[0] > 1u
    ) {
      agent_dispose_request(request);
      return false;
    }
    request->environment_present = length == 1u && value[0] == 1u;
    agent_dispose_request(request);
  }
  return true;
}

static bool agent_write_response(
  FILE *output,
  enum agent_credential_response_kind kind,
  const unsigned char *value,
  size_t value_length
) {
  if (
    ((kind == AGENT_CREDENTIAL_VALUE ||
      kind == AGENT_CREDENTIAL_OPENAI_VALUE) &&
      (value == NULL || value_length == 0u ||
        value_length > (kind == AGENT_CREDENTIAL_VALUE
          ? AGENT_CREDENTIAL_KEY_MAX_BYTES
          : AGENT_CREDENTIAL_OPENAI_PAYLOAD_MAX_BYTES))) ||
    (kind != AGENT_CREDENTIAL_VALUE &&
      kind != AGENT_CREDENTIAL_OPENAI_VALUE && value_length != 0u)
  ) {
    return false;
  }
  unsigned char header[AGENT_CREDENTIAL_HEADER_BYTES] = {
    'A', 'G', 'C', 'S', 1u, (unsigned char)kind, 0u, 0u,
    0u, 0u, 0u, 0u
  };
  agent_write_u32(header + 8u, (uint32_t)value_length);
  return agent_write_exact(output, header, sizeof(header)) &&
    (value_length == 0u || agent_write_exact(output, value, value_length)) &&
    fflush(output) == 0;
}

static bool agent_wait_for_close(FILE *input) {
  unsigned char byte = 0u;
  return fread(&byte, 1u, 1u, input) == 0u && feof(input) != 0;
}

int main(int argument_count, char **arguments) {
  (void)arguments;
  if (argument_count != 1) {
    return 1;
  }
#ifdef _WIN32
  if (
    _setmode(_fileno(stdin), _O_BINARY) == -1 ||
    _setmode(_fileno(stdout), _O_BINARY) == -1
  ) {
    return 1;
  }
#endif
  if (
    setvbuf(stdin, NULL, _IONBF, 0) != 0 ||
    setvbuf(stdout, NULL, _IONBF, 0) != 0
  ) {
    return 1;
  }

  struct agent_credential_request opening = {
    .kind = 0,
    .environment_present = false,
    .value = NULL,
    .value_length = 0u
  };
  if (!agent_read_request(stdin, true, &opening)) {
    return 1;
  }
  struct agent_credential_session session = { .state = NULL };
  enum agent_credential_response_kind response =
    AGENT_CREDENTIAL_STORE_FAILURE;
  unsigned char *value = NULL;
  size_t value_length = 0u;
  const bool opened = agent_credential_store_open(
    opening.kind,
    opening.environment_present,
    &session,
    &response,
    &value,
    &value_length
  );
  if (
    !opened ||
    !agent_write_response(stdout, response, value, value_length)
  ) {
    agent_clear(value, value_length);
    free(value);
    agent_credential_store_close(&session);
    return 1;
  }
  agent_clear(value, value_length);
  free(value);

  if (
    opening.kind == AGENT_CREDENTIAL_SNAPSHOT ||
    opening.kind == AGENT_CREDENTIAL_OPENAI_SNAPSHOT
  ) {
    const bool closed = agent_wait_for_close(stdin);
    agent_credential_store_close(&session);
    return closed ? 0 : 1;
  }
  if (
    response != AGENT_CREDENTIAL_ABSENT &&
    response != AGENT_CREDENTIAL_PRESENT
  ) {
    const bool closed = agent_wait_for_close(stdin);
    agent_credential_store_close(&session);
    return closed ? 0 : 1;
  }

  struct agent_credential_request mutation = {
    .kind = 0,
    .environment_present = false,
    .value = NULL,
    .value_length = 0u
  };
  if (!agent_read_request(stdin, false, &mutation)) {
    agent_credential_store_close(&session);
    return 1;
  }
  const bool mutated = agent_credential_store_mutate(
    &session,
    mutation.kind,
    mutation.value,
    mutation.value_length,
    &response
  );
  agent_dispose_request(&mutation);
  const bool written = mutated &&
    agent_write_response(stdout, response, NULL, 0u);
  const bool closed = written && agent_wait_for_close(stdin);
  agent_credential_store_close(&session);
  return closed ? 0 : 1;
}
