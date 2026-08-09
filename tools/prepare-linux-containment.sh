#!/usr/bin/env bash

set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  printf '%s\n' 'Linux containment bootstrap is restricted to the owned CI runner.' >&2
  exit 1
fi
if [[ ! "${GITHUB_RUN_ID:-}" =~ ^[1-9][0-9]*$ ]] ||
   [[ ! "${GITHUB_RUN_ATTEMPT:-}" =~ ^[1-9][0-9]*$ ]]; then
  printf '%s\n' 'CI containment identity is malformed.' >&2
  exit 1
fi
if [[ "${1:-}" != "setup" && "${1:-}" != "cleanup" ]]; then
  printf '%s\n' 'Expected setup or cleanup operation.' >&2
  exit 1
fi
if [[ ! "${2:-}" =~ ^[1-9][0-9]*$ ]]; then
  printf '%s\n' 'Controller process identity is malformed.' >&2
  exit 1
fi

operation="$1"
controller_pid="$2"
current_uid="$(id -u)"
current_gid="$(id -g)"
cgroup_root='/sys/fs/cgroup'
apparmor_userns_restriction='/proc/sys/kernel/apparmor_restrict_unprivileged_userns'
delegation_name="agent-ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
delegation_root="${cgroup_root}/${delegation_name}"
control_group="${delegation_root}/control"
runs_group="${delegation_root}/runs"

case "$delegation_root" in
  /sys/fs/cgroup/agent-ci-[1-9]*-[1-9]*) ;;
  *)
    printf '%s\n' 'Resolved CI containment path is outside its owned boundary.' >&2
    exit 1
    ;;
esac

if [[ ! -f "${cgroup_root}/cgroup.controllers" ]] ||
   ! grep -qw pids "${cgroup_root}/cgroup.controllers"; then
  printf '%s\n' 'The runner does not expose the required cgroup v2 pids controller.' >&2
  exit 1
fi

if [[ "$operation" == 'setup' ]]; then
  if [[ ! -f "$apparmor_userns_restriction" ]] ||
     [[ "$(sudo cat -- "$apparmor_userns_restriction")" != '1' ]]; then
    printf '%s\n' 'The runner does not expose the expected AppArmor user-namespace policy.' >&2
    exit 1
  fi
  printf '0\n' | sudo tee "$apparmor_userns_restriction" >/dev/null
  sudo mkdir -- "$delegation_root"
  printf '+pids\n' | sudo tee "${cgroup_root}/cgroup.subtree_control" >/dev/null
  sudo mkdir -- "$control_group" "$runs_group"
  printf '+pids\n' | sudo tee "${delegation_root}/cgroup.subtree_control" >/dev/null
  printf '%s\n' "$controller_pid" | sudo tee "${control_group}/cgroup.procs" >/dev/null
  sudo chown -R -- "${current_uid}:${current_gid}" "$runs_group"
  exit 0
fi

printf '1\n' | sudo tee "$apparmor_userns_restriction" >/dev/null
if [[ ! -d "$delegation_root" ]]; then
  exit 0
fi
printf '%s\n' "$$" | sudo tee "${cgroup_root}/cgroup.procs" >/dev/null
printf '%s\n' "$controller_pid" | sudo tee "${cgroup_root}/cgroup.procs" >/dev/null
if [[ -d "$runs_group" ]]; then
  shopt -s nullglob
  for run_group in "${runs_group}"/run-*; do
    case "$run_group" in
      "${runs_group}"/run-[1-9]*-[0-9a-f]*)
        sudo rmdir -- "$run_group"
        ;;
      *)
        printf '%s\n' 'Unexpected cgroup exists inside the CI delegation.' >&2
        exit 1
        ;;
    esac
  done
fi
[[ ! -d "$control_group" ]] || sudo rmdir -- "$control_group"
[[ ! -d "$runs_group" ]] || sudo rmdir -- "$runs_group"
sudo rmdir -- "$delegation_root"
