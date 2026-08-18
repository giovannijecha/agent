#ifndef AGENT_PROCESS_BROKER_H
#define AGENT_PROCESS_BROKER_H

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

#define AGENT_BROKER_PROTOCOL_VERSION 2u
#define AGENT_BROKER_MAX_FRAME_BYTES 65536u
#define AGENT_BROKER_MAX_STRING_BYTES 16384u
#define AGENT_BROKER_MAX_ARGUMENTS 64u
#define AGENT_BROKER_MAX_ENVIRONMENT 8u
#define AGENT_BROKER_MIN_TIMEOUT_MS 1u
#define AGENT_BROKER_MAX_TIMEOUT_MS 600000u
#define AGENT_BROKER_MAX_PROCESSES 64u
#define AGENT_BROKER_WINDOWS_POWERSHELL_PROGRAM "agent:windows-powershell"

enum agent_broker_failure {
  AGENT_BROKER_FAILURE_PROTOCOL = 100u,
  AGENT_BROKER_FAILURE_CAPABILITY = 200u,
  AGENT_BROKER_FAILURE_CONTAINMENT = 201u,
  AGENT_BROKER_FAILURE_LAUNCH = 202u,
  AGENT_BROKER_FAILURE_MONITOR = 203u,
  AGENT_BROKER_FAILURE_CLEANUP = 204u
};

enum agent_broker_outcome {
  AGENT_BROKER_OUTCOME_EXITED = 1u,
  AGENT_BROKER_OUTCOME_CANCELLED = 2u,
  AGENT_BROKER_OUTCOME_TIMED_OUT = 3u
};

struct agent_broker_request {
  uint32_t timeout_ms;
  uint32_t process_limit;
  char *program;
  char *working_directory;
  uint32_t environment_count;
  char **environment;
  uint32_t argument_count;
  char **arguments;
};

struct agent_broker_result {
  bool succeeded;
  uint32_t failure;
  uint8_t outcome;
  bool exit_code_known;
  int32_t exit_code;
};

bool agent_protocol_read_launch(
  FILE *input,
  struct agent_broker_request *request
);
bool agent_protocol_read_cancel(FILE *input);
bool agent_protocol_write_started(FILE *output, uint64_t process_id);
bool agent_protocol_write_finished(
  FILE *output,
  const struct agent_broker_result *result
);
bool agent_protocol_write_failure(FILE *output, uint32_t failure);
void agent_protocol_dispose_request(struct agent_broker_request *request);

struct agent_broker_result agent_backend_run(
  const struct agent_broker_request *request
);

#endif
