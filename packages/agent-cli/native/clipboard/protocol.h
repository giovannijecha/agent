#ifndef AGENT_CLIPBOARD_PROTOCOL_H
#define AGENT_CLIPBOARD_PROTOCOL_H

#include "clipboard.h"

#include <stdbool.h>
#include <stdio.h>

struct agent_clipboard_request {
  uint16_t *text;
  size_t code_units;
};

bool agent_clipboard_request_read(
  FILE *input,
  struct agent_clipboard_request *request
);

void agent_clipboard_request_dispose(
  struct agent_clipboard_request *request
);

#endif
