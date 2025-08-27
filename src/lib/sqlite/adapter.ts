import type { ServiceItem, ServicePage, ServiceQuery } from "../types.js";

export interface SqliteAdapter {
  kind: "native" | "wasm";
  init(dbPath: string): Promise<void>;
  ensureSchema(): Promise<void>;
  upsert(items: ServiceItem[]): Promise<{ upserted: number }>;
  delete(ids: string[]): Promise<{ deleted: number }>;
  query(q: ServiceQuery): Promise<ServicePage>;
  close(): Promise<void>;
}
