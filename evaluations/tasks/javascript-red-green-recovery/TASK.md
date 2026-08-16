# Recover from a failing boundary test

## Goal

Before changing any file, run `node --test` and observe the existing failure.
Then fix `capAt` so a value above the maximum returns that inclusive maximum.

## Constraints

Preserve the export name, parameters, conditional implementation, package
manifest, and existing tests. Make the smallest behaviorally complete source
change and add no dependency or unrelated formatting change.

## Completion

Run the exact same `node --test` command after the edit. It passes, the test and
public API remain unchanged, and no other file is added or modified.
