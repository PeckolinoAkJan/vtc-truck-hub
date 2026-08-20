import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { Readable } from "node:stream";

type D1Result<T = Record<string, unknown>> = {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
};

class NodeD1Statement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new NodeD1Statement(this.database, this.sql, values);
  }

  private statement(): StatementSync {
    return this.database.prepare(this.sql);
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = this.statement().run(...this.values as never[]);
    return {
      results: [],
      success: true,
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
    };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.statement().get(...this.values as never[]) as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return { results: this.statement().all(...this.values as never[]) as T[], success: true, meta: {} };
  }
}

class NodeD1Database {
  readonly database: DatabaseSync;

  constructor(filename: string) {
    mkdirSync(dirname(filename), { recursive: true });
    this.database = new DatabaseSync(filename);
    this.database.exec("PRAGMA journal_mode=WAL");
    this.database.exec("PRAGMA foreign_keys=ON");
    this.database.exec("PRAGMA busy_timeout=5000");
  }

  prepare(sql: string) {
    return new NodeD1Statement(this.database, sql);
  }

  async batch<T = unknown>(statements: NodeD1Statement[]): Promise<D1Result<T>[]> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results: D1Result<T>[] = [];
      for (const statement of statements) results.push(await statement.run<T>());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function safeObjectPath(base: string, key: string) {
  const normalized = key.split("/").filter(Boolean).map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "_")).join(sep);
  const target = resolve(base, normalized);
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw new Error("Ungültiger Objektschlüssel");
  return target;
}

class NodeR2Bucket {
  constructor(private readonly base: string) {
    mkdirSync(base, { recursive: true });
  }

  async put(
    key: string,
    value: ArrayBuffer | ReadableStream | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } },
  ) {
    const filename = safeObjectPath(this.base, key);
    mkdirSync(dirname(filename), { recursive: true });
    const bytes = value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : value instanceof Uint8Array
        ? value
        : typeof value === "string"
          ? new TextEncoder().encode(value)
          : new Uint8Array(await new Response(value).arrayBuffer());
    writeFileSync(filename, bytes);
    writeFileSync(`${filename}.meta.json`, JSON.stringify(options?.httpMetadata ?? {}));
    return { key };
  }

  async get(key: string) {
    const filename = safeObjectPath(this.base, key);
    if (!existsSync(filename)) return null;
    const bytes = readFileSync(filename);
    const metadataFile = `${filename}.meta.json`;
    const httpMetadata = existsSync(metadataFile)
      ? JSON.parse(readFileSync(metadataFile, "utf8")) as { contentType?: string }
      : {};
    return {
      body: Readable.toWeb(Readable.from(bytes)) as ReadableStream,
      etag: createHash("sha256").update(bytes).digest("hex"),
      httpMetadata,
      writeHttpMetadata(headers: Headers) {
        if (httpMetadata.contentType) headers.set("Content-Type", httpMetadata.contentType);
      },
    };
  }
}

const dataDirectory = resolve(process.env.PLESK_DATA_DIR || join(process.cwd(), "data"));

export const env = {
  ...process.env,
  DB: new NodeD1Database(join(dataDirectory, "vtc-truck-hub.sqlite")),
  UPLOADS: new NodeR2Bucket(join(dataDirectory, "uploads")),
};
