#include "mutation-commit.h"

#include <stdlib.h>
#include <string.h>

static uint32_t agent_read_u32(const unsigned char *bytes) {
  return
    (uint32_t)bytes[0] |
    ((uint32_t)bytes[1] << 8u) |
    ((uint32_t)bytes[2] << 16u) |
    ((uint32_t)bytes[3] << 24u);
}

static uint64_t agent_read_u64(const unsigned char *bytes) {
  uint64_t value = 0u;
  for (size_t index = 0u; index < 8u; index += 1u) {
    value |= (uint64_t)bytes[index] << (index * 8u);
  }
  return value;
}

static void agent_write_u32(unsigned char *bytes, uint32_t value) {
  bytes[0] = (unsigned char)(value & 0xffu);
  bytes[1] = (unsigned char)((value >> 8u) & 0xffu);
  bytes[2] = (unsigned char)((value >> 16u) & 0xffu);
  bytes[3] = (unsigned char)((value >> 24u) & 0xffu);
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

static bool agent_utf8_scalar(
  const unsigned char *bytes,
  size_t length,
  bool reject_controls
) {
  size_t offset = 0u;
  while (offset < length) {
    const unsigned char first = bytes[offset];
    uint32_t point;
    size_t width;
    if (first <= 0x7fu) {
      point = first;
      width = 1u;
    } else if (first >= 0xc2u && first <= 0xdfu) {
      if (length - offset < 2u || (bytes[offset + 1u] & 0xc0u) != 0x80u) {
        return false;
      }
      point =
        ((uint32_t)(first & 0x1fu) << 6u) |
        (uint32_t)(bytes[offset + 1u] & 0x3fu);
      width = 2u;
    } else if (first >= 0xe0u && first <= 0xefu) {
      if (
        length - offset < 3u ||
        (bytes[offset + 1u] & 0xc0u) != 0x80u ||
        (bytes[offset + 2u] & 0xc0u) != 0x80u ||
        (first == 0xe0u && bytes[offset + 1u] < 0xa0u) ||
        (first == 0xedu && bytes[offset + 1u] >= 0xa0u)
      ) {
        return false;
      }
      point =
        ((uint32_t)(first & 0x0fu) << 12u) |
        ((uint32_t)(bytes[offset + 1u] & 0x3fu) << 6u) |
        (uint32_t)(bytes[offset + 2u] & 0x3fu);
      width = 3u;
    } else if (first >= 0xf0u && first <= 0xf4u) {
      if (
        length - offset < 4u ||
        (bytes[offset + 1u] & 0xc0u) != 0x80u ||
        (bytes[offset + 2u] & 0xc0u) != 0x80u ||
        (bytes[offset + 3u] & 0xc0u) != 0x80u ||
        (first == 0xf0u && bytes[offset + 1u] < 0x90u) ||
        (first == 0xf4u && bytes[offset + 1u] >= 0x90u)
      ) {
        return false;
      }
      point =
        ((uint32_t)(first & 0x07u) << 18u) |
        ((uint32_t)(bytes[offset + 1u] & 0x3fu) << 12u) |
        ((uint32_t)(bytes[offset + 2u] & 0x3fu) << 6u) |
        (uint32_t)(bytes[offset + 3u] & 0x3fu);
      width = 4u;
    } else {
      return false;
    }
    if (
      point == 0u ||
      (reject_controls && (point <= 0x1fu || (point >= 0x7fu && point <= 0x9fu)))
    ) {
      return false;
    }
    offset += width;
  }
  return true;
}

static bool agent_relative_path(const unsigned char *bytes, size_t length) {
  if (length == 0u || bytes[0] == '/' || bytes[length - 1u] == '/') {
    return false;
  }
  size_t start = 0u;
  for (size_t index = 0u; index <= length; index += 1u) {
    if (index != length && bytes[index] != '/') {
      continue;
    }
    const size_t component_length = index - start;
    if (
      component_length == 0u ||
      (component_length == 1u && bytes[start] == '.') ||
      (
        component_length == 2u &&
        bytes[start] == '.' &&
        bytes[start + 1u] == '.'
      )
    ) {
      return false;
    }
    start = index + 1u;
  }
  return true;
}

static char *agent_copy_text(const unsigned char *bytes, size_t length) {
  if (length == SIZE_MAX) {
    return NULL;
  }
  char *copy = malloc(length + 1u);
  if (copy == NULL) {
    return NULL;
  }
  memcpy(copy, bytes, length);
  copy[length] = '\0';
  return copy;
}

static unsigned char *agent_copy_bytes(
  const unsigned char *bytes,
  size_t length
) {
  if (length == 0u) {
    return NULL;
  }
  unsigned char *copy = malloc(length);
  if (copy != NULL) {
    memcpy(copy, bytes, length);
  }
  return copy;
}

void agent_mutation_dispose_request(struct agent_mutation_request *request) {
  if (request == NULL) {
    return;
  }
  free(request->root);
  free(request->relative_path);
  free(request->expected_content);
  free(request->replacement_content);
  memset(request, 0, sizeof(*request));
}

bool agent_mutation_read_request(
  FILE *input,
  struct agent_mutation_request *request
) {
  if (input == NULL || request == NULL) {
    return false;
  }
  memset(request, 0, sizeof(*request));
  unsigned char header[12];
  if (!agent_read_exact(input, header, sizeof(header))) {
    return false;
  }
  const uint32_t payload_length = agent_read_u32(header + 8u);
  if (
    memcmp(header, "AGMC", 4u) != 0 ||
    header[4] != AGENT_MUTATION_PROTOCOL_VERSION ||
    (header[5] != AGENT_MUTATION_CREATE && header[5] != AGENT_MUTATION_REPLACE) ||
    header[6] != 0u ||
    header[7] != 0u ||
    payload_length < AGENT_MUTATION_FIXED_PAYLOAD_BYTES ||
    payload_length > AGENT_MUTATION_MAX_PAYLOAD_BYTES
  ) {
    return false;
  }
  unsigned char *payload = malloc(payload_length);
  if (payload == NULL) {
    return false;
  }
  const bool complete = agent_read_exact(input, payload, payload_length);
  const int trailing = complete ? fgetc(input) : 0;
  if (!complete || trailing != EOF || ferror(input) != 0) {
    free(payload);
    return false;
  }
  const uint32_t root_length = agent_read_u32(payload + 16u);
  const uint32_t relative_length = agent_read_u32(payload + 20u);
  const uint32_t expected_length = agent_read_u32(payload + 24u);
  const uint32_t replacement_length = agent_read_u32(payload + 28u);
  const uint64_t variable_length =
    (uint64_t)root_length +
    (uint64_t)relative_length +
    (uint64_t)expected_length +
    (uint64_t)replacement_length;
  if (
    root_length == 0u ||
    root_length > AGENT_MUTATION_MAX_PATH_BYTES ||
    relative_length == 0u ||
    relative_length > AGENT_MUTATION_MAX_PATH_BYTES ||
    expected_length > AGENT_MUTATION_MAX_CONTENT_BYTES ||
    replacement_length > AGENT_MUTATION_MAX_CONTENT_BYTES ||
    variable_length !=
      (uint64_t)payload_length - AGENT_MUTATION_FIXED_PAYLOAD_BYTES ||
    (header[5] == AGENT_MUTATION_CREATE && expected_length != 0u)
  ) {
    free(payload);
    return false;
  }
  const unsigned char *root = payload + AGENT_MUTATION_FIXED_PAYLOAD_BYTES;
  const unsigned char *relative = root + root_length;
  const unsigned char *expected = relative + relative_length;
  const unsigned char *replacement = expected + expected_length;
  if (
    !agent_utf8_scalar(root, root_length, true) ||
    !agent_utf8_scalar(relative, relative_length, true) ||
    !agent_relative_path(relative, relative_length) ||
    !agent_utf8_scalar(expected, expected_length, false) ||
    !agent_utf8_scalar(replacement, replacement_length, false)
  ) {
    free(payload);
    return false;
  }
  request->operation = (enum agent_mutation_operation)header[5];
  request->identity_device = agent_read_u64(payload);
  request->identity_inode = agent_read_u64(payload + 8u);
  request->root = agent_copy_text(root, root_length);
  request->relative_path = agent_copy_text(relative, relative_length);
  request->expected_content = agent_copy_bytes(expected, expected_length);
  request->expected_length = expected_length;
  request->replacement_content = agent_copy_bytes(
    replacement,
    replacement_length
  );
  request->replacement_length = replacement_length;
  free(payload);
  if (
    request->root == NULL ||
    request->relative_path == NULL ||
    (expected_length > 0u && request->expected_content == NULL) ||
    (replacement_length > 0u && request->replacement_content == NULL)
  ) {
    agent_mutation_dispose_request(request);
    return false;
  }
  return true;
}

bool agent_mutation_write_response(
  FILE *output,
  enum agent_mutation_status status
) {
  if (
    output == NULL ||
    status < AGENT_MUTATION_CREATED ||
    status > AGENT_MUTATION_IO
  ) {
    return false;
  }
  unsigned char response[12] = {
    'A', 'G', 'M', 'R',
    AGENT_MUTATION_PROTOCOL_VERSION,
    (unsigned char)status,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u
  };
  agent_write_u32(response + 8u, 0u);
  return agent_write_exact(output, response, sizeof(response)) &&
    fflush(output) == 0;
}
