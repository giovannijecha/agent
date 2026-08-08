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
  export const execPath: string;
  export function cwd(): string;
  export function exit(code?: number): never;
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
  export function tmpdir(): string;
}
