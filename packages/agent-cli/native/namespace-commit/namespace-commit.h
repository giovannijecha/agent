#ifndef AGENT_NAMESPACE_COMMIT_H
#define AGENT_NAMESPACE_COMMIT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#define AGENT_NAMESPACE_PROTOCOL_VERSION 1u
#define AGENT_NAMESPACE_MAX_ROOT_BYTES 16384u
#define AGENT_NAMESPACE_MAX_PATH_BYTES 2048u
#define AGENT_NAMESPACE_FIXED_PAYLOAD_BYTES 64u
#define AGENT_NAMESPACE_MAX_PAYLOAD_BYTES 20544u

enum agent_namespace_operation {
  AGENT_NAMESPACE_CREATE_DIRECTORY = 1,
  AGENT_NAMESPACE_MOVE = 2,
  AGENT_NAMESPACE_REMOVE = 3
};

enum agent_namespace_entry_kind {
  AGENT_NAMESPACE_NO_ENTRY = 0,
  AGENT_NAMESPACE_FILE = 1,
  AGENT_NAMESPACE_DIRECTORY = 2
};

enum agent_namespace_status {
  AGENT_NAMESPACE_DIRECTORY_CREATED = 1,
  AGENT_NAMESPACE_MOVED = 2,
  AGENT_NAMESPACE_REMOVED = 3,
  AGENT_NAMESPACE_CONFLICT = 4,
  AGENT_NAMESPACE_PERMISSION = 5,
  AGENT_NAMESPACE_UNSUPPORTED = 6,
  AGENT_NAMESPACE_LIMIT = 7,
  AGENT_NAMESPACE_IO = 8
};

struct agent_namespace_identity {
  uint64_t device;
  uint64_t inode;
};

struct agent_namespace_request {
  enum agent_namespace_operation operation;
  enum agent_namespace_entry_kind entry_kind;
  struct agent_namespace_identity identity;
  struct agent_namespace_identity source_parent_identity;
  struct agent_namespace_identity destination_parent_identity;
  char *root;
  char *relative_path;
  char *destination_path;
};

bool agent_namespace_read_request(
  FILE *input,
  struct agent_namespace_request *request
);
void agent_namespace_dispose_request(struct agent_namespace_request *request);
bool agent_namespace_write_response(
  FILE *output,
  enum agent_namespace_status status
);
enum agent_namespace_status agent_namespace_commit(
  const struct agent_namespace_request *request
);

#endif
