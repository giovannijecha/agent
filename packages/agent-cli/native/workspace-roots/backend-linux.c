#include "workspace-roots.h"

#include <pwd.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <unistd.h>

#define AGENT_WORKSPACE_ROOTS_ACCOUNT_BUFFER_BYTES 65536u

static char *agent_copy_path(const char *value) {
  if (value == NULL) {
    return NULL;
  }
  const size_t length = strlen(value);
  if (length == 0u || length > AGENT_WORKSPACE_ROOTS_MAX_PATH_BYTES) {
    return NULL;
  }
  char *copy = malloc(length + 1u);
  if (copy == NULL) {
    return NULL;
  }
  memcpy(copy, value, length + 1u);
  return copy;
}

bool agent_workspace_roots_discover(struct agent_workspace_roots *roots) {
  if (roots == NULL) {
    return false;
  }
  roots->home_directory = NULL;
  roots->temporary_directory = NULL;
  char *account_buffer = malloc(AGENT_WORKSPACE_ROOTS_ACCOUNT_BUFFER_BYTES);
  if (account_buffer == NULL) {
    return false;
  }
  struct passwd account;
  struct passwd *found = NULL;
  const int queried = getpwuid_r(
    geteuid(),
    &account,
    account_buffer,
    AGENT_WORKSPACE_ROOTS_ACCOUNT_BUFFER_BYTES,
    &found
  );
  if (queried == 0 && found != NULL) {
    roots->home_directory = agent_copy_path(found->pw_dir);
    roots->temporary_directory = agent_copy_path("/tmp");
  }
  free(account_buffer);
  if (
    roots->home_directory == NULL ||
    roots->temporary_directory == NULL
  ) {
    agent_workspace_roots_dispose(roots);
    return false;
  }
  return true;
}

void agent_workspace_roots_dispose(struct agent_workspace_roots *roots) {
  if (roots == NULL) {
    return;
  }
  free(roots->home_directory);
  free(roots->temporary_directory);
  roots->home_directory = NULL;
  roots->temporary_directory = NULL;
}
