import type { SqliteAdapter } from "./adapter.js";
import type { ServiceItem, ServicePage, ServiceQuery } from "../types.js";

export const WasmSqliteAdapter: SqliteAdapter = {
  kind: "wasm",
  async init(_dbPath: string): Promise<void> {
    // Skeleton: no-op
  },
  async ensureSchema(): Promise<void> {
    // Skeleton: no-op
  },
  async upsert(_items: ServiceItem[]): Promise<{ upserted: number }> {
    // Skeleton: not implemented
    return { upserted: 0 };
  },
  async delete(_ids: string[]): Promise<{ deleted: number }> {
    // Skeleton: not implemented
    return { deleted: 0 };
  },
  async query(_q: ServiceQuery): Promise<ServicePage> {
    // Skeleton: not implemented
    return { items: [], total: 0, page: 1, pageSize: 50 };
  },
  async close(): Promise<void> {
    // Skeleton: no-op
  },
};
