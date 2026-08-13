#ifndef AGENT_WORKSPACE_ROOTS_H
#define AGENT_WORKSPACE_ROOTS_H

#include <stdbool.h>

#define AGENT_WORKSPACE_ROOTS_PROTOCOL_VERSION 1u
#define AGENT_WORKSPACE_ROOTS_MAX_PATH_BYTES 4096u

struct agent_workspace_roots {
  char *home_directory;
  char *temporary_directory;
};

bool agent_workspace_roots_discover(struct agent_workspace_roots *roots);
void agent_workspace_roots_dispose(struct agent_workspace_roots *roots);

#endif
