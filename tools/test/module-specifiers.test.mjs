import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeModule,
  collectRuntimeExportBindings,
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

test("collects runtime export bindings and ignores non-runtime forms", () => {
  const result = collectRuntimeExportBindings(
    "// export { hidden };\n" +
      'const text = "export { concealed };";\n' +
      "export type { Dirent };\n" +
      'export { type Metadata, readFile, open as localOpen, rename as "local-rename" };\n' +
      "const firstRead = readFile;\n" +
      "const secondRead = firstRead;\n" +
      "export { secondRead as chainedRead };\n" +
      "export const localRead = ((readFile));\n" +
      "export let localOpenDeclaration: typeof open = open;\n" +
      "export var readResult = readFile(path);\n" +
      "export default ((rename));\n",
  );

  assert.deepEqual(result, [
    { exported: "readFile", line: 4, local: "readFile" },
    { exported: "localOpen", line: 4, local: "open" },
    { exported: "local-rename", line: 4, local: "rename" },
    { exported: "chainedRead", line: 7, local: "readFile" },
    { exported: "localRead", line: 8, local: "readFile" },
    { exported: "localOpenDeclaration", line: 9, local: "open" },
    { exported: "readResult", line: 10, local: "readResult" },
    { exported: "default", line: 11, local: "rename" },
  ]);
});

test("requires the complete default expression to be a direct alias", () => {
  const result = collectRuntimeExportBindings(
    "export default readFile;\n" +
      "export default ((open));\n" +
      "export default readFile(path);\n" +
      "export default readFile.bind(owner);\n" +
      "export default readFile[name];\n" +
      "export default readFile`path`;\n" +
      "export default readFile + marker;\n",
  );

  assert.deepEqual(result, [
    { exported: "default", line: 1, local: "readFile" },
    { exported: "default", line: 2, local: "open" },
  ]);
});

test("follows bounded assertions inside parenthesized aliases", () => {
  assert.deepEqual(
    collectRuntimeExportBindings(
      "const assertedRead = ((readFile) as typeof readFile);\n" +
        "const satisfiedRead = (assertedRead! satisfies typeof readFile);\n" +
        "const chainedRead = ((satisfiedRead as unknown as typeof readFile))!;\n" +
        "export { assertedRead, satisfiedRead, chainedRead };\n",
    ),
    [
      { exported: "assertedRead", line: 4, local: "readFile" },
      { exported: "satisfiedRead", line: 4, local: "readFile" },
      { exported: "chainedRead", line: 4, local: "readFile" },
    ],
  );
});

test("rejects assertion types outside the bounded alias grammar", () => {
  assert.throws(
    () =>
      collectRuntimeExportBindings(
        "const localRead = (readFile as Readonly<{ value: string }>);\n" +
          "export { localRead };\n",
      ),
    (error) =>
      error instanceof ModuleScanError &&
      error.message.endsWith("runtime alias assertion is outside owned bounds"),
  );
});

test("bounds direct alias expression nesting", () => {
  const source =
    "const localRead = " +
    "(".repeat(33) +
    "readFile" +
    ")".repeat(33) +
    ";\nexport { localRead };\n";
  assert.throws(
    () => collectRuntimeExportBindings(source),
    (error) =>
      error instanceof ModuleScanError &&
      error.message.endsWith("runtime alias expression exceeds owned bounds"),
  );
});

test("distinguishes runtime bindings named type from type-only exports", () => {
  assert.deepEqual(
    collectRuntimeExportBindings(
      "const type = readFile;\n" +
        "export { type as localRead };\n" +
        "export { type };\n" +
        "export { type Metadata };\n",
    ),
    [
      { exported: "localRead", line: 2, local: "readFile" },
      { exported: "type", line: 3, local: "readFile" },
    ],
  );
});

test("collects Unicode runtime binding aliases by code point", () => {
  assert.deepEqual(
    collectRuntimeExportBindings(
      "const 讀取 = readFile;\n" +
        "const 𐐀 = open;\n" +
        "export { 讀取, 𐐀 as astralOpen };\n",
    ),
    [
      { exported: "讀取", line: 3, local: "readFile" },
      { exported: "astralOpen", line: 3, local: "open" },
    ],
  );
});

test("rejects module-scope runtime binding patterns", () => {
  for (const source of [
    "export const { localRead } = { localRead: readFile };\n",
    "export const [localRead] = [readFile];\n",
    "const { localRead } = source;\nexport { localRead };\n",
    "const [localRead] = source;\nexport { localRead };\n",
  ]) {
    assert.throws(
      () => collectRuntimeExportBindings(source),
      (error) =>
        error instanceof ModuleScanError &&
        error.message.endsWith(
          "module-scope runtime binding patterns are outside owned bounds",
        ),
    );
  }

  assert.doesNotThrow(() =>
    collectRuntimeExportBindings(
      "function scoped() { const { localRead } = source; }\n" +
        "export { ordinary };\n",
    ),
  );
});

test("rejects delimiter-nested var declarations outside the owned grammar", () => {
  for (const source of [
    "if (true) { var localRead = readFile; }\nexport { localRead };\n",
    "for (var localRead = readFile; false;) {}\nexport { localRead };\n",
    "function scoped() { var localRead = readFile; }\nexport { ordinary };\n",
  ]) {
    assert.throws(
      () => collectRuntimeExportBindings(source),
      (error) =>
        error instanceof ModuleScanError &&
        error.message.endsWith(
          "delimiter-nested var declarations are outside owned bounds",
        ),
    );
  }
});

test("stops runtime alias declarators at automatic semicolon boundaries", () => {
  const result = collectRuntimeExportBindings(
    "export const localRead = readFile\n" +
      "export const marker = 1;\n" +
      "const chainedRead = localRead\n" +
      "consume(chainedRead);\n" +
      "export { chainedRead };\n" +
      "export const assertedRead = readFile\n" +
      "  satisfies typeof readFile;\n" +
      "export const callResult = readFile\n" +
      "  (path);\n" +
      "export const memberResult = readFile\n" +
      "  [name];\n" +
      "export const dottedResult = readFile\n" +
      "  .bind(owner);\n" +
      "export const taggedResult = readFile\n" +
      "  `path`;\n",
  );

  assert.deepEqual(result, [
    { exported: "localRead", line: 1, local: "readFile" },
    { exported: "marker", line: 2, local: "marker" },
    { exported: "chainedRead", line: 5, local: "readFile" },
    { exported: "assertedRead", line: 6, local: "readFile" },
    { exported: "callResult", line: 8, local: "callResult" },
    { exported: "memberResult", line: 10, local: "memberResult" },
    { exported: "dottedResult", line: 12, local: "dottedResult" },
    { exported: "taggedResult", line: 14, local: "taggedResult" },
  ]);
});

test("recognizes unambiguous automatic semicolon statement starters", () => {
  const result = collectRuntimeExportBindings(
    "const stringRead = readFile\n" +
      '"next";\n' +
      "export { stringRead };\n" +
      "const numberRead = readFile\n" +
      "1;\n" +
      "export { numberRead };\n" +
      "const fractionalRead = readFile\n" +
      ".5;\n" +
      "export { fractionalRead };\n" +
      "const blockRead = readFile\n" +
      "{}\n" +
      "export { blockRead };\n" +
      "let incrementRead = readFile\n" +
      "++count;\n" +
      "export { incrementRead };\n" +
      "let decrementRead = readFile\n" +
      "--count;\n" +
      "export { decrementRead };\n",
  );

  assert.deepEqual(result, [
    { exported: "stringRead", line: 3, local: "readFile" },
    { exported: "numberRead", line: 6, local: "readFile" },
    { exported: "fractionalRead", line: 9, local: "readFile" },
    { exported: "blockRead", line: 12, local: "readFile" },
    { exported: "incrementRead", line: 15, local: "readFile" },
    { exported: "decrementRead", line: 18, local: "readFile" },
  ]);
});

test("bounds direct runtime binding aliases", () => {
  const source = Array.from(
    { length: 257 },
    (_, index) => "const alias" + String(index) + " = source" + String(index) + ";",
  ).join("\n");
  assert.throws(
    () => collectRuntimeExportBindings(source),
    (error) =>
      error instanceof ModuleScanError &&
      error.message.endsWith("runtime binding alias count exceeds owned bounds"),
  );
});

test("scopes direct runtime aliases to module bindings", () => {
  assert.deepEqual(
    collectRuntimeExportBindings(
      "const localRead = ordinary;\n" +
        "function scoped() { const localRead = readFile; }\n" +
        "export { localRead };\n",
    ),
    [{ exported: "localRead", line: 3, local: "ordinary" }],
  );
});

test("rejects direct runtime binding alias cycles", () => {
  assert.throws(
    () =>
      collectRuntimeExportBindings(
        "let firstRead = secondRead;\n" +
          "let secondRead = firstRead;\n" +
          "export { firstRead };\n",
      ),
    (error) =>
      error instanceof ModuleScanError &&
      error.message.endsWith("runtime binding alias cycle"),
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
