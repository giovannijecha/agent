# Keep positive-count reads in bounds

## Goal

Fix the off-by-one read in `main.c` so `count_positive` examines exactly the
declared array elements.

## Constraints

Keep the public function signature and return type unchanged. Do not add a
dependency, a second function, or an unrelated formatting change.

## Completion

The loop never reads at index `length`, and every existing in-range element is
still counted once.
