#ifndef AGENT_MUTATION_COMMIT_H
#define AGENT_MUTATION_COMMIT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#define AGENT_MUTATION_PROTOCOL_VERSION 1u
#define AGENT_MUTATION_MAX_PATH_BYTES 16384u
#define AGENT_MUTATION_MAX_CONTENT_BYTES 1048576u
#define AGENT_MUTATION_FIXED_PAYLOAD_BYTES 32u
#define AGENT_MUTATION_MAX_PAYLOAD_BYTES 2129952u

enum agent_mutation_operation {
  AGENT_MUTATION_CREATE = 1,
  AGENT_MUTATION_REPLACE = 2
};

enum agent_mutation_status {
  AGENT_MUTATION_CREATED = 1,
  AGENT_MUTATION_REPLACED = 2,
  AGENT_MUTATION_CONFLICT = 3,
  AGENT_MUTATION_PERMISSION = 4,
  AGENT_MUTATION_UNSUPPORTED = 5,
  AGENT_MUTATION_LIMIT = 6,
  AGENT_MUTATION_IO = 7
};

struct agent_mutation_request {
  enum agent_mutation_operation operation;
  uint64_t identity_device;
  uint64_t identity_inode;
  char *root;
  char *relative_path;
  unsigned char *expected_content;
  size_t expected_length;
  unsigned char *replacement_content;
  size_t replacement_length;
};

bool agent_mutation_read_request(
  FILE *input,
  struct agent_mutation_request *request
);
void agent_mutation_dispose_request(struct agent_mutation_request *request);
bool agent_mutation_write_response(
  FILE *output,
  enum agent_mutation_status status
);
enum agent_mutation_status agent_mutation_commit(
  const struct agent_mutation_request *request
);

#endif
