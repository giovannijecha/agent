# Extract the page stylesheet

## Goal

Create the missing `assets` directory, extract the inline styles from
`index.html` into `assets/theme.css`, and load that stylesheet from the page.

## Constraints

Create the directory before writing the nested file. Preserve the document
language, title, markup, visible content, declarations, and declaration order.
Change only `index.html` and the new stylesheet. Add no dependency, script,
framework, or unrelated formatting change.

## Completion

`index.html` contains no inline style block, loads `assets/theme.css`, and the
new stylesheet owns the existing page declarations without any other change.
