#include "broker.h"

#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <linux/capability.h>
#include <linux/magic.h>
#include <linux/mount.h>
#include <linux/sched.h>
#include <poll.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mount.h>
#include <sys/prctl.h>
#include <sys/random.h>
#include <sys/stat.h>
#include <sys/statfs.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define AGENT_LINUX_CGROUP_MOUNT "/sys/fs/cgroup"
#define AGENT_LINUX_CONTROL_NAME "control"
#define AGENT_LINUX_RUNS_NAME "runs"
#define AGENT_LINUX_MONITOR_SLICE_MS 10u
#define AGENT_LINUX_SETUP_TIMEOUT_MS 5000u
#define AGENT_LINUX_CLEANUP_TIMEOUT_MS 5000u
#define AGENT_LINUX_GUARD_FAILURE_EXIT 125

struct agent_linux_containment {
  int runs_directory;
  int run_directory;
  char run_name[64];
};

static struct agent_broker_result agent_linux_failure(uint32_t failure) {
  const struct agent_broker_result result = {
    .succeeded = false,
    .failure = failure,
    .outcome = 0u,
    .exit_code_known = false,
    .exit_code = 0
  };
  return result;
}

static struct agent_broker_result agent_linux_success(
  uint8_t outcome,
  bool exit_code_known,
  int32_t exit_code
) {
  const struct agent_broker_result result = {
    .succeeded = true,
    .failure = 0u,
    .outcome = outcome,
    .exit_code_known = exit_code_known,
    .exit_code = exit_code
  };
  return result;
}

static bool agent_linux_write_all(int descriptor, const void *bytes, size_t length) {
  const unsigned char *cursor = bytes;
  size_t offset = 0u;
  while (offset < length) {
    const ssize_t written = write(descriptor, cursor + offset, length - offset);
    if (written < 0 && errno == EINTR) {
      continue;
    }
    if (written <= 0) {
      return false;
    }
    offset += (size_t)written;
  }
  return true;
}

static void agent_linux_diagnostic(uint32_t stage) {
  char message[48];
  const int length = snprintf(
    message,
    sizeof(message),
    "linux-containment-stage:%lu\n",
    (unsigned long)stage
  );
  if (length > 0 && (size_t)length < sizeof(message)) {
    (void)agent_linux_write_all(STDERR_FILENO, message, (size_t)length);
  }
}

static bool agent_linux_read_all(int descriptor, void *bytes, size_t length) {
  unsigned char *cursor = bytes;
  size_t offset = 0u;
  while (offset < length) {
    const ssize_t received = read(descriptor, cursor + offset, length - offset);
    if (received < 0 && errno == EINTR) {
      continue;
    }
    if (received <= 0) {
      return false;
    }
    offset += (size_t)received;
  }
  return true;
}

static bool agent_linux_write_text_at(
  int directory,
  const char *name,
  const char *text
) {
  const int descriptor = openat(
    directory,
    name,
    O_WRONLY | O_CLOEXEC | O_NOFOLLOW
  );
  if (descriptor < 0) {
    return false;
  }
  const bool succeeded = agent_linux_write_all(
    descriptor,
    text,
    strlen(text)
  );
  const bool closed = close(descriptor) == 0;
  return succeeded && closed;
}

static bool agent_linux_read_text_at(
  int directory,
  const char *name,
  char *buffer,
  size_t capacity,
  size_t *length
) {
  if (capacity < 2u) {
    return false;
  }
  const int descriptor = openat(
    directory,
    name,
    O_RDONLY | O_CLOEXEC | O_NOFOLLOW
  );
  if (descriptor < 0) {
    return false;
  }
  size_t offset = 0u;
  for (;;) {
    if (offset == capacity - 1u) {
      close(descriptor);
      return false;
    }
    const ssize_t received = read(
      descriptor,
      buffer + offset,
      capacity - 1u - offset
    );
    if (received < 0 && errno == EINTR) {
      continue;
    }
    if (received < 0) {
      close(descriptor);
      return false;
    }
    if (received == 0) {
      break;
    }
    offset += (size_t)received;
  }
  buffer[offset] = '\0';
  *length = offset;
  return close(descriptor) == 0;
}

static bool agent_linux_token_present(const char *text, const char *token) {
  const size_t token_length = strlen(token);
  const char *cursor = text;
  while (*cursor != '\0') {
    while (*cursor == ' ' || *cursor == '\n' || *cursor == '\t') {
      cursor += 1;
    }
    const char *end = cursor;
    while (*end != '\0' && *end != ' ' && *end != '\n' && *end != '\t') {
      end += 1;
    }
    if ((size_t)(end - cursor) == token_length &&
        memcmp(cursor, token, token_length) == 0) {
      return true;
    }
    cursor = end;
  }
  return false;
}

static bool agent_linux_discover_runs(char *runs_path, size_t capacity) {
  FILE *membership = fopen("/proc/self/cgroup", "r");
  if (membership == NULL) {
    return false;
  }
  char line[PATH_MAX];
  const bool one_line = fgets(line, sizeof(line), membership) != NULL;
  const bool no_second_line = one_line && fgetc(membership) == EOF;
  const bool closed = fclose(membership) == 0;
  if (!one_line || !no_second_line || !closed || strncmp(line, "0::/", 4u) != 0) {
    return false;
  }
  const size_t length = strlen(line);
  if (length > 0u && line[length - 1u] == '\n') {
    line[length - 1u] = '\0';
  }
  const char *relative = line + 3u;
  const size_t relative_length = strlen(relative);
  const char suffix[] = "/" AGENT_LINUX_CONTROL_NAME;
  const size_t suffix_length = sizeof(suffix) - 1u;
  if (
    relative[0] != '/' ||
    strstr(relative, "//") != NULL ||
    strstr(relative, "/../") != NULL ||
    strstr(relative, "/./") != NULL ||
    relative_length <= suffix_length ||
    strcmp(relative + relative_length - suffix_length, suffix) != 0
  ) {
    return false;
  }
  const size_t parent_length = relative_length - suffix_length;
  const int written = snprintf(
    runs_path,
    capacity,
    "%s%.*s/%s",
    AGENT_LINUX_CGROUP_MOUNT,
    (int)parent_length,
    relative,
    AGENT_LINUX_RUNS_NAME
  );
  return written > 0 && (size_t)written < capacity;
}

static bool agent_linux_prepare_containment(
  const struct agent_broker_request *request,
  struct agent_linux_containment *containment
) {
  memset(containment, 0, sizeof(*containment));
  containment->runs_directory = -1;
  containment->run_directory = -1;
  char runs_path[PATH_MAX];
  if (!agent_linux_discover_runs(runs_path, sizeof(runs_path))) {
    return false;
  }
  struct statfs filesystem;
  struct stat metadata;
  if (
    statfs(runs_path, &filesystem) != 0 ||
    (unsigned long)filesystem.f_type != (unsigned long)CGROUP2_SUPER_MAGIC ||
    lstat(runs_path, &metadata) != 0 ||
    !S_ISDIR(metadata.st_mode) ||
    metadata.st_uid != getuid()
  ) {
    return false;
  }
  containment->runs_directory = open(
    runs_path,
    O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW
  );
  if (containment->runs_directory < 0) {
    return false;
  }
  char controllers[4096];
  size_t controller_length = 0u;
  char processes[2];
  size_t process_length = 0u;
  if (
    !agent_linux_read_text_at(
      containment->runs_directory,
      "cgroup.controllers",
      controllers,
      sizeof(controllers),
      &controller_length
    ) ||
    controller_length == 0u ||
    !agent_linux_token_present(controllers, "pids") ||
    !agent_linux_read_text_at(
      containment->runs_directory,
      "cgroup.procs",
      processes,
      sizeof(processes),
      &process_length
    ) ||
    process_length != 0u ||
    !agent_linux_write_text_at(
      containment->runs_directory,
      "cgroup.subtree_control",
      "+pids"
    )
  ) {
    return false;
  }

  uint64_t random_value = 0u;
  if (getrandom(
    &random_value,
    sizeof(random_value),
    0u
  ) != (ssize_t)sizeof(random_value)) {
    return false;
  }
  const int name_length = snprintf(
    containment->run_name,
    sizeof(containment->run_name),
    "run-%lu-%016llx",
    (unsigned long)getpid(),
    (unsigned long long)random_value
  );
  if (name_length <= 0 || (size_t)name_length >= sizeof(containment->run_name)) {
    return false;
  }
  if (mkdirat(containment->runs_directory, containment->run_name, 0700) != 0) {
    return false;
  }
  containment->run_directory = openat(
    containment->runs_directory,
    containment->run_name,
    O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW
  );
  if (containment->run_directory < 0) {
    return false;
  }
  char process_limit[32];
  const unsigned long internal_limit = (unsigned long)request->process_limit + 1ul;
  const int limit_length = snprintf(
    process_limit,
    sizeof(process_limit),
    "%lu",
    internal_limit
  );
  const int kill_descriptor = openat(
    containment->run_directory,
    "cgroup.kill",
    O_WRONLY | O_CLOEXEC | O_NOFOLLOW
  );
  if (
    limit_length <= 0 ||
    (size_t)limit_length >= sizeof(process_limit) ||
    kill_descriptor < 0 ||
    close(kill_descriptor) != 0 ||
    !agent_linux_write_text_at(
      containment->run_directory,
      "pids.max",
      process_limit
    )
  ) {
    return false;
  }
  return true;
}

static bool agent_linux_populated(int run_directory, bool *populated) {
  char events[256];
  size_t length = 0u;
  if (!agent_linux_read_text_at(
    run_directory,
    "cgroup.events",
    events,
    sizeof(events),
    &length
  ) || length == 0u) {
    return false;
  }
  const char *entry = strstr(events, "populated ");
  if (entry == NULL || (entry[10] != '0' && entry[10] != '1')) {
    return false;
  }
  *populated = entry[10] == '1';
  return true;
}

static uint64_t agent_linux_now_milliseconds(void) {
  struct timespec value;
  if (clock_gettime(CLOCK_MONOTONIC, &value) != 0) {
    return UINT64_MAX;
  }
  return (uint64_t)value.tv_sec * 1000u + (uint64_t)value.tv_nsec / 1000000u;
}

static void agent_linux_pause(void) {
  const struct timespec duration = {
    .tv_sec = 0,
    .tv_nsec = (long)AGENT_LINUX_MONITOR_SLICE_MS * 1000000L
  };
  (void)nanosleep(&duration, NULL);
}

static bool agent_linux_kill_and_wait(
  const struct agent_linux_containment *containment
) {
  bool populated = false;
  if (!agent_linux_populated(containment->run_directory, &populated)) {
    return false;
  }
  if (populated && !agent_linux_write_text_at(
    containment->run_directory,
    "cgroup.kill",
    "1"
  )) {
    return false;
  }
  const uint64_t start = agent_linux_now_milliseconds();
  if (start == UINT64_MAX) {
    return false;
  }
  const uint64_t deadline = start + AGENT_LINUX_CLEANUP_TIMEOUT_MS;
  for (;;) {
    if (!agent_linux_populated(containment->run_directory, &populated)) {
      return false;
    }
    if (!populated) {
      return true;
    }
    const uint64_t now = agent_linux_now_milliseconds();
    if (now == UINT64_MAX || now >= deadline) {
      return false;
    }
    agent_linux_pause();
  }
}

static bool agent_linux_remove_containment(
  struct agent_linux_containment *containment
) {
  bool succeeded = true;
  if (containment->run_directory >= 0) {
    succeeded = close(containment->run_directory) == 0 && succeeded;
    containment->run_directory = -1;
  }
  if (containment->run_name[0] != '\0' && containment->runs_directory >= 0) {
    succeeded = unlinkat(
      containment->runs_directory,
      containment->run_name,
      AT_REMOVEDIR
    ) == 0 && succeeded;
    containment->run_name[0] = '\0';
  }
  if (containment->runs_directory >= 0) {
    succeeded = close(containment->runs_directory) == 0 && succeeded;
    containment->runs_directory = -1;
  }
  return succeeded;
}

static void agent_linux_child_failure(int descriptor, uint32_t failure) {
  (void)agent_linux_write_all(descriptor, &failure, sizeof(failure));
  _exit(AGENT_LINUX_GUARD_FAILURE_EXIT);
}

static bool agent_linux_drop_capabilities(void) {
  struct __user_cap_header_struct header = {
    .version = _LINUX_CAPABILITY_VERSION_3,
    .pid = 0
  };
  struct __user_cap_data_struct capabilities[2];
  memset(capabilities, 0, sizeof(capabilities));
  if (prctl(PR_CAP_AMBIENT, PR_CAP_AMBIENT_CLEAR_ALL, 0u, 0u, 0u) != 0) {
    return false;
  }
  for (int capability = 0; capability <= CAP_LAST_CAP; capability += 1) {
    if (prctl(PR_CAPBSET_DROP, capability, 0u, 0u, 0u) != 0 && errno != EINVAL) {
      return false;
    }
  }
  return syscall(SYS_capset, &header, capabilities) == 0;
}

static uint32_t agent_linux_mount_cgroup_view(void) {
  const int filesystem = (int)syscall(
    SYS_fsopen,
    "cgroup2",
    FSOPEN_CLOEXEC
  );
  if (filesystem < 0) {
    return 13u;
  }
  if (syscall(
    SYS_fsconfig,
    filesystem,
    FSCONFIG_CMD_CREATE,
    NULL,
    NULL,
    0
  ) != 0) {
    (void)close(filesystem);
    return 14u;
  }
  const int mount_descriptor = (int)syscall(
    SYS_fsmount,
    filesystem,
    FSMOUNT_CLOEXEC,
    MOUNT_ATTR_RDONLY |
      MOUNT_ATTR_NOSUID |
      MOUNT_ATTR_NODEV |
      MOUNT_ATTR_NOEXEC
  );
  if (mount_descriptor < 0) {
    (void)close(filesystem);
    return 19u;
  }
  if (close(filesystem) != 0) {
    (void)close(mount_descriptor);
    return 20u;
  }
  if (syscall(
    SYS_move_mount,
    mount_descriptor,
    "",
    AT_FDCWD,
    AGENT_LINUX_CGROUP_MOUNT,
    MOVE_MOUNT_F_EMPTY_PATH
  ) != 0) {
    (void)close(mount_descriptor);
    return 21u;
  }
  if (close(mount_descriptor) != 0) {
    return 22u;
  }
  return 0u;
}

static void agent_linux_target(
  const struct agent_broker_request *request,
  char *const *arguments,
  int exec_status
) {
  const int null_input = open("/dev/null", O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (
    null_input < 0 ||
    dup2(null_input, STDIN_FILENO) < 0 ||
    dup2(3, STDOUT_FILENO) < 0 ||
    dup2(4, STDERR_FILENO) < 0
  ) {
    agent_linux_child_failure(exec_status, AGENT_BROKER_FAILURE_LAUNCH);
  }
  if (
    exec_status <= 4 ||
    syscall(SYS_close_range, 3u, (unsigned int)exec_status - 1u, 0u) != 0 ||
    syscall(
      SYS_close_range,
      (unsigned int)exec_status + 1u,
      UINT_MAX,
      0u
    ) != 0
  ) {
    agent_linux_child_failure(exec_status, AGENT_BROKER_FAILURE_CAPABILITY);
  }
  char *const empty_environment[] = { NULL };
  execve(request->program, arguments, empty_environment);
  agent_linux_child_failure(exec_status, AGENT_BROKER_FAILURE_LAUNCH);
}

static int agent_linux_status_to_exit(int status) {
  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }
  if (WIFSIGNALED(status)) {
    const int conventional = 128 + WTERMSIG(status);
    return conventional <= 255 ? conventional : 255;
  }
  return AGENT_LINUX_GUARD_FAILURE_EXIT;
}

static void agent_linux_guard(
  const struct agent_broker_request *request,
  char *const *arguments,
  int setup_input,
  int setup_status
) {
  if (prctl(PR_SET_PDEATHSIG, SIGKILL, 0u, 0u, 0u) != 0) {
    agent_linux_diagnostic(10u);
    agent_linux_child_failure(setup_status, AGENT_BROKER_FAILURE_CONTAINMENT);
  }
  unsigned char ready = 0u;
  if (!agent_linux_read_all(setup_input, &ready, 1u) || ready != 1u) {
    _exit(AGENT_LINUX_GUARD_FAILURE_EXIT);
  }
  close(setup_input);
  if (syscall(SYS_unshare, CLONE_NEWCGROUP) != 0) {
    agent_linux_diagnostic(18u);
    agent_linux_child_failure(setup_status, AGENT_BROKER_FAILURE_CONTAINMENT);
  }
  if (mount(NULL, "/", NULL, MS_REC | MS_PRIVATE, NULL) != 0) {
    agent_linux_diagnostic(11u);
    agent_linux_child_failure(setup_status, AGENT_BROKER_FAILURE_CONTAINMENT);
  }
  if (mount(
      "proc",
      "/proc",
      "proc",
      MS_NOSUID | MS_NODEV | MS_NOEXEC,
      NULL
    ) != 0) {
    agent_linux_diagnostic(12u);
    agent_linux_child_failure(setup_status, AGENT_BROKER_FAILURE_CONTAINMENT);
  }
  const uint32_t cgroup_mount_stage = agent_linux_mount_cgroup_view();
  if (cgroup_mount_stage != 0u) {
    agent_linux_diagnostic(cgroup_mount_stage);
    agent_linux_child_failure(setup_status, AGENT_BROKER_FAILURE_CONTAINMENT);
  }
  if (chdir(request->working_directory) != 0) {
    agent_linux_diagnostic(15u);
    agent_linux_child_failure(setup_status, AGENT_BROKER_FAILURE_CONTAINMENT);
  }
  if (prctl(PR_SET_NO_NEW_PRIVS, 1u, 0u, 0u, 0u) != 0) {
    agent_linux_diagnostic(16u);
    agent_linux_child_failure(setup_status, AGENT_BROKER_FAILURE_CONTAINMENT);
  }
  if (!agent_linux_drop_capabilities()) {
    agent_linux_diagnostic(17u);
    agent_linux_child_failure(setup_status, AGENT_BROKER_FAILURE_CONTAINMENT);
  }

  int exec_pipe[2];
  if (pipe2(exec_pipe, O_CLOEXEC) != 0) {
    agent_linux_child_failure(setup_status, AGENT_BROKER_FAILURE_LAUNCH);
  }
  const pid_t target = fork();
  if (target < 0) {
    agent_linux_child_failure(setup_status, AGENT_BROKER_FAILURE_LAUNCH);
  }
  if (target == 0) {
    close(exec_pipe[0]);
    close(setup_status);
    agent_linux_target(request, arguments, exec_pipe[1]);
  }
  close(exec_pipe[1]);
  close(3);
  close(4);
  uint32_t exec_failure = 0u;
  ssize_t exec_result = 0;
  do {
    exec_result = read(exec_pipe[0], &exec_failure, sizeof(exec_failure));
  } while (exec_result < 0 && errno == EINTR);
  close(exec_pipe[0]);
  if (exec_result != 0) {
    if (exec_result != (ssize_t)sizeof(exec_failure)) {
      exec_failure = AGENT_BROKER_FAILURE_LAUNCH;
    }
    (void)kill(target, SIGKILL);
    (void)waitpid(target, NULL, 0);
    agent_linux_child_failure(setup_status, exec_failure);
  }
  const uint32_t ready_status = 0u;
  if (!agent_linux_write_all(setup_status, &ready_status, sizeof(ready_status))) {
    (void)kill(target, SIGKILL);
    (void)waitpid(target, NULL, 0);
    _exit(AGENT_LINUX_GUARD_FAILURE_EXIT);
  }
  close(setup_status);

  int target_status = 0;
  bool target_reaped = false;
  for (;;) {
    int status = 0;
    const pid_t reaped = waitpid(-1, &status, 0);
    if (reaped < 0 && errno == EINTR) {
      continue;
    }
    if (reaped < 0 && errno == ECHILD) {
      break;
    }
    if (reaped < 0) {
      _exit(AGENT_LINUX_GUARD_FAILURE_EXIT);
    }
    if (reaped == target) {
      target_status = status;
      target_reaped = true;
    }
  }
  _exit(target_reaped
    ? agent_linux_status_to_exit(target_status)
    : AGENT_LINUX_GUARD_FAILURE_EXIT);
}

static bool agent_linux_write_identity_map(
  pid_t process_id,
  const char *name,
  const char *mapping
) {
  char path[128];
  const int length = snprintf(
    path,
    sizeof(path),
    "/proc/%lu/%s",
    (unsigned long)process_id,
    name
  );
  if (length <= 0 || (size_t)length >= sizeof(path)) {
    return false;
  }
  const int descriptor = open(path, O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
  if (descriptor < 0) {
    return false;
  }
  const bool succeeded = agent_linux_write_all(
    descriptor,
    mapping,
    strlen(mapping)
  );
  const bool closed = close(descriptor) == 0;
  return succeeded && closed;
}

static bool agent_linux_map_identity(pid_t process_id) {
  char user_mapping[64];
  char group_mapping[64];
  const int user_length = snprintf(
    user_mapping,
    sizeof(user_mapping),
    "0 %lu 1\n",
    (unsigned long)getuid()
  );
  const int group_length = snprintf(
    group_mapping,
    sizeof(group_mapping),
    "0 %lu 1\n",
    (unsigned long)getgid()
  );
  return user_length > 0 && (size_t)user_length < sizeof(user_mapping) &&
    group_length > 0 && (size_t)group_length < sizeof(group_mapping) &&
    agent_linux_write_identity_map(process_id, "setgroups", "deny\n") &&
    agent_linux_write_identity_map(process_id, "uid_map", user_mapping) &&
    agent_linux_write_identity_map(process_id, "gid_map", group_mapping);
}

static pid_t agent_linux_clone_guard(
  int cgroup_descriptor,
  int *pid_descriptor
) {
  struct clone_args arguments;
  memset(&arguments, 0, sizeof(arguments));
  arguments.flags = CLONE_PIDFD |
    CLONE_INTO_CGROUP |
    CLONE_NEWUSER |
    CLONE_NEWPID |
    CLONE_NEWNS;
  arguments.pidfd = (uint64_t)(uintptr_t)pid_descriptor;
  arguments.cgroup = (uint64_t)cgroup_descriptor;
  arguments.exit_signal = SIGCHLD;
  return (pid_t)syscall(SYS_clone3, &arguments, sizeof(arguments));
}

static uint32_t agent_linux_wait_setup(
  int setup_status,
  int pid_descriptor
) {
  const uint64_t start = agent_linux_now_milliseconds();
  if (start == UINT64_MAX) {
    return AGENT_BROKER_FAILURE_MONITOR;
  }
  const uint64_t deadline = start + AGENT_LINUX_SETUP_TIMEOUT_MS;
  for (;;) {
    const uint64_t now = agent_linux_now_milliseconds();
    if (now == UINT64_MAX || now >= deadline) {
      return AGENT_BROKER_FAILURE_CONTAINMENT;
    }
    const int remaining = (int)(deadline - now);
    struct pollfd descriptors[2] = {
      { .fd = setup_status, .events = POLLIN | POLLHUP, .revents = 0 },
      { .fd = pid_descriptor, .events = POLLIN, .revents = 0 }
    };
    const int polled = poll(descriptors, 2u, remaining);
    if (polled < 0 && errno == EINTR) {
      continue;
    }
    if (polled <= 0) {
      return AGENT_BROKER_FAILURE_CONTAINMENT;
    }
    if ((descriptors[0].revents & POLLIN) != 0) {
      uint32_t status = AGENT_BROKER_FAILURE_CONTAINMENT;
      return agent_linux_read_all(setup_status, &status, sizeof(status))
        ? status
        : AGENT_BROKER_FAILURE_CONTAINMENT;
    }
    if ((descriptors[0].revents & POLLHUP) != 0) {
      return AGENT_BROKER_FAILURE_CONTAINMENT;
    }
    if ((descriptors[1].revents & POLLIN) != 0 ||
        (descriptors[0].revents & (POLLERR | POLLNVAL)) != 0) {
      return AGENT_BROKER_FAILURE_CONTAINMENT;
    }
  }
}

static uint32_t agent_linux_poll_control(void) {
  struct pollfd descriptor = {
    .fd = STDIN_FILENO,
    .events = POLLIN | POLLHUP,
    .revents = 0
  };
  const int polled = poll(&descriptor, 1u, 0);
  if (polled < 0) {
    return errno == EINTR ? 0u : AGENT_BROKER_FAILURE_MONITOR;
  }
  if ((descriptor.revents & POLLHUP) != 0) {
    return AGENT_BROKER_OUTCOME_CANCELLED;
  }
  if ((descriptor.revents & (POLLERR | POLLNVAL)) != 0) {
    return AGENT_BROKER_FAILURE_MONITOR;
  }
  int available = 0;
  if (ioctl(STDIN_FILENO, FIONREAD, &available) != 0) {
    return errno == EPIPE
      ? AGENT_BROKER_OUTCOME_CANCELLED
      : AGENT_BROKER_FAILURE_MONITOR;
  }
  if (available == 0) {
    return 0u;
  }
  if (available < 12 || !agent_protocol_read_cancel(stdin)) {
    return AGENT_BROKER_FAILURE_PROTOCOL;
  }
  return AGENT_BROKER_OUTCOME_CANCELLED;
}

static bool agent_linux_wait_guard(pid_t guard, int *status) {
  for (;;) {
    const pid_t result = waitpid(guard, status, 0);
    if (result < 0 && errno == EINTR) {
      continue;
    }
    return result == guard;
  }
}

struct agent_broker_result agent_backend_run(
  const struct agent_broker_request *request
) {
  struct agent_broker_result result = agent_linux_failure(
    AGENT_BROKER_FAILURE_CAPABILITY
  );
  struct agent_linux_containment containment;
  memset(&containment, 0, sizeof(containment));
  containment.runs_directory = -1;
  containment.run_directory = -1;
  int setup_input[2] = { -1, -1 };
  int setup_status[2] = { -1, -1 };
  int pid_descriptor = -1;
  pid_t guard = -1;
  bool guard_reaped = false;

  if (
    fcntl(3, F_GETFD) < 0 ||
    fcntl(4, F_GETFD) < 0 ||
    !agent_linux_prepare_containment(request, &containment)
  ) {
    goto cleanup;
  }
  char **arguments = calloc(
    (size_t)request->argument_count + 2u,
    sizeof(char *)
  );
  if (arguments == NULL) {
    goto cleanup;
  }
  arguments[0] = request->program;
  for (uint32_t index = 0u; index < request->argument_count; index += 1u) {
    arguments[index + 1u] = request->arguments[index];
  }

  if (
    pipe2(setup_input, O_CLOEXEC) != 0 ||
    pipe2(setup_status, O_CLOEXEC) != 0
  ) {
    free(arguments);
    result = agent_linux_failure(AGENT_BROKER_FAILURE_CAPABILITY);
    goto cleanup;
  }
  guard = agent_linux_clone_guard(containment.run_directory, &pid_descriptor);
  if (guard == 0) {
    close(setup_input[1]);
    close(setup_status[0]);
    agent_linux_guard(
      request,
      arguments,
      setup_input[0],
      setup_status[1]
    );
  }
  free(arguments);
  if (guard < 0 || pid_descriptor < 0) {
    agent_linux_diagnostic(20u);
    result = agent_linux_failure(AGENT_BROKER_FAILURE_CONTAINMENT);
    goto cleanup;
  }
  close(setup_input[0]);
  setup_input[0] = -1;
  close(setup_status[1]);
  setup_status[1] = -1;
  close(3);
  close(4);

  if (!agent_linux_map_identity(guard) ||
      !agent_linux_write_all(setup_input[1], "\1", 1u)) {
    agent_linux_diagnostic(21u);
    result = agent_linux_failure(AGENT_BROKER_FAILURE_CONTAINMENT);
    goto cleanup;
  }
  close(setup_input[1]);
  setup_input[1] = -1;
  const uint32_t setup_result = agent_linux_wait_setup(
    setup_status[0],
    pid_descriptor
  );
  close(setup_status[0]);
  setup_status[0] = -1;
  if (setup_result != 0u) {
    if (setup_result == AGENT_BROKER_FAILURE_CONTAINMENT) {
      agent_linux_diagnostic(22u);
    }
    result = agent_linux_failure(setup_result);
    goto cleanup;
  }
  const uint32_t prelaunch_control = agent_linux_poll_control();
  if (prelaunch_control == AGENT_BROKER_OUTCOME_CANCELLED) {
    if (
      !agent_protocol_write_started(stdout, (uint64_t)guard) ||
      !agent_linux_kill_and_wait(&containment)
    ) {
      result = agent_linux_failure(AGENT_BROKER_FAILURE_CLEANUP);
      goto cleanup;
    }
    int cancelled_status = 0;
    if (!agent_linux_wait_guard(guard, &cancelled_status)) {
      result = agent_linux_failure(AGENT_BROKER_FAILURE_CLEANUP);
      goto cleanup;
    }
    guard_reaped = true;
    result = agent_linux_success(
      AGENT_BROKER_OUTCOME_CANCELLED,
      false,
      0
    );
    goto cleanup;
  }
  if (prelaunch_control != 0u) {
    result = agent_linux_failure(prelaunch_control);
    goto cleanup;
  }
  if (!agent_protocol_write_started(stdout, (uint64_t)guard)) {
    result = agent_linux_failure(AGENT_BROKER_FAILURE_MONITOR);
    goto cleanup;
  }

  const uint64_t start = agent_linux_now_milliseconds();
  if (start == UINT64_MAX) {
    result = agent_linux_failure(AGENT_BROKER_FAILURE_MONITOR);
    goto cleanup;
  }
  const uint64_t deadline = start + request->timeout_ms;
  uint8_t requested_outcome = 0u;
  uint32_t monitor_failure = 0u;
  for (;;) {
    const uint64_t now = agent_linux_now_milliseconds();
    if (now == UINT64_MAX) {
      monitor_failure = AGENT_BROKER_FAILURE_MONITOR;
      break;
    }
    if (now >= deadline) {
      requested_outcome = AGENT_BROKER_OUTCOME_TIMED_OUT;
      break;
    }
    const int remaining = (int)(deadline - now);
    const int wait = remaining < (int)AGENT_LINUX_MONITOR_SLICE_MS
      ? remaining
      : (int)AGENT_LINUX_MONITOR_SLICE_MS;
    struct pollfd descriptors[2] = {
      { .fd = pid_descriptor, .events = POLLIN, .revents = 0 },
      { .fd = STDIN_FILENO, .events = POLLIN | POLLHUP, .revents = 0 }
    };
    const int polled = poll(descriptors, 2u, wait);
    if (polled < 0 && errno == EINTR) {
      continue;
    }
    if (polled < 0) {
      monitor_failure = AGENT_BROKER_FAILURE_MONITOR;
      break;
    }
    if ((descriptors[0].revents & POLLIN) != 0) {
      break;
    }
    if ((descriptors[1].revents & POLLHUP) != 0) {
      requested_outcome = AGENT_BROKER_OUTCOME_CANCELLED;
      break;
    }
    if ((descriptors[1].revents & POLLIN) != 0) {
      const uint32_t control = agent_linux_poll_control();
      if (control == AGENT_BROKER_OUTCOME_CANCELLED) {
        requested_outcome = AGENT_BROKER_OUTCOME_CANCELLED;
        break;
      }
      if (control != 0u) {
        monitor_failure = control;
        break;
      }
    }
    if ((descriptors[0].revents & (POLLERR | POLLNVAL)) != 0 ||
        (descriptors[1].revents & (POLLERR | POLLNVAL)) != 0) {
      monitor_failure = AGENT_BROKER_FAILURE_MONITOR;
      break;
    }
  }

  if (requested_outcome != 0u || monitor_failure != 0u) {
    if (!agent_linux_kill_and_wait(&containment)) {
      result = agent_linux_failure(AGENT_BROKER_FAILURE_CLEANUP);
      goto cleanup;
    }
  }
  int guard_status = 0;
  if (!agent_linux_wait_guard(guard, &guard_status)) {
    result = agent_linux_failure(AGENT_BROKER_FAILURE_CLEANUP);
    goto cleanup;
  }
  guard_reaped = true;
  if (!agent_linux_kill_and_wait(&containment)) {
    result = agent_linux_failure(AGENT_BROKER_FAILURE_CLEANUP);
  } else if (monitor_failure != 0u) {
    result = agent_linux_failure(monitor_failure);
  } else if (requested_outcome != 0u) {
    result = agent_linux_success(requested_outcome, false, 0);
  } else if (WIFEXITED(guard_status)) {
    result = agent_linux_success(
      AGENT_BROKER_OUTCOME_EXITED,
      true,
      WEXITSTATUS(guard_status)
    );
  } else if (WIFSIGNALED(guard_status)) {
    result = agent_linux_success(
      AGENT_BROKER_OUTCOME_EXITED,
      true,
      128 + WTERMSIG(guard_status)
    );
  } else {
    result = agent_linux_failure(AGENT_BROKER_FAILURE_MONITOR);
  }

cleanup:
  if (guard > 0 && !guard_reaped) {
    if (!agent_linux_kill_and_wait(&containment)) {
      result = agent_linux_failure(AGENT_BROKER_FAILURE_CLEANUP);
    }
    int ignored_status = 0;
    if (!agent_linux_wait_guard(guard, &ignored_status)) {
      result = agent_linux_failure(AGENT_BROKER_FAILURE_CLEANUP);
    }
  }
  if (setup_input[0] >= 0) {
    close(setup_input[0]);
  }
  if (setup_input[1] >= 0) {
    close(setup_input[1]);
  }
  if (setup_status[0] >= 0) {
    close(setup_status[0]);
  }
  if (setup_status[1] >= 0) {
    close(setup_status[1]);
  }
  if (pid_descriptor >= 0) {
    close(pid_descriptor);
  }
  if (!agent_linux_remove_containment(&containment)) {
    result = agent_linux_failure(AGENT_BROKER_FAILURE_CLEANUP);
  }
  return result;
}
