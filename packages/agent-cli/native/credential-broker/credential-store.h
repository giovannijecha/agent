#ifndef AGENT_CREDENTIAL_STORE_H
#define AGENT_CREDENTIAL_STORE_H

#include <stdbool.h>
#include <stddef.h>

#define AGENT_CREDENTIAL_KEY_MAX_BYTES 32768u
#define AGENT_CREDENTIAL_OPENAI_ACCOUNT_MAX_BYTES 256u
#define AGENT_CREDENTIAL_OPENAI_PAYLOAD_MAX_BYTES 65812u

enum agent_credential_request_kind {
  AGENT_CREDENTIAL_SNAPSHOT = 1,
  AGENT_CREDENTIAL_OPEN_MUTATION = 2,
  AGENT_CREDENTIAL_REGISTER = 3,
  AGENT_CREDENTIAL_REPLACE = 4,
  AGENT_CREDENTIAL_REMOVE = 5,
  AGENT_CREDENTIAL_CANCEL = 6,
  AGENT_CREDENTIAL_OPENAI_SNAPSHOT = 7,
  AGENT_CREDENTIAL_OPENAI_OPEN_MUTATION = 8,
  AGENT_CREDENTIAL_OPENAI_REGISTER = 9,
  AGENT_CREDENTIAL_OPENAI_REPLACE = 10,
  AGENT_CREDENTIAL_OPENAI_REMOVE = 11,
  AGENT_CREDENTIAL_OPENAI_CANCEL = 12
};

enum agent_credential_response_kind {
  AGENT_CREDENTIAL_ABSENT = 1,
  AGENT_CREDENTIAL_VALUE = 2,
  AGENT_CREDENTIAL_PRESENT = 3,
  AGENT_CREDENTIAL_REGISTERED = 4,
  AGENT_CREDENTIAL_REPLACED = 5,
  AGENT_CREDENTIAL_REMOVED = 6,
  AGENT_CREDENTIAL_CANCELLED = 7,
  AGENT_CREDENTIAL_BUSY = 8,
  AGENT_CREDENTIAL_DUAL_AUTHORITY = 9,
  AGENT_CREDENTIAL_INVALID_VALUE = 10,
  AGENT_CREDENTIAL_INVALID_STATE = 11,
  AGENT_CREDENTIAL_STORE_FAILURE = 12,
  AGENT_CREDENTIAL_OPENAI_VALUE = 13
};

struct agent_credential_session {
  void *state;
};

bool agent_credential_store_open(
  enum agent_credential_request_kind kind,
  bool environment_present,
  struct agent_credential_session *session,
  enum agent_credential_response_kind *response,
  unsigned char **value,
  size_t *value_length
);

bool agent_credential_store_mutate(
  struct agent_credential_session *session,
  enum agent_credential_request_kind kind,
  const unsigned char *value,
  size_t value_length,
  enum agent_credential_response_kind *response
);

void agent_credential_store_close(struct agent_credential_session *session);

#endif
