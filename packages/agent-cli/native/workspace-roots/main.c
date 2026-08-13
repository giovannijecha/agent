#include "workspace-roots.h"

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

static void agent_write_u32(unsigned char *bytes, uint32_t value) {
  bytes[0] = (unsigned char)(value & 0xffu);
  bytes[1] = (unsigned char)((value >> 8u) & 0xffu);
  bytes[2] = (unsigned char)((value >> 16u) & 0xffu);
  bytes[3] = (unsigned char)((value >> 24u) & 0xffu);
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

static bool agent_write_roots(
  FILE *output,
  const struct agent_workspace_roots *roots
) {
  const size_t home_length = strlen(roots->home_directory);
  const size_t temporary_length = strlen(roots->temporary_directory);
  if (
    home_length == 0u ||
    home_length > AGENT_WORKSPACE_ROOTS_MAX_PATH_BYTES ||
    temporary_length == 0u ||
    temporary_length > AGENT_WORKSPACE_ROOTS_MAX_PATH_BYTES
  ) {
    return false;
  }
  const size_t payload_length = 8u + home_length + temporary_length;
  unsigned char header[12] = {
    'A', 'G', 'W', 'R',
    AGENT_WORKSPACE_ROOTS_PROTOCOL_VERSION,
    1u,
    0u,
    0u,
    0u,
    0u,
    0u,
    0u
  };
  unsigned char length[4];
  agent_write_u32(header + 8u, (uint32_t)payload_length);
  agent_write_u32(length, (uint32_t)home_length);
  if (
    !agent_write_exact(output, header, sizeof(header)) ||
    !agent_write_exact(output, length, sizeof(length)) ||
    !agent_write_exact(
      output,
      (const unsigned char *)roots->home_directory,
      home_length
    )
  ) {
    return false;
  }
  agent_write_u32(length, (uint32_t)temporary_length);
  return agent_write_exact(output, length, sizeof(length)) &&
    agent_write_exact(
      output,
      (const unsigned char *)roots->temporary_directory,
      temporary_length
    ) &&
    fflush(output) == 0;
}

int main(int argument_count, char **arguments) {
  (void)arguments;
  if (argument_count != 1) {
    return 1;
  }
#ifdef _WIN32
  if (_setmode(_fileno(stdout), _O_BINARY) == -1) {
    return 1;
  }
#endif
  if (setvbuf(stdout, NULL, _IONBF, 0) != 0) {
    return 1;
  }
  struct agent_workspace_roots roots = {
    .home_directory = NULL,
    .temporary_directory = NULL
  };
  if (!agent_workspace_roots_discover(&roots)) {
    agent_workspace_roots_dispose(&roots);
    return 1;
  }
  const bool written = agent_write_roots(stdout, &roots);
  agent_workspace_roots_dispose(&roots);
  return written ? 0 : 1;
}
