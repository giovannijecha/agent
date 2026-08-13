interface ImportMeta {
  readonly url: string;
}

declare module "node:process" {
  export interface ReadableStream {
    readonly isTTY: boolean | undefined;
    on(event: "data", listener: (text: string) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (cause: unknown) => void): this;
    off(event: "data", listener: (text: string) => void): this;
    off(event: "end", listener: () => void): this;
    off(event: "error", listener: (cause: unknown) => void): this;
    pause(): this;
    resume(): this;
    setEncoding(encoding: "utf8"): this;
    setRawMode(enabled: boolean): this;
  }

  export interface WritableStream {
    readonly columns: number | undefined;
    readonly isTTY: boolean | undefined;
    readonly rows: number | undefined;
    on(event: "error", listener: (cause: unknown) => void): this;
    on(event: "resize", listener: () => void): this;
    off(event: "error", listener: (cause: unknown) => void): this;
    off(event: "resize", listener: () => void): this;
    write(text: string): boolean;
    write(text: string, callback: (cause?: unknown) => void): boolean;
  }

  export const stdin: ReadableStream;
  export const stdout: WritableStream;
  export const stderr: WritableStream;
  export const argv: readonly string[];
  export const arch: string;
  export const execPath: string;
  export const env: Readonly<{
    AGENT_OPENCODE_GO_API_KEY?: string;
  }>;
  export function cwd(): string;
  export function exit(code?: number): never;
  export const platform: string;
}

declare module "node:child_process" {
  export interface ChildReadableStream {
    on(event: "data", listener: (chunk: Uint8Array) => void): this;
  }

  export interface ChildWritableStream {
    readonly destroyed: boolean;
    destroy(): void;
    end(): void;
    write(chunk: Uint8Array): boolean;
  }

  export interface ChildProcess {
    readonly stderr: ChildReadableStream;
    readonly stdin: ChildWritableStream;
    readonly stdout: ChildReadableStream;
    readonly stdio: readonly [
      ChildWritableStream,
      ChildReadableStream,
      ChildReadableStream,
      ChildReadableStream,
      ChildReadableStream,
    ];
    kill(): boolean;
    once(event: "close", listener: (code: number | null, signal: string | null) => void): this;
    once(event: "error", listener: (cause: unknown) => void): this;
  }

  export type SpawnOptions = Readonly<{
    cwd: string;
    env: Readonly<Record<string, string>>;
    shell: false;
    stdio: readonly ["pipe", "pipe", "pipe", "pipe", "pipe"];
    windowsHide: true;
  }>;

  export function spawn(
    executable: string,
    arguments_: readonly string[],
    options: SpawnOptions,
  ): ChildProcess;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:timers" {
  export type Timeout = Readonly<{ readonly __timeout: unique symbol }>;
  export function clearTimeout(timeout: Timeout): void;
  export function setTimeout(listener: () => void, milliseconds: number): Timeout;
}

declare module "node:https" {
  export interface IncomingHeaders {
    readonly "content-type"?: string | readonly string[];
  }

  export interface IncomingMessage {
    readonly headers: IncomingHeaders;
    readonly statusCode: number | undefined;
    destroy(): void;
    on(event: "aborted", listener: () => void): this;
    on(event: "data", listener: (chunk: Uint8Array) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (cause: unknown) => void): this;
    off(event: "aborted", listener: () => void): this;
    off(event: "data", listener: (chunk: Uint8Array) => void): this;
    off(event: "end", listener: () => void): this;
    off(event: "error", listener: (cause: unknown) => void): this;
    pause(): this;
    resume(): this;
  }

  export interface ClientRequest {
    destroy(): void;
    end(): void;
    on(event: "error", listener: (cause: unknown) => void): this;
    off(event: "error", listener: (cause: unknown) => void): this;
    setTimeout(milliseconds: number, listener: () => void): this;
    write(body: string): boolean;
  }

  export type RequestOptions = Readonly<{
    agent: false;
    headers: Readonly<{
      accept: string;
      authorization: string;
      "content-type": string;
      "user-agent": string;
    }>;
    hostname: string;
    maxHeaderSize: number;
    method: "POST";
    path: string;
    port: 443;
    protocol: "https:";
  }>;

  export function request(
    options: RequestOptions,
    onResponse: (response: IncomingMessage) => void,
  ): ClientRequest;
}

declare module "node:path" {
  interface PathApi {
    basename(path: string): string;
    dirname(path: string): string;
    isAbsolute(path: string): boolean;
    join(...paths: string[]): string;
    relative(from: string, to: string): string;
    resolve(...paths: string[]): string;
    readonly sep: string;
  }
  const path: PathApi;
  export default path;
}

declare module "node:fs/promises" {
  export interface Dirent {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }

  export interface Dir {
    close(): Promise<void>;
    read(): Promise<Dirent | null>;
  }

  export interface Stats {
    readonly size: number;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }

  export interface FileHandle {
    close(): Promise<void>;
    readFile(options: { encoding: "utf8" }): Promise<string>;
    stat(): Promise<Stats>;
    truncate(length?: number): Promise<void>;
    write(
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number,
    ): Promise<{ bytesWritten: number }>;
  }

  export function lstat(path: string): Promise<Stats>;
  export function mkdir(path: string): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function open(path: string, flags: "r+"): Promise<FileHandle>;
  export function opendir(path: string): Promise<Dir>;
  export function readFile(path: string, options: { encoding: "utf8" }): Promise<string>;
  export function readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<Dirent[]>;
  export function realpath(path: string): Promise<string>;
  export function rm(
    path: string,
    options: { force: true; recursive: true },
  ): Promise<void>;
  export function symlink(
    target: string,
    path: string,
    type: "junction",
  ): Promise<void>;
  export function writeFile(
    path: string,
    data: string,
    options: { encoding: "utf8"; flag: "wx" },
  ): Promise<void>;
}

declare module "node:os" {
  export function homedir(): string;
  export function tmpdir(): string;
}
