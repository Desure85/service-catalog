import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { resolveSqliteDriver } from "./sqlite/driver.js";
import { ServiceItem, ServicePage, ServiceQuery } from "./types.js";

export type EmbeddedStore = "memory" | "file" | "sqlite";
export interface EmbeddedOptions {
  store: EmbeddedStore;
  filePath?: string;   // required if store=file; if absent -> empty catalog but health=false
  prefix?: string;     // optional meta only
  driver?: "auto" | "native" | "wasm"; // for store=sqlite (optional)
}

interface State {
  initialized: boolean;
  items: ServiceItem[];
  filePath?: string;
  lastLoadedMtime?: number;
  lastCheckedAt?: string;
  opts: EmbeddedOptions;
  effectiveStore: "memory" | "file" | "sqlite";
  driverSelected?: "auto" | "native" | "wasm";
  fallback?: boolean;
  driverResolution?: ReturnType<typeof resolveSqliteDriver>;
}

function ensureArray(v?: string | string[]): string[] | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v : [v];
}

export async function initEmbeddedCatalog(opts: EmbeddedOptions) {
  const st: State = {
    initialized: false,
    items: [],
    filePath: opts.filePath,
    lastLoadedMtime: undefined,
    lastCheckedAt: undefined,
    opts,
    effectiveStore: opts.store,
    driverSelected: undefined,
    fallback: false,
  };

  // Resolve store and driver with graceful fallback for sqlite
  if (opts.store === "sqlite") {
    // SQLite not implemented yet. Choose fallback store.
    st.driverSelected = opts.driver ?? "auto";
    st.driverResolution = resolveSqliteDriver(st.driverSelected);
    st.fallback = true;
    // Prefer file if path provided, else memory.
    st.effectiveStore = opts.filePath ? "file" : "memory";
  }

  async function queryServicesDirJsonl(q: ServiceQuery): Promise<ServicePage> {
    const dir = st.filePath!;
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => path.join(dir, f));
    } catch {
      return { items: [], total: 0, page: q.page && q.page > 0 ? q.page : 1, pageSize: q.pageSize ?? 50 };
    }
    const pageSize = q.pageSize ?? 50;
    const page = q.page && q.page > 0 ? q.page : 1;
    const start = (page - 1) * pageSize;
    let total = 0;
    const items: ServiceItem[] = [];
    const collected: ServiceItem[] = [];
    for (const p of files) {
      const rs = fs.createReadStream(p, { encoding: "utf8" });
      const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
      for await (const line of rl as any) {
        const ln = String(line).trim();
        if (!ln) continue;
        let obj: any;
        try { obj = JSON.parse(ln); } catch { continue; }
        const it = obj as ServiceItem;
        if (matches(it, q)) {
          if (q.sort) {
            collected.push(it);
          } else {
            if (total >= start && items.length < pageSize) items.push(it);
          }
          total++;
        }
      }
      rl.close();
    }
    if (q.sort) {
      const [field, dirRaw] = q.sort.split(":");
      const dirMul = (dirRaw || "asc").toLowerCase() === "desc" ? -1 : 1;
      collected.sort((a: any, b: any) => {
        const av = (a as any)[field];
        const bv = (b as any)[field];
        if (av == null && bv == null) return 0;
        if (av == null) return -1 * dirMul;
        if (bv == null) return 1 * dirMul;
        if (field === "updatedAt") {
          const at = Date.parse(String(av));
          const bt = Date.parse(String(bv));
          return (at - bt) * dirMul;
        }
        if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dirMul;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dirMul;
        return String(av).localeCompare(String(bv)) * dirMul;
      });
      const slice = collected.slice(start, start + pageSize);
      return { items: slice, total, page, pageSize };
    }
    return { items, total, page, pageSize };
  }

  function reloadIfNeeded(): void {
    if (st.effectiveStore !== "file") {
      st.initialized = true;
      return;
    }
    const p = st.filePath;
    if (!p) {
      st.initialized = true;
      st.items = [];
      return;
    }
    try {
      if (!fs.existsSync(p)) {
        st.initialized = true;
        st.items = [];
        st.lastLoadedMtime = undefined;
        return;
      }
      const stat = fs.statSync(p);
      const m = stat.mtimeMs;
      if (!st.initialized || st.lastLoadedMtime !== m) {
        const raw = fs.readFileSync(p, "utf8");
        const data = JSON.parse(raw);
        const items: ServiceItem[] = Array.isArray(data) ? data : Array.isArray((data as any)?.items) ? (data as any).items : [];
        st.items = items;
        st.lastLoadedMtime = m;
        st.initialized = true;
      }
    } catch {
      st.initialized = true;
    }
  }

  function matches(it: ServiceItem, q: ServiceQuery): boolean {
    const owners = ensureArray(q.owner);
    const tags = ensureArray(q.tag);
    const search = (q.search || "").toLowerCase().trim();
    const updatedFrom = q.updatedFrom ? Date.parse(q.updatedFrom) : undefined;
    const updatedTo = q.updatedTo ? Date.parse(q.updatedTo) : undefined;

    if (q.component && it.component !== q.component) return false;
    if (q.domain && it.domain !== q.domain) return false;
    if (q.status && it.status !== q.status) return false;

    if (owners && owners.length > 0) {
      const have = new Set(it.owners || []);
      if (!owners.some((o) => have.has(o))) return false;
    }
    if (tags && tags.length > 0) {
      const have = new Set(it.tags || []);
      if (!tags.some((t) => have.has(t))) return false;
    }
    if (updatedFrom != null || updatedTo != null) {
      const t = it.updatedAt ? Date.parse(it.updatedAt) : NaN;
      if (!Number.isFinite(t)) return false;
      if (updatedFrom != null && t < updatedFrom) return false;
      if (updatedTo != null && t > updatedTo) return false;
    }
    if (search) {
      const hay = `${it.id}\n${it.name}\n${it.component}\n${(it.tags || []).join(" ")}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  }

  function applyFilters(items: ServiceItem[], q: ServiceQuery): ServiceItem[] {
    let out = items.filter((it) => matches(it, q));
    if (q.sort) {
      const [field, dirRaw] = q.sort.split(":");
      const dir = (dirRaw || "asc").toLowerCase() === "desc" ? -1 : 1;
      out = out.slice().sort((a: any, b: any) => {
        const av = a[field];
        const bv = b[field];
        if (av == null && bv == null) return 0;
        if (av == null) return -1 * dir;
        if (bv == null) return 1 * dir;
        if (field === "updatedAt") {
          const at = Date.parse(String(av));
          const bt = Date.parse(String(bv));
          return (at - bt) * dir;
        }
        if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    return out;
  }

  function paginate(items: ServiceItem[], page?: number, pageSize?: number): ServicePage {
    const ps = page && page > 0 ? (pageSize ?? 50) : (pageSize ?? 50);
    const pg = page && page > 0 ? page : 1;
    const start = (pg - 1) * (ps as number);
    const chunk = items.slice(start, start + (ps as number));
    return { items: chunk, total: items.length, page: pg, pageSize: ps as number };
  }

  async function queryServices(q: ServiceQuery): Promise<ServicePage> {
    // Stream JSONL when applicable to avoid loading entire dataset
    if (st.effectiveStore === "file" && st.filePath) {
      try {
        const s = fs.statSync(st.filePath);
        if (s.isDirectory()) return await queryServicesDirJsonl(q);
      } catch {}
      if (st.filePath.endsWith(".jsonl")) {
        return await queryServicesJsonl(q);
      }
    }
    reloadIfNeeded();
    const filtered = applyFilters(st.items, q);
    return paginate(filtered, q.page, q.pageSize);
  }

  async function queryServicesJsonl(q: ServiceQuery): Promise<ServicePage> {
    const p = st.filePath!;
    const pageSize = q.pageSize ?? 50;
    const page = q.page && q.page > 0 ? q.page : 1;
    const start = (page - 1) * pageSize;
    let total = 0;
    const items: ServiceItem[] = [];
    const collected: ServiceItem[] = [];
    if (!fs.existsSync(p)) {
      return { items: [], total: 0, page, pageSize };
    }
    const rs = fs.createReadStream(p, { encoding: "utf8" });
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
    let idx = 0;
    for await (const line of rl as any) {
      const ln = line.trim();
      if (ln.length === 0) continue;
      let obj: any;
      try {
        obj = JSON.parse(ln);
      } catch {
        continue;
      }
      const it = obj as ServiceItem;
      if (matches(it, q)) {
        if (q.sort) {
          collected.push(it);
        } else {
          if (total >= start && items.length < pageSize) {
            items.push(it);
          }
        }
        total++;
      }
      idx++;
    }
    rl.close();
    if (q.sort) {
      const [field, dirRaw] = q.sort.split(":");
      const dir = (dirRaw || "asc").toLowerCase() === "desc" ? -1 : 1;
      collected.sort((a: any, b: any) => {
        const av = (a as any)[field];
        const bv = (b as any)[field];
        if (av == null && bv == null) return 0;
        if (av == null) return -1 * dir;
        if (bv == null) return 1 * dir;
        if (field === "updatedAt") {
          const at = Date.parse(String(av));
          const bt = Date.parse(String(bv));
          return (at - bt) * dir;
        }
        if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
      const slice = collected.slice(start, start + pageSize);
      return { items: slice, total, page, pageSize };
    }
    return { items, total, page, pageSize };
  }

  function writeFileAtomicIfNeeded(): void {
    if (st.effectiveStore !== "file") return;
    const p = st.filePath;
    if (!p) return;
    // Directory mode is read-only for now
    try {
      const s = fs.statSync(p);
      if (s.isDirectory()) return; // no-op
    } catch {}
    // JSONL persistence branch
    if (p.endsWith(".jsonl")) {
      // write current st.items as JSONL atomically
      const map = new Map(st.items.map((x) => [x.id, x] as const));
      // Best-effort sync write; errors bubble up to callers where applicable
      const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
      const fd = fs.openSync(tmp, "w");
      try {
        for (const it of map.values()) {
          fs.writeSync(fd, JSON.stringify(it));
          fs.writeSync(fd, "\n");
        }
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, p);
      try {
        const stat = fs.statSync(p);
        st.lastLoadedMtime = stat.mtimeMs;
      } catch {}
      return;
    }
    try {
      const dir = fs.existsSync(p) ? undefined : undefined; // placeholder to avoid extra fs ops
      const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
      const payload = JSON.stringify({ items: st.items }, null, 2);
      fs.writeFileSync(tmp, payload, "utf8");
      fs.renameSync(tmp, p);
      try {
        const stat = fs.statSync(p);
        st.lastLoadedMtime = stat.mtimeMs;
      } catch {}
    } catch {
      // ignore
    }
  }

  async function readAllJsonlToMap(filePath: string): Promise<Map<string, ServiceItem>> {
    const out = new Map<string, ServiceItem>();
    if (!fs.existsSync(filePath)) return out;
    const rs = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
    for await (const line of rl as any) {
      const ln = String(line).trim();
      if (!ln) continue;
      try {
        const obj = JSON.parse(ln) as ServiceItem;
        if (obj && obj.id) out.set(obj.id, obj);
      } catch {
        // skip malformed
      }
    }
    rl.close();
    return out;
  }

  async function writeJsonlAtomic(filePath: string, map: Map<string, ServiceItem>): Promise<void> {
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    const fd = fs.openSync(tmp, "w");
    try {
      for (const it of map.values()) {
        fs.writeSync(fd, JSON.stringify(it));
        fs.writeSync(fd, "\n");
      }
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, filePath);
    try {
      const stat = fs.statSync(filePath);
      st.lastLoadedMtime = stat.mtimeMs;
    } catch {}
  }

  async function upsertServices(items: ServiceItem[]): Promise<{ upserted: number }> {
    const now = new Date().toISOString();
    for (const it of items) {
      if (!it.updatedAt) it.updatedAt = now;
    }
    // JSONL directory mode is read-only
    if (st.effectiveStore === "file" && st.filePath) {
      if (fs.existsSync(st.filePath)) {
        const s = fs.lstatSync(st.filePath);
        if (s.isDirectory()) {
          const err = new Error("JSONL directory mode is read-only for write operations");
          (err as any).code = "ERR_READONLY_DIRECTORY";
          throw err;
        }
      }
    }
    // JSONL single-file mode: merge with on-disk content to avoid truncation
    if (st.effectiveStore === "file" && st.filePath && st.filePath.endsWith(".jsonl")) {
      const p = st.filePath;
      const onDisk = await readAllJsonlToMap(p);
      for (const it of items) onDisk.set(it.id, it);
      await writeJsonlAtomic(p, onDisk);
      st.items = Array.from(onDisk.values());
      return { upserted: items.length };
    }
    // default JSON file mode uses in-memory state
    const byId = new Map(st.items.map((x) => [x.id, x] as const));
    for (const it of items) byId.set(it.id, it);
    st.items = Array.from(byId.values());
    writeFileAtomicIfNeeded();
    return { upserted: items.length };
  }

  async function deleteServices(ids: string[]): Promise<{ deleted: number }> {
    if (!ids || ids.length === 0) return { deleted: 0 };
    const idset = new Set(ids);
    // JSONL directory mode is read-only
    if (st.effectiveStore === "file" && st.filePath) {
      if (fs.existsSync(st.filePath)) {
        const s = fs.lstatSync(st.filePath);
        if (s.isDirectory()) {
          const err = new Error("JSONL directory mode is read-only for write operations");
          (err as any).code = "ERR_READONLY_DIRECTORY";
          throw err;
        }
      }
    }
    // JSONL mode: operate on-disk and rewrite atomically
    if (st.effectiveStore === "file" && st.filePath && st.filePath.endsWith(".jsonl")) {
      const p = st.filePath;
      const onDisk = await readAllJsonlToMap(p);
      let delCount = 0;
      for (const id of ids) {
        if (onDisk.delete(id)) delCount++;
      }
      await writeJsonlAtomic(p, onDisk);
      st.items = Array.from(onDisk.values());
      return { deleted: delCount };
    }
    const before = st.items.length;
    st.items = st.items.filter((it) => !idset.has(it.id));
    const deleted = before - st.items.length;
    writeFileAtomicIfNeeded();
    return { deleted };
  }

  async function health(): Promise<{ ok: boolean; source: "embedded"; detail?: any }> {
    reloadIfNeeded();
    st.lastCheckedAt = new Date().toISOString();
    if (st.effectiveStore === "file") {
      const p = st.filePath;
      const ok = !!(p && fs.existsSync(p));
      let jsonlDir = false;
      if (p) {
        try { const s = fs.statSync(p); jsonlDir = s.isDirectory(); } catch {}
      }
      return {
        ok,
        source: "embedded",
        detail: {
          store: "file",
          requestedStore: st.opts.store,
          filePath: p,
          driver: st.driverSelected,
          driverResolution: st.driverResolution,
          jsonl: !!(p && p.endsWith(".jsonl")),
          jsonlDir,
          fallback: st.fallback === true,
        },
      };
    }
    return {
      ok: true,
      source: "embedded",
      detail: {
        store: "memory",
        requestedStore: st.opts.store,
        driver: st.driverSelected,
        driverResolution: st.driverResolution,
        fallback: st.fallback === true,
      },
    };
  }

  return { queryServices, health, upsertServices, deleteServices };
}
