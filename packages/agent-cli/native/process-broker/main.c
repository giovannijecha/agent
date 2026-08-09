#include "broker.h"

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

int main(void) {
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

  struct agent_broker_request request;
  if (!agent_protocol_read_launch(stdin, &request)) {
    (void)agent_protocol_write_failure(
      stdout,
      AGENT_BROKER_FAILURE_PROTOCOL
    );
    return 1;
  }

  const struct agent_broker_result result = agent_backend_run(&request);
  agent_protocol_dispose_request(&request);
  if (!result.succeeded) {
    (void)agent_protocol_write_failure(stdout, result.failure);
    return 1;
  }
  if (!agent_protocol_write_finished(stdout, &result)) {
    return 1;
  }
  return 0;
}
