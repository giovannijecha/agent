#include "broker.h"

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

#include <fcntl.h>
#include <io.h>
#include <limits.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#define AGENT_WINDOWS_COMMAND_LINE_LIMIT 32767u
#define AGENT_WINDOWS_MONITOR_SLICE_MS 10u
#define AGENT_WINDOWS_CLEANUP_TIMEOUT_MS 5000u

struct agent_wide_arguments {
  wchar_t *program;
  wchar_t *working_directory;
  wchar_t **arguments;
  uint32_t argument_count;
  wchar_t *command_line;
};

static struct agent_broker_result agent_windows_failure(uint32_t failure) {
  const struct agent_broker_result result = {
    .succeeded = false,
    .failure = failure,
    .outcome = 0u,
    .exit_code_known = false,
    .exit_code = 0
  };
  return result;
}

static struct agent_broker_result agent_windows_success(
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

static wchar_t *agent_windows_widen(const char *value) {
  const size_t byte_length = strlen(value);
  if (byte_length == 0u) {
    return calloc(1u, sizeof(wchar_t));
  }
  if (byte_length > (size_t)INT_MAX) {
    return NULL;
  }
  const int required = MultiByteToWideChar(
    CP_UTF8,
    MB_ERR_INVALID_CHARS,
    value,
    (int)byte_length,
    NULL,
    0
  );
  if (required <= 0) {
    return NULL;
  }
  wchar_t *wide = calloc((size_t)required + 1u, sizeof(wchar_t));
  if (wide == NULL) {
    return NULL;
  }
  const int written = MultiByteToWideChar(
    CP_UTF8,
    MB_ERR_INVALID_CHARS,
    value,
    (int)byte_length,
    wide,
    required
  );
  if (written != required) {
    free(wide);
    return NULL;
  }
  wide[required] = L'\0';
  return wide;
}

static bool agent_windows_argument_needs_quotes(const wchar_t *argument) {
  if (argument[0] == L'\0') {
    return true;
  }
  for (size_t index = 0u; argument[index] != L'\0'; index += 1u) {
    if (
      argument[index] == L' ' ||
      argument[index] == L'\t' ||
      argument[index] == L'\v' ||
      argument[index] == L'"'
    ) {
      return true;
    }
  }
  return false;
}

static bool agent_windows_append_character(
  wchar_t *buffer,
  size_t *length,
  wchar_t character
) {
  if (*length >= AGENT_WINDOWS_COMMAND_LINE_LIMIT) {
    return false;
  }
  buffer[*length] = character;
  *length += 1u;
  return true;
}

static bool agent_windows_append_repeated(
  wchar_t *buffer,
  size_t *length,
  wchar_t character,
  size_t count
) {
  if (count > AGENT_WINDOWS_COMMAND_LINE_LIMIT - *length) {
    return false;
  }
  for (size_t index = 0u; index < count; index += 1u) {
    buffer[*length + index] = character;
  }
  *length += count;
  return true;
}

static bool agent_windows_append_argument(
  wchar_t *buffer,
  size_t *length,
  const wchar_t *argument
) {
  if (!agent_windows_argument_needs_quotes(argument)) {
    const size_t argument_length = wcslen(argument);
    if (argument_length > AGENT_WINDOWS_COMMAND_LINE_LIMIT - *length) {
      return false;
    }
    memcpy(
      buffer + *length,
      argument,
      argument_length * sizeof(wchar_t)
    );
    *length += argument_length;
    return true;
  }

  if (!agent_windows_append_character(buffer, length, L'"')) {
    return false;
  }
  size_t backslashes = 0u;
  for (size_t index = 0u;; index += 1u) {
    const wchar_t character = argument[index];
    if (character == L'\\') {
      backslashes += 1u;
      continue;
    }
    if (character == L'"') {
      if (
        !agent_windows_append_repeated(
          buffer,
          length,
          L'\\',
          backslashes * 2u + 1u
        ) ||
        !agent_windows_append_character(buffer, length, L'"')
      ) {
        return false;
      }
      backslashes = 0u;
      continue;
    }
    if (character == L'\0') {
      return agent_windows_append_repeated(
          buffer,
          length,
          L'\\',
          backslashes * 2u
        ) &&
        agent_windows_append_character(buffer, length, L'"');
    }
    if (
      !agent_windows_append_repeated(
        buffer,
        length,
        L'\\',
        backslashes
      ) ||
      !agent_windows_append_character(buffer, length, character)
    ) {
      return false;
    }
    backslashes = 0u;
  }
}

static void agent_windows_dispose_arguments(
  struct agent_wide_arguments *wide
) {
  if (wide->arguments != NULL) {
    for (uint32_t index = 0u; index < wide->argument_count; index += 1u) {
      free(wide->arguments[index]);
    }
  }
  free(wide->arguments);
  free(wide->program);
  free(wide->working_directory);
  free(wide->command_line);
  memset(wide, 0, sizeof(*wide));
}

static bool agent_windows_prepare_arguments(
  const struct agent_broker_request *request,
  struct agent_wide_arguments *wide
) {
  memset(wide, 0, sizeof(*wide));
  wide->argument_count = request->argument_count;
  wide->program = agent_windows_widen(request->program);
  wide->working_directory = agent_windows_widen(request->working_directory);
  if (wide->program == NULL || wide->working_directory == NULL) {
    agent_windows_dispose_arguments(wide);
    return false;
  }
  if (wide->argument_count > 0u) {
    wide->arguments = calloc(wide->argument_count, sizeof(wchar_t *));
    if (wide->arguments == NULL) {
      agent_windows_dispose_arguments(wide);
      return false;
    }
  }
  for (uint32_t index = 0u; index < wide->argument_count; index += 1u) {
    wide->arguments[index] = agent_windows_widen(request->arguments[index]);
    if (wide->arguments[index] == NULL) {
      agent_windows_dispose_arguments(wide);
      return false;
    }
  }

  wide->command_line = calloc(
    AGENT_WINDOWS_COMMAND_LINE_LIMIT + 1u,
    sizeof(wchar_t)
  );
  if (wide->command_line == NULL) {
    agent_windows_dispose_arguments(wide);
    return false;
  }
  size_t length = 0u;
  if (!agent_windows_append_argument(wide->command_line, &length, wide->program)) {
    agent_windows_dispose_arguments(wide);
    return false;
  }
  for (uint32_t index = 0u; index < wide->argument_count; index += 1u) {
    if (
      !agent_windows_append_character(wide->command_line, &length, L' ') ||
      !agent_windows_append_argument(
        wide->command_line,
        &length,
        wide->arguments[index]
      )
    ) {
      agent_windows_dispose_arguments(wide);
      return false;
    }
  }
  wide->command_line[length] = L'\0';
  return true;
}

static bool agent_windows_duplicate_inheritable(
  int descriptor,
  HANDLE *duplicate
) {
  const intptr_t raw = _get_osfhandle(descriptor);
  if (raw == -1) {
    return false;
  }
  return DuplicateHandle(
    GetCurrentProcess(),
    (HANDLE)raw,
    GetCurrentProcess(),
    duplicate,
    0u,
    TRUE,
    DUPLICATE_SAME_ACCESS
  ) != 0;
}

static bool agent_windows_job_empty(HANDLE job, bool *empty) {
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION information;
  memset(&information, 0, sizeof(information));
  if (!QueryInformationJobObject(
    job,
    JobObjectBasicAccountingInformation,
    &information,
    (DWORD)sizeof(information),
    NULL
  )) {
    return false;
  }
  *empty = information.ActiveProcesses == 0u;
  return true;
}

static bool agent_windows_wait_empty(HANDLE job, HANDLE completion_port) {
  const ULONGLONG deadline = GetTickCount64() +
    (ULONGLONG)AGENT_WINDOWS_CLEANUP_TIMEOUT_MS;
  for (;;) {
    bool empty = false;
    if (!agent_windows_job_empty(job, &empty)) {
      return false;
    }
    if (empty) {
      return true;
    }
    const ULONGLONG now = GetTickCount64();
    if (now >= deadline) {
      return false;
    }
    const DWORD wait = (DWORD)(deadline - now < AGENT_WINDOWS_MONITOR_SLICE_MS
      ? deadline - now
      : AGENT_WINDOWS_MONITOR_SLICE_MS);
    DWORD message = 0u;
    ULONG_PTR key = 0u;
    LPOVERLAPPED overlapped = NULL;
    (void)GetQueuedCompletionStatus(
      completion_port,
      &message,
      &key,
      &overlapped,
      wait
    );
  }
}

static uint32_t agent_windows_poll_control(HANDLE input) {
  DWORD available = 0u;
  if (!PeekNamedPipe(input, NULL, 0u, NULL, &available, NULL)) {
    const DWORD error = GetLastError();
    return error == ERROR_BROKEN_PIPE
      ? AGENT_BROKER_OUTCOME_CANCELLED
      : AGENT_BROKER_FAILURE_MONITOR;
  }
  if (available == 0u) {
    return 0u;
  }
  if (available < 12u || !agent_protocol_read_cancel(stdin)) {
    return AGENT_BROKER_FAILURE_PROTOCOL;
  }
  return AGENT_BROKER_OUTCOME_CANCELLED;
}

static bool agent_windows_terminate_and_wait(
  HANDLE job,
  HANDLE completion_port
) {
  bool empty = false;
  if (!agent_windows_job_empty(job, &empty)) {
    return false;
  }
  if (!empty && !TerminateJobObject(job, 1u)) {
    return false;
  }
  return agent_windows_wait_empty(job, completion_port);
}

struct agent_broker_result agent_backend_run(
  const struct agent_broker_request *request
) {
  struct agent_broker_result result = agent_windows_failure(
    AGENT_BROKER_FAILURE_CAPABILITY
  );
  struct agent_wide_arguments wide;
  memset(&wide, 0, sizeof(wide));
  HANDLE job = NULL;
  HANDLE completion_port = NULL;
  HANDLE null_input = INVALID_HANDLE_VALUE;
  HANDLE target_output = NULL;
  HANDLE target_error = NULL;
  LPPROC_THREAD_ATTRIBUTE_LIST attributes = NULL;
  PROCESS_INFORMATION process;
  memset(&process, 0, sizeof(process));
  bool process_created = false;
  bool process_assigned = false;

  const intptr_t input_raw = _get_osfhandle(_fileno(stdin));
  if (
    input_raw == -1 ||
    GetFileType((HANDLE)input_raw) != FILE_TYPE_PIPE ||
    !agent_windows_prepare_arguments(request, &wide)
  ) {
    goto cleanup;
  }

  job = CreateJobObjectW(NULL, NULL);
  completion_port = CreateIoCompletionPort(
    INVALID_HANDLE_VALUE,
    NULL,
    0u,
    1u
  );
  if (job == NULL || completion_port == NULL) {
    goto cleanup;
  }

  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
  memset(&limits, 0, sizeof(limits));
  limits.BasicLimitInformation.LimitFlags =
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |
    JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
  limits.BasicLimitInformation.ActiveProcessLimit = request->process_limit;
  if (!SetInformationJobObject(
    job,
    JobObjectExtendedLimitInformation,
    &limits,
    (DWORD)sizeof(limits)
  )) {
    result = agent_windows_failure(AGENT_BROKER_FAILURE_CONTAINMENT);
    goto cleanup;
  }
  JOBOBJECT_ASSOCIATE_COMPLETION_PORT association = {
    .CompletionKey = job,
    .CompletionPort = completion_port
  };
  if (!SetInformationJobObject(
    job,
    JobObjectAssociateCompletionPortInformation,
    &association,
    (DWORD)sizeof(association)
  )) {
    result = agent_windows_failure(AGENT_BROKER_FAILURE_CONTAINMENT);
    goto cleanup;
  }

  SECURITY_ATTRIBUTES security = {
    .nLength = sizeof(security),
    .lpSecurityDescriptor = NULL,
    .bInheritHandle = TRUE
  };
  null_input = CreateFileW(
    L"NUL",
    GENERIC_READ,
    FILE_SHARE_READ | FILE_SHARE_WRITE,
    &security,
    OPEN_EXISTING,
    FILE_ATTRIBUTE_NORMAL,
    NULL
  );
  if (
    null_input == INVALID_HANDLE_VALUE ||
    !agent_windows_duplicate_inheritable(3, &target_output) ||
    !agent_windows_duplicate_inheritable(4, &target_error)
  ) {
    result = agent_windows_failure(AGENT_BROKER_FAILURE_CAPABILITY);
    goto cleanup;
  }

  SIZE_T attribute_bytes = 0u;
  (void)InitializeProcThreadAttributeList(NULL, 1u, 0u, &attribute_bytes);
  if (attribute_bytes == 0u) {
    result = agent_windows_failure(AGENT_BROKER_FAILURE_CONTAINMENT);
    goto cleanup;
  }
  attributes = malloc(attribute_bytes);
  if (
    attributes == NULL ||
    !InitializeProcThreadAttributeList(
      attributes,
      1u,
      0u,
      &attribute_bytes
    )
  ) {
    result = agent_windows_failure(AGENT_BROKER_FAILURE_CONTAINMENT);
    goto cleanup;
  }
  HANDLE inherited[3] = { null_input, target_output, target_error };
  if (!UpdateProcThreadAttribute(
    attributes,
    0u,
    PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
    inherited,
    sizeof(inherited),
    NULL,
    NULL
  )) {
    result = agent_windows_failure(AGENT_BROKER_FAILURE_CONTAINMENT);
    goto cleanup;
  }

  STARTUPINFOEXW startup;
  memset(&startup, 0, sizeof(startup));
  startup.StartupInfo.cb = sizeof(startup);
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = null_input;
  startup.StartupInfo.hStdOutput = target_output;
  startup.StartupInfo.hStdError = target_error;
  startup.lpAttributeList = attributes;
  wchar_t empty_environment[2] = { L'\0', L'\0' };
  if (!CreateProcessW(
    wide.program,
    wide.command_line,
    NULL,
    NULL,
    TRUE,
    CREATE_SUSPENDED |
      CREATE_UNICODE_ENVIRONMENT |
      CREATE_NO_WINDOW |
      EXTENDED_STARTUPINFO_PRESENT,
    empty_environment,
    wide.working_directory,
    &startup.StartupInfo,
    &process
  )) {
    result = agent_windows_failure(AGENT_BROKER_FAILURE_LAUNCH);
    goto cleanup;
  }
  process_created = true;
  if (!AssignProcessToJobObject(job, process.hProcess)) {
    result = agent_windows_failure(AGENT_BROKER_FAILURE_CONTAINMENT);
    goto cleanup;
  }
  process_assigned = true;

  const uint32_t prelaunch_control = agent_windows_poll_control(
    (HANDLE)input_raw
  );
  if (prelaunch_control == AGENT_BROKER_OUTCOME_CANCELLED) {
    if (
      !agent_protocol_write_started(stdout, (uint64_t)process.dwProcessId) ||
      !agent_windows_terminate_and_wait(job, completion_port)
    ) {
      result = agent_windows_failure(AGENT_BROKER_FAILURE_CLEANUP);
    } else {
      result = agent_windows_success(
        AGENT_BROKER_OUTCOME_CANCELLED,
        false,
        0
      );
    }
    goto cleanup;
  }
  if (prelaunch_control != 0u) {
    result = agent_windows_failure(prelaunch_control);
    goto cleanup;
  }
  if (ResumeThread(process.hThread) == (DWORD)-1) {
    result = agent_windows_failure(AGENT_BROKER_FAILURE_LAUNCH);
    goto cleanup;
  }
  CloseHandle(target_output);
  target_output = NULL;
  CloseHandle(target_error);
  target_error = NULL;
  CloseHandle(null_input);
  null_input = INVALID_HANDLE_VALUE;
  if (!agent_protocol_write_started(stdout, (uint64_t)process.dwProcessId)) {
    result = agent_windows_failure(AGENT_BROKER_FAILURE_MONITOR);
    goto cleanup;
  }

  const ULONGLONG deadline = GetTickCount64() + (ULONGLONG)request->timeout_ms;
  uint8_t requested_outcome = 0u;
  uint32_t monitor_failure = 0u;
  for (;;) {
    bool empty = false;
    if (!agent_windows_job_empty(job, &empty)) {
      monitor_failure = AGENT_BROKER_FAILURE_MONITOR;
      break;
    }
    if (empty) {
      DWORD exit_code = 0u;
      const bool exit_known = GetExitCodeProcess(process.hProcess, &exit_code) != 0 &&
        exit_code != STILL_ACTIVE;
      result = agent_windows_success(
        requested_outcome == 0u ? AGENT_BROKER_OUTCOME_EXITED : requested_outcome,
        requested_outcome == 0u && exit_known,
        exit_known ? (int32_t)exit_code : 0
      );
      break;
    }

    const uint32_t control = agent_windows_poll_control((HANDLE)input_raw);
    if (control == AGENT_BROKER_OUTCOME_CANCELLED) {
      requested_outcome = AGENT_BROKER_OUTCOME_CANCELLED;
      break;
    }
    if (control != 0u) {
      monitor_failure = control;
      break;
    }
    const ULONGLONG now = GetTickCount64();
    if (now >= deadline) {
      requested_outcome = AGENT_BROKER_OUTCOME_TIMED_OUT;
      break;
    }
    const DWORD wait = (DWORD)(deadline - now < AGENT_WINDOWS_MONITOR_SLICE_MS
      ? deadline - now
      : AGENT_WINDOWS_MONITOR_SLICE_MS);
    DWORD message = 0u;
    ULONG_PTR key = 0u;
    LPOVERLAPPED overlapped = NULL;
    (void)GetQueuedCompletionStatus(
      completion_port,
      &message,
      &key,
      &overlapped,
      wait
    );
  }

  if (requested_outcome != 0u || monitor_failure != 0u) {
    if (!agent_windows_terminate_and_wait(job, completion_port)) {
      result = agent_windows_failure(AGENT_BROKER_FAILURE_CLEANUP);
    } else if (monitor_failure != 0u) {
      result = agent_windows_failure(monitor_failure);
    } else {
      result = agent_windows_success(requested_outcome, false, 0);
    }
  }

cleanup:
  if (process_created && !result.succeeded) {
    bool stopped = false;
    if (process_assigned) {
      stopped = agent_windows_terminate_and_wait(job, completion_port);
    } else {
      const bool terminated = TerminateProcess(process.hProcess, 1u) != 0 ||
        GetLastError() == ERROR_ACCESS_DENIED;
      stopped = terminated &&
        WaitForSingleObject(
          process.hProcess,
          AGENT_WINDOWS_CLEANUP_TIMEOUT_MS
        ) == WAIT_OBJECT_0;
    }
    if (!stopped) {
      result = agent_windows_failure(AGENT_BROKER_FAILURE_CLEANUP);
    }
  }
  if (process.hThread != NULL) {
    CloseHandle(process.hThread);
  }
  if (process.hProcess != NULL) {
    CloseHandle(process.hProcess);
  }
  if (attributes != NULL) {
    DeleteProcThreadAttributeList(attributes);
  }
  free(attributes);
  if (target_error != NULL) {
    CloseHandle(target_error);
  }
  if (target_output != NULL) {
    CloseHandle(target_output);
  }
  if (null_input != INVALID_HANDLE_VALUE) {
    CloseHandle(null_input);
  }
  if (completion_port != NULL) {
    CloseHandle(completion_port);
  }
  if (job != NULL) {
    CloseHandle(job);
  }
  agent_windows_dispose_arguments(&wide);
  return result;
}
