#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd -- "$project_root"

node tools/verify.mjs
npm ci --offline --ignore-scripts --no-audit --no-fund
node tools/clean.mjs
tsc --build tsconfig.json --pretty false
tsc --build tsconfig.tests.json --pretty false
node tools/build-native.mjs
node tools/verify.mjs --require-generated
node tools/run-tests.mjs
node tools/smoke-cli.mjs

printf '%s\n' 'Verification passed: ownership, build, tests, and CLI smoke test.'
