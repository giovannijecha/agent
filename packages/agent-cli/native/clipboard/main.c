#include "clipboard.h"
#include "protocol.h"

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
  if (_setmode(_fileno(stdin), _O_BINARY) == -1) {
    return 1;
  }
#endif
  struct agent_clipboard_request request = {
    .text = NULL,
    .code_units = 0u
  };
  if (!agent_clipboard_request_read(stdin, &request)) {
    agent_clipboard_request_dispose(&request);
    return 1;
  }
  const bool copied = agent_clipboard_write(
    request.text,
    request.code_units
  );
  agent_clipboard_request_dispose(&request);
  return copied ? 0 : 1;
}
