# Extract the inline browser script

## Goal

Move the inline counter behavior from `index.html` into a separate `app.js`
module while preserving the visible behavior.

## Constraints

Keep the existing markup, identifiers, button label, and increment behavior.
Add no dependency, build step, framework, or unrelated styling.

## Completion

`index.html` contains no inline JavaScript, loads `app.js` as a module, and the
new module owns the existing click handler.
