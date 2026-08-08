declare module "node:test" {
  export interface TestContext {
    readonly name: string;
  }

  export type TestBody = (context: TestContext) => void | Promise<void>;

  export default function test(name: string, body: TestBody): void;
}

declare module "node:assert/strict" {
  export interface AssertStrict {
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    throws(block: () => unknown, error?: new (...arguments_: never[]) => Error): void;
  }

  const assert: AssertStrict;
  export default assert;
}
