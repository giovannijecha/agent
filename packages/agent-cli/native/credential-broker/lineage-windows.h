#ifndef AGENT_LINEAGE_WINDOWS_H
#define AGENT_LINEAGE_WINDOWS_H

#include <windows.h>

struct agent_windows_lineage_observation {
  PSID account;
  PSID owner;
};

HANDLE agent_windows_open_lineage_directory(
  const wchar_t *path,
  const struct agent_windows_lineage_observation *observation
);

#endif
