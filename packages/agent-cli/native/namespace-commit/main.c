#include "namespace-commit.h"

#include <stdio.h>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

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
  struct agent_namespace_request request;
  if (!agent_namespace_read_request(stdin, &request)) {
    return 1;
  }
  const enum agent_namespace_status status = agent_namespace_commit(&request);
  agent_namespace_dispose_request(&request);
  return agent_namespace_write_response(stdout, status) ? 0 : 1;
}
