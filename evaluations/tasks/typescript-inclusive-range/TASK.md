# Include the range endpoint

## Goal

Fix `sumRange` so an ascending range includes both its `start` and `end`
arguments.

## Constraints

Keep the exported signature, iterative implementation, and existing tests.
Make the smallest behaviorally complete source change and add no dependency.

## Completion

The endpoint case in `test/sum-range.test.ts` is satisfied without changing the
test or public API.
