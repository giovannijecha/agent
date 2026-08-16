# Extract the page stylesheet

## Goal

Create the missing `assets` directory, extract the inline styles from
`index.html` into `assets/theme.css`, and load that stylesheet from the page.

## Constraints

Use `manage_path` with `create_directory` to create `assets` before writing the
nested file. Do not use `run_process` or any other mechanism to create that
directory. After it exists, use `apply_patch` to create `assets/theme.css` and
update `index.html`. Preserve the document language, title, markup, visible
content, declarations, and declaration order. Change only `index.html` and the
new stylesheet. Add no dependency, script, framework, or unrelated formatting
change.

## Completion

`index.html` contains no inline style block, loads `assets/theme.css`, and the
new stylesheet owns the existing page declarations without any other change.
Accept the run only if the approved namespace request is exactly
`manage_path(create_directory)` for `assets`. Deny `run_process` or any other
alternate directory-creation mechanism. The subsequent `apply_patch` request
may create `assets/theme.css` and update `index.html`.
