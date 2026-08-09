#include <errno.h>
#include <limits.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#include <process.h>
#include <wchar.h>
#else
#include <signal.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

extern char **environ;
#endif

#define AGENT_FIXTURE_LONG_SLEEP_MS 600000u

static bool agent_fixture_write_all(
  FILE *output,
  const unsigned char *bytes,
  size_t length
) {
  size_t offset = 0u;
  while (offset < length) {
    const size_t written = fwrite(bytes + offset, 1u, length - offset, output);
    if (written == 0u) {
      return false;
    }
    offset += written;
  }
  return fflush(output) == 0;
}

#ifdef _WIN32
static bool agent_fixture_write_wide(FILE *output, const wchar_t *value) {
  const size_t length = wcslen(value);
  if (length > (size_t)INT_MAX) {
    return false;
  }
  const int required = WideCharToMultiByte(
    CP_UTF8,
    WC_ERR_INVALID_CHARS,
    value,
    (int)length,
    NULL,
    0,
    NULL,
    NULL
  );
  if (required < 0) {
    return false;
  }
  if (required == 0) {
    return true;
  }
  unsigned char *utf8 = malloc((size_t)required);
  if (utf8 == NULL) {
    return false;
  }
  const int written = WideCharToMultiByte(
    CP_UTF8,
    WC_ERR_INVALID_CHARS,
    value,
    (int)length,
    (char *)utf8,
    required,
    NULL,
    NULL
  );
  const bool succeeded = written == required &&
    agent_fixture_write_all(output, utf8, (size_t)required);
  free(utf8);
  return succeeded;
}

static void agent_fixture_sleep(uint32_t milliseconds) {
  Sleep(milliseconds);
}

static uint32_t agent_fixture_process_id(void) {
  return (uint32_t)GetCurrentProcessId();
}

static bool agent_fixture_wait_for_process_file(const wchar_t *path) {
  for (uint32_t attempt = 0u; attempt < 500u; attempt += 1u) {
    if (_waccess(path, 0) == 0) {
      return true;
    }
    agent_fixture_sleep(10u);
  }
  return false;
}

static bool agent_fixture_append_process_id(const wchar_t *path) {
  FILE *file = NULL;
  if (_wfopen_s(&file, path, L"ab") != 0 || file == NULL) {
    return false;
  }
  const int result = fprintf(file, "%lu\n", (unsigned long)agent_fixture_process_id());
  const bool succeeded = result > 0 && fflush(file) == 0 && fclose(file) == 0;
  return succeeded;
}

static bool agent_fixture_spawn(
  const wchar_t *executable,
  const wchar_t *mode,
  const wchar_t *path
) {
  const intptr_t handle = _wspawnl(
    _P_NOWAIT,
    executable,
    executable,
    mode,
    path,
    NULL
  );
  if (handle == -1) {
    return false;
  }
  CloseHandle((HANDLE)handle);
  return true;
}

static bool agent_fixture_spawn_chain(
  const wchar_t *executable,
  const wchar_t *mode,
  const wchar_t *path,
  unsigned long depth,
  bool detached
) {
  wchar_t depth_text[16];
  if (swprintf(depth_text, 16u, L"%lu", depth) <= 0) {
    return false;
  }
  (void)detached;
  const intptr_t handle = _wspawnl(
    _P_NOWAIT,
    executable,
    executable,
    mode,
    path,
    depth_text,
    NULL
  );
  if (handle == -1) {
    return false;
  }
  CloseHandle((HANDLE)handle);
  return true;
}

static int agent_fixture_arguments(int argc, wchar_t **argv) {
  for (int index = 2; index < argc; index += 1) {
    if (
      !agent_fixture_write_wide(stdout, argv[index]) ||
      fputc('\0', stdout) == EOF
    ) {
      return 1;
    }
  }
  return fflush(stdout) == 0 ? 0 : 1;
}

static int agent_fixture_environment(void) {
  LPWCH environment = GetEnvironmentStringsW();
  if (environment == NULL) {
    return 1;
  }
  uint32_t count = 0u;
  for (const wchar_t *entry = environment; *entry != L'\0';) {
    count += 1u;
    entry += wcslen(entry) + 1u;
  }
  FreeEnvironmentStringsW(environment);
  return printf("%lu\n", (unsigned long)count) > 0 ? 0 : 1;
}

static int agent_fixture_working_directory(void) {
  const DWORD required = GetCurrentDirectoryW(0u, NULL);
  if (required == 0u) {
    return 1;
  }
  wchar_t *directory = calloc((size_t)required, sizeof(wchar_t));
  if (
    directory == NULL ||
    GetCurrentDirectoryW(required, directory) != required - 1u
  ) {
    free(directory);
    return 1;
  }
  const bool succeeded = agent_fixture_write_wide(stdout, directory) &&
    fputc('\n', stdout) != EOF &&
    fflush(stdout) == 0;
  free(directory);
  return succeeded ? 0 : 1;
}

static int agent_fixture_tree_child(
  const wchar_t *executable,
  const wchar_t *path
) {
  if (
    !agent_fixture_append_process_id(path) ||
    !agent_fixture_spawn(executable, L"tree-grandchild", path)
  ) {
    return 77;
  }
  agent_fixture_sleep(AGENT_FIXTURE_LONG_SLEEP_MS);
  return 0;
}

static int agent_fixture_tree_grandchild(const wchar_t *path) {
  if (!agent_fixture_append_process_id(path)) {
    return 78;
  }
  agent_fixture_sleep(AGENT_FIXTURE_LONG_SLEEP_MS);
  return 0;
}

static int agent_fixture_chain(
  const wchar_t *executable,
  const wchar_t *mode,
  const wchar_t *path,
  const wchar_t *depth_text,
  bool detached
) {
  wchar_t *end = NULL;
  const unsigned long depth = wcstoul(depth_text, &end, 10);
  if (end == depth_text || *end != L'\0' || depth > 16u) {
    return 79;
  }
  if (detached) {
    (void)FreeConsole();
  }
  if (!agent_fixture_append_process_id(path)) {
    return 80;
  }
  if (
    depth > 0u &&
    !agent_fixture_spawn_chain(executable, mode, path, depth - 1u, detached)
  ) {
    return 81;
  }
  agent_fixture_sleep(AGENT_FIXTURE_LONG_SLEEP_MS);
  return 0;
}

int wmain(int argc, wchar_t **argv) {
  if (
    _setmode(_fileno(stdout), _O_BINARY) == -1 ||
    _setmode(_fileno(stderr), _O_BINARY) == -1
  ) {
    return 1;
  }
  if (argc < 2) {
    return 64;
  }
  if (wcscmp(argv[1], L"arguments") == 0) {
    return agent_fixture_arguments(argc, argv);
  }
  if (wcscmp(argv[1], L"environment") == 0) {
    return agent_fixture_environment();
  }
  if (wcscmp(argv[1], L"working-directory") == 0) {
    return agent_fixture_working_directory();
  }
  if (wcscmp(argv[1], L"stderr") == 0) {
    return fputs("fixture stderr\n", stderr) >= 0 && fflush(stderr) == 0
      ? 0
      : 1;
  }
  if (wcscmp(argv[1], L"exit") == 0 && argc == 3) {
    return (int)wcstol(argv[2], NULL, 10);
  }
  if (wcscmp(argv[1], L"sleep") == 0) {
    agent_fixture_sleep(AGENT_FIXTURE_LONG_SLEEP_MS);
    return 0;
  }
  if (wcscmp(argv[1], L"flood") == 0 && argc == 3) {
    const unsigned long count = wcstoul(argv[2], NULL, 10);
    unsigned char chunk[4096];
    memset(chunk, 'x', sizeof(chunk));
    unsigned long remaining = count;
    while (remaining > 0u) {
      const size_t length = remaining < sizeof(chunk)
        ? (size_t)remaining
        : sizeof(chunk);
      if (!agent_fixture_write_all(stdout, chunk, length)) {
        return 1;
      }
      remaining -= (unsigned long)length;
    }
    return 0;
  }
  if (wcscmp(argv[1], L"spawn-tree") == 0 && argc == 3) {
    if (!agent_fixture_spawn(argv[0], L"tree-child", argv[2])) {
      return 76;
    }
    agent_fixture_sleep(AGENT_FIXTURE_LONG_SLEEP_MS);
    return 0;
  }
  if (wcscmp(argv[1], L"tree-child") == 0 && argc == 3) {
    return agent_fixture_tree_child(argv[0], argv[2]);
  }
  if (wcscmp(argv[1], L"tree-grandchild") == 0 && argc == 3) {
    return agent_fixture_tree_grandchild(argv[2]);
  }
  if (wcscmp(argv[1], L"spawn-chain") == 0 && argc == 4) {
    return agent_fixture_chain(argv[0], argv[1], argv[2], argv[3], false);
  }
  if (wcscmp(argv[1], L"spawn-detached-chain") == 0 && argc == 4) {
    return agent_fixture_chain(argv[0], argv[1], argv[2], argv[3], true);
  }
  if (wcscmp(argv[1], L"spawn-chain-exit") == 0 && argc == 4) {
    wchar_t *end = NULL;
    const unsigned long depth = wcstoul(argv[3], &end, 10);
    return end != argv[3] && *end == L'\0' && depth <= 16u &&
        agent_fixture_spawn_chain(
          argv[0],
          L"spawn-detached-chain",
          argv[2],
          depth,
          true
        ) &&
        agent_fixture_wait_for_process_file(argv[2])
      ? 0
      : 82;
  }
  if (wcscmp(argv[1], L"ignore-signals") == 0) {
    if (fputs("ready\n", stdout) < 0 || fflush(stdout) != 0) {
      return 83;
    }
    agent_fixture_sleep(AGENT_FIXTURE_LONG_SLEEP_MS);
    return 0;
  }
  if (wcscmp(argv[1], L"spawn-storm") == 0 && argc == 3) {
    if (
      !agent_fixture_spawn(argv[0], L"tree-grandchild", argv[2]) ||
      !agent_fixture_wait_for_process_file(argv[2]) ||
      fputs("ready\n", stdout) < 0 ||
      fflush(stdout) != 0
    ) {
      return 85;
    }
    for (;;) {
      (void)agent_fixture_spawn(argv[0], L"tree-grandchild", argv[2]);
      agent_fixture_sleep(1u);
    }
  }
  return 65;
}

#else
static void agent_fixture_sleep(uint32_t milliseconds) {
  struct timespec remaining = {
    .tv_sec = (time_t)(milliseconds / 1000u),
    .tv_nsec = (long)(milliseconds % 1000u) * 1000000L
  };
  while (nanosleep(&remaining, &remaining) != 0 && errno == EINTR) {
  }
}

static uint32_t agent_fixture_process_id(void) {
  return (uint32_t)getpid();
}

static bool agent_fixture_wait_for_process_file(const char *path) {
  for (uint32_t attempt = 0u; attempt < 500u; attempt += 1u) {
    if (access(path, F_OK) == 0) {
      return true;
    }
    agent_fixture_sleep(10u);
  }
  return false;
}

static bool agent_fixture_append_process_id(const char *path) {
  FILE *file = fopen(path, "ab");
  if (file == NULL) {
    return false;
  }
  const int result = fprintf(file, "%lu\n", (unsigned long)agent_fixture_process_id());
  const bool succeeded = result > 0 && fflush(file) == 0 && fclose(file) == 0;
  return succeeded;
}

static bool agent_fixture_spawn(
  const char *executable,
  const char *mode,
  const char *path
) {
  const pid_t child = fork();
  if (child < 0) {
    return false;
  }
  if (child == 0) {
    execl(executable, executable, mode, path, (char *)NULL);
    _exit(127);
  }
  return true;
}

static bool agent_fixture_spawn_chain(
  const char *executable,
  const char *mode,
  const char *path,
  unsigned long depth,
  bool detached
) {
  char depth_text[16];
  const int length = snprintf(depth_text, sizeof(depth_text), "%lu", depth);
  if (length <= 0 || (size_t)length >= sizeof(depth_text)) {
    return false;
  }
  const pid_t child = fork();
  if (child < 0) {
    return false;
  }
  if (child == 0) {
    if (detached && setsid() < 0) {
      _exit(126);
    }
    execl(executable, executable, mode, path, depth_text, (char *)NULL);
    _exit(127);
  }
  return true;
}

static int agent_fixture_arguments(int argc, char **argv) {
  for (int index = 2; index < argc; index += 1) {
    if (
      !agent_fixture_write_all(
        stdout,
        (const unsigned char *)argv[index],
        strlen(argv[index])
      ) ||
      fputc('\0', stdout) == EOF
    ) {
      return 1;
    }
  }
  return fflush(stdout) == 0 ? 0 : 1;
}

static int agent_fixture_environment(void) {
  uint32_t count = 0u;
  if (environ != NULL) {
    while (environ[count] != NULL) {
      count += 1u;
    }
  }
  return printf("%lu\n", (unsigned long)count) > 0 ? 0 : 1;
}

static int agent_fixture_working_directory(void) {
  char directory[PATH_MAX];
  if (getcwd(directory, sizeof(directory)) == NULL) {
    return 1;
  }
  return printf("%s\n", directory) > 0 ? 0 : 1;
}

static int agent_fixture_tree_child(
  const char *executable,
  const char *path
) {
  if (
    !agent_fixture_append_process_id(path) ||
    !agent_fixture_spawn(executable, "tree-grandchild", path)
  ) {
    return 77;
  }
  agent_fixture_sleep(AGENT_FIXTURE_LONG_SLEEP_MS);
  return 0;
}

static int agent_fixture_tree_grandchild(const char *path) {
  if (!agent_fixture_append_process_id(path)) {
    return 78;
  }
  agent_fixture_sleep(AGENT_FIXTURE_LONG_SLEEP_MS);
  return 0;
}

static int agent_fixture_chain(
  const char *executable,
  const char *mode,
  const char *path,
  const char *depth_text,
  bool detached
) {
  char *end = NULL;
  const unsigned long depth = strtoul(depth_text, &end, 10);
  if (end == depth_text || *end != '\0' || depth > 16u) {
    return 79;
  }
  if (!agent_fixture_append_process_id(path)) {
    return 80;
  }
  if (
    depth > 0u &&
    !agent_fixture_spawn_chain(executable, mode, path, depth - 1u, detached)
  ) {
    return 81;
  }
  agent_fixture_sleep(AGENT_FIXTURE_LONG_SLEEP_MS);
  return 0;
}

static void agent_fixture_ignore_signal(int signal_number) {
  (void)signal_number;
}

int main(int argc, char **argv) {
  if (argc < 2) {
    return 64;
  }
  if (strcmp(argv[1], "arguments") == 0) {
    return agent_fixture_arguments(argc, argv);
  }
  if (strcmp(argv[1], "environment") == 0) {
    return agent_fixture_environment();
  }
  if (strcmp(argv[1], "working-directory") == 0) {
    return agent_fixture_working_directory();
  }
  if (strcmp(argv[1], "stderr") == 0) {
    return fputs("fixture stderr\n", stderr) >= 0 && fflush(stderr) == 0
      ? 0
      : 1;
  }
  if (strcmp(argv[1], "exit") == 0 && argc == 3) {
    return (int)strtol(argv[2], NULL, 10);
  }
  if (strcmp(argv[1], "sleep") == 0) {
    agent_fixture_sleep(AGENT_FIXTURE_LONG_SLEEP_MS);
    return 0;
  }
  if (strcmp(argv[1], "flood") == 0 && argc == 3) {
    const unsigned long count = strtoul(argv[2], NULL, 10);
    unsigned char chunk[4096];
    memset(chunk, 'x', sizeof(chunk));
    unsigned long remaining = count;
    while (remaining > 0u) {
      const size_t length = remaining < sizeof(chunk)
        ? (size_t)remaining
        : sizeof(chunk);
      if (!agent_fixture_write_all(stdout, chunk, length)) {
        return 1;
      }
      remaining -= (unsigned long)length;
    }
    return 0;
  }
  if (strcmp(argv[1], "spawn-tree") == 0 && argc == 3) {
    if (!agent_fixture_spawn(argv[0], "tree-child", argv[2])) {
      return 76;
    }
    agent_fixture_sleep(AGENT_FIXTURE_LONG_SLEEP_MS);
    return 0;
  }
  if (strcmp(argv[1], "tree-child") == 0 && argc == 3) {
    return agent_fixture_tree_child(argv[0], argv[2]);
  }
  if (strcmp(argv[1], "tree-grandchild") == 0 && argc == 3) {
    return agent_fixture_tree_grandchild(argv[2]);
  }
  if (strcmp(argv[1], "spawn-chain") == 0 && argc == 4) {
    return agent_fixture_chain(argv[0], argv[1], argv[2], argv[3], false);
  }
  if (strcmp(argv[1], "spawn-detached-chain") == 0 && argc == 4) {
    return agent_fixture_chain(argv[0], argv[1], argv[2], argv[3], true);
  }
  if (strcmp(argv[1], "spawn-chain-exit") == 0 && argc == 4) {
    char *end = NULL;
    const unsigned long depth = strtoul(argv[3], &end, 10);
    return end != argv[3] && *end == '\0' && depth <= 16u &&
        agent_fixture_spawn_chain(
          argv[0],
          "spawn-detached-chain",
          argv[2],
          depth,
          true
        ) &&
        agent_fixture_wait_for_process_file(argv[2])
      ? 0
      : 82;
  }
  if (strcmp(argv[1], "ignore-signals") == 0) {
    if (
      signal(SIGINT, agent_fixture_ignore_signal) == SIG_ERR ||
      signal(SIGTERM, agent_fixture_ignore_signal) == SIG_ERR ||
      signal(SIGHUP, agent_fixture_ignore_signal) == SIG_ERR
    ) {
      return 83;
    }
    if (fputs("ready\n", stdout) < 0 || fflush(stdout) != 0) {
      return 84;
    }
    agent_fixture_sleep(AGENT_FIXTURE_LONG_SLEEP_MS);
    return 0;
  }
  if (strcmp(argv[1], "spawn-storm") == 0 && argc == 3) {
    if (
      !agent_fixture_spawn(argv[0], "tree-grandchild", argv[2]) ||
      !agent_fixture_wait_for_process_file(argv[2]) ||
      fputs("ready\n", stdout) < 0 ||
      fflush(stdout) != 0
    ) {
      return 85;
    }
    for (;;) {
      (void)agent_fixture_spawn(argv[0], "tree-grandchild", argv[2]);
      agent_fixture_sleep(1u);
    }
  }
  return 65;
}
#endif
