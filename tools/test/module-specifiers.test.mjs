import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeModule,
  collectStaticStringValues,
  ModuleScanError,
} from "../lib/module-specifiers.mjs";

const reflectiveName = ["con", "structor"].join("");

test("collects only bounded static string compositions", () => {
  const result = collectStaticStringValues(
    'const command = (["a", "u" + "th",].join(""));\n' +
      'const namespace = "cre" + ("dential" + "s");\n' +
      "const dynamic = [prefix, 'suffix'].join('');\n",
  );

  assert.deepEqual(
    result.map((entry) => entry.value),
    ["auth", "credentials"],
  );
});

test("rejects static string compositions beyond the owned fragment bound", () => {
  const fragments = Array.from({ length: 33 }, () => '"a"').join(", ");
  assert.throws(
    () => collectStaticStringValues("const value = [" + fragments + '].join("");\n'),
    ModuleScanError,
  );
});

test("does not apply composition bounds to ordinary static arrays", () => {
  const fragments = Array.from({ length: 33 }, () => '"a"').join(", ");
  assert.deepEqual(
    collectStaticStringValues("const value = [" + fragments + "];\n"),
    [],
  );
});

test("extracts static imports and re-exports", () => {
  const result = analyzeModule(
    "import type { A } from './a.js';\n" +
      "import 'node:process';\n" +
      "export { B } from \"@agent/core\";\n",
  );

  assert.deepEqual(
    result.imports.map((entry) => entry.specifier),
    ["./a.js", "node:process", "@agent/core"],
  );
});

test("ignores import words inside comments and strings", () => {
  const result = analyzeModule(
    "// import 'foreign'\n" +
      "const text = \"import 'also-foreign'\";\n" +
      "/* export { value } from 'hidden' */\n",
  );

  assert.deepEqual(result.imports, []);
});

test("rejects dynamic imports", () => {
  let error;
  try {
    analyzeModule("import('./dynamic.js');\n");
  } catch (caught) {
    error = caught;
  }

  assert.ok(error instanceof ModuleScanError);
});

test("reports dangerous runtime loaders", () => {
  const result = analyzeModule(
    "const execute = eval; require?.('./x.js'); Function.call(null, 'x');\n",
  );

  assert.deepEqual(
    result.forbidden.map((entry) => entry.name),
    ["eval", "require", "Function"],
  );
});

test("rejects aliased loader imports", () => {
  const result = analyzeModule(
    "import { createRequire as load } from 'node:module';\n" +
      "load(import.meta.url);\n",
  );

  assert.deepEqual(
    result.forbidden.map((entry) => entry.name),
    ["createRequire"],
  );
});

test("rejects computed access to dangerous globals", () => {
  const result = analyzeModule("globalThis['eval']('source');\n");

  assert.deepEqual(
    result.forbidden.map((entry) => entry.name),
    ["globalThis", "eval"],
  );
});

test("rejects concatenated and escaped dangerous property names", () => {
  const result = analyzeModule(
    "process['get' + 'BuiltinModule']('node:fs');\n" +
      "const key = 'get\\u0042uiltinModule';\n",
  );

  assert.deepEqual(
    result.forbidden.map((entry) => entry.name),
    ["getBuiltinModule", "getBuiltinModule"],
  );
});

test("rejects the built-in module escape hatch", () => {
  const result = analyzeModule("process.getBuiltinModule('node:fs');\n");

  assert.deepEqual(
    result.forbidden.map((entry) => entry.name),
    ["getBuiltinModule"],
  );
});

test("rejects reflective access to function constructors", () => {
  const result = analyzeModule(
    "exit.constructor('return process')();\n" +
      "exit['con' + 'structor']('return process')();\n",
  );

  assert.deepEqual(
    result.forbidden.map((entry) => entry.name),
    [reflectiveName, reflectiveName],
  );
});

test("rejects constructor extraction and reflection helpers", () => {
  const result = analyzeModule(
    "const { constructor: build } = (() => {});\n" +
      "const { constructor } = (() => {});\n" +
      "const { 'constructor': other } = (() => {});\n" +
      "const reflected = Reflect.get(() => undefined, 'constructor');\n" +
      "Object.getPrototypeOf(() => undefined);\n" +
      "Object.getOwnPropertyNames(value);\n" +
      "value.__proto__;\n",
  );

  assert.deepEqual(
    result.forbidden.map((entry) => entry.name),
    [
      reflectiveName,
      reflectiveName,
      reflectiveName,
      "Reflect",
      reflectiveName,
      "getPrototypeOf",
      "getOwnPropertyNames",
      "__proto__",
    ],
  );
});

test("rejects computed constructor extraction and dynamic binding keys", () => {
  const result = analyzeModule(
    "const { ['constructor']: first } = (() => {});\n" +
      "const { ['con' + 'structor']: second } = (() => {});\n" +
      "const key = 'constructor';\n" +
      "const { [key]: third } = (() => {});\n",
  );

  assert.deepEqual(
    result.forbidden.map((entry) => entry.name),
    [
      "computedBinding",
      reflectiveName,
      "computedBinding",
      reflectiveName,
      reflectiveName,
      "computedBinding",
    ],
  );
});

test("fails closed on non-static computed members in production", () => {
  const result = analyzeModule(
    "const fromTemplate = (() => {})[`constructor`];\n" +
      "const parenthesized = 'con' + ('structor');\n" +
      "const first = (() => {})[parenthesized];\n" +
      "const joined = ['con', 'structor'].join('');\n" +
      "const second = (() => {})[joined];\n" +
      "const dynamic = String.fromCodePoint(99, 111, 110);\n" +
      "const callable = (() => {}) as unknown;\n" +
      "const third = callable?.[dynamic];\n" +
      "const fourth = function () {}[dynamic];\n" +
      "const fifth = class {}[dynamic];\n" +
      "const sixth = callable![dynamic];\n" +
      "const generic = <T>() => undefined;\n" +
      "const seventh = generic<unknown>[dynamic];\n",
    { failClosedComputedMembers: true },
  );

  assert.deepEqual(
    result.forbidden.map((entry) => entry.name),
    [
      reflectiveName,
      "computedMember",
      "computedMember",
      "computedMember",
      "computedMember",
      "computedMember",
      "computedMember",
      "computedMember",
    ],
  );
});

test("allows a statically safe computed member in production", () => {
  const result = analyzeModule("const size = values['length'];\n", {
    failClosedComputedMembers: true,
  });

  assert.deepEqual(result.forbidden, []);
});

test("fails closed on incomplete literal escape decoding", () => {
  const source =
    "const first = callable['con\\structor'];\n" +
    "const second = callable['con" + "\\" + "\n" + "structor'];\n" +
    "const third = callable[`con" + "\\" + "\n" + "structor`];\n";
  const result = analyzeModule(source, { failClosedComputedMembers: true });

  assert.deepEqual(
    result.forbidden.map((entry) => entry.name),
    [
      "computedMember",
      "literalEscape",
      "computedMember",
      "literalEscape",
      "computedMember",
      "literalEscape",
    ],
  );
});

test("covers every accepted and rejected literal escape category", () => {
  const accepted = [
    String.raw`const value = item['\b\f\n\r\t\v\0\'\"\`\\'];`,
    String.raw`const value = item['\x6cength'];`,
    String.raw`const value = item['\u{6c}ength'];`,
    String.raw`const value = item['\u006cength'];`,
  ];
  for (const source of accepted) {
    const result = analyzeModule(source, { failClosedComputedMembers: true });
    assert.deepEqual(result.forbidden, []);
  }

  const rejected = [
    String.raw`const value = item['\x6'];`,
    String.raw`const value = item['\u{6c'];`,
    String.raw`const value = item['\u{}'];`,
    String.raw`const value = item['\u{110000}'];`,
    String.raw`const value = item['\u006'];`,
    String.raw`const value = item['\1'];`,
    String.raw`const value = item['\01'];`,
  ];
  for (const source of rejected) {
    const result = analyzeModule(source, { failClosedComputedMembers: true });
    assert.deepEqual(
      result.forbidden.map((entry) => entry.name),
      ["computedMember", "literalEscape"],
    );
  }
});

test("rejects an escaped eval identifier", () => {
  let error;
  try {
    analyzeModule("\\u0065val(source);\n");
  } catch (caught) {
    error = caught;
  }

  assert.ok(error instanceof ModuleScanError);
});

test("rejects an escaped createRequire import", () => {
  let error;
  try {
    analyzeModule(
      "import { create\\u0052equire as load } from 'node:module';\n",
    );
  } catch (caught) {
    error = caught;
  }

  assert.ok(error instanceof ModuleScanError);
});

test("rejects interpolated templates to fail closed", () => {
  let error;
  try {
    analyzeModule("const value = `prefix ${name}`;\n");
  } catch (caught) {
    error = caught;
  }

  assert.ok(error instanceof ModuleScanError);
});
