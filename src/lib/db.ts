// The subset of the D1 API the business logic needs. Declared structurally so that
// src/lib type-checks without the Cloudflare global types (the web app only has DOM types).

export interface RunResult {
  meta?: { changes?: number };
  changes?: number;
}

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<RunResult>;
}

/** One answer per statement of a batch, which D1 runs as a single transaction. */
export interface BatchResult {
  results: unknown[];
  meta?: { changes?: number };
}

export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<BatchResult[]>;
}
