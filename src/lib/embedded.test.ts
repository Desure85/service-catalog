import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initEmbeddedCatalog } from "./embedded.js";

describe("embedded catalog", () => {
  it("works in memory", async () => {
    const cat = await initEmbeddedCatalog({ store: "memory" });
    const h = await cat.health();
    expect(h.ok).toBe(true);
    const page = await cat.queryServices({ page: 1, pageSize: 10 });
    expect(page.items).toEqual([]);
  });

  it("queries across JSONL shards in directory with pagination and sort, and rejects writes", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `svc-cat-shards-${process.pid}-`));
    const f1 = path.join(dir, "part1.jsonl");
    const f2 = path.join(dir, "part2.jsonl");
    const make = (start: number, count: number) => {
      const lines: string[] = [];
      for (let i = 0; i < count; i++) {
        const n = start + i;
        lines.push(JSON.stringify({ id: `s${n}`, name: `S${n}`, component: n % 2 ? "odd" : "even", updatedAt: new Date(1700000000000 + n * 1000).toISOString() }));
      }
      return lines.join("\n");
    };
    fs.writeFileSync(f1, make(1, 15), "utf8");
    fs.writeFileSync(f2, make(16, 15), "utf8");

    const cat = await initEmbeddedCatalog({ store: "file", filePath: dir });
    const h = await cat.health();
    expect(h.detail.jsonlDir).toBe(true);

    // Query only even components, total should be 15 (from 30)
    const pg1 = await cat.queryServices({ component: "even", page: 1, pageSize: 7, sort: "id:asc" });
    expect(pg1.total).toBe(15);
    expect(pg1.items.length).toBe(7);
    // Next page
    const pg2 = await cat.queryServices({ component: "even", page: 2, pageSize: 7, sort: "id:asc" });
    expect(pg2.items.length).toBe(7);
    const pg3 = await cat.queryServices({ component: "even", page: 3, pageSize: 7, sort: "id:asc" });
    expect(pg3.items.length).toBe(1);

    // Writes should be rejected in directory mode
    await expect(cat.upsertServices([{ id: "x", name: "X", component: "even" }])).rejects.toThrow();
    await expect(cat.deleteServices(["s1"])) .rejects.toThrow();
  });

  it("persists upsert/delete to JSONL atomically", async () => {
    const tmp = path.join(os.tmpdir(), `svc-cat-jsonl-upd-${process.pid}-${Date.now()}.jsonl`);
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    const cat = await initEmbeddedCatalog({ store: "file", filePath: tmp });
    // upsert 3 items
    await cat.upsertServices([
      { id: "a", name: "A", component: "c1" },
      { id: "b", name: "B", component: "c1" },
      { id: "c", name: "C", component: "c2" },
    ]);
    // file should exist and contain 3 lines
    const content1 = fs.readFileSync(tmp, "utf8");
    const lines1 = content1.trim().split(/\n/);
    expect(lines1.length).toBe(3);

    // delete one
    const del = await cat.deleteServices(["b"]);
    expect(del.deleted).toBe(1);
    const content2 = fs.readFileSync(tmp, "utf8");
    const lines2 = content2.trim().split(/\n/);
    expect(lines2.length).toBe(2);

    // query should reflect 2 items
    const page = await cat.queryServices({ page: 1, pageSize: 10 });
    expect(page.total).toBe(2);
    const ids = page.items.map(x => x.id).sort();
    expect(ids).toEqual(["a", "c"]);
  });

  it("reports sqlite driver resolution and fallback details", async () => {
    const cat = await initEmbeddedCatalog({ store: "sqlite", driver: "auto" });
    const h = await cat.health();
    expect(h.detail.requestedStore).toBe("sqlite");
    expect(h.detail.store).toBe("memory");
    expect(h.detail.fallback).toBe(true);
    expect(h.detail.driver).toBe("auto");
    expect(h.detail.driverResolution).toBeDefined();
    expect(h.detail.driverResolution.available).toBe(false);
    expect(Array.isArray(h.detail.driverResolution.tried)).toBe(true);
  });

  it("streams JSONL for file store and paginates", async () => {
    const tmp = path.join(os.tmpdir(), `svc-cat-jsonl-${process.pid}-${Date.now()}.jsonl`);
    // prepare JSONL with 30 records
    const lines: string[] = [];
    for (let i = 1; i <= 30; i++) {
      const rec = {
        id: `j${i}`,
        name: `Json ${i}`,
        component: i % 2 === 0 ? "comp-even" : "comp-odd",
        tags: i % 3 === 0 ? ["t3"] : ["t1"],
      };
      lines.push(JSON.stringify(rec));
    }
    fs.writeFileSync(tmp, lines.join("\n"), "utf8");

    const cat = await initEmbeddedCatalog({ store: "file", filePath: tmp });
    // filter comp-even (should be 15 out of 30), page 2, size 5 => items 5, total 15
    const page = await cat.queryServices({ component: "comp-even", page: 2, pageSize: 5 });
    expect(page.total).toBe(15);
    expect(page.items.length).toBe(5);
  });

  it("falls back from sqlite to file when filePath provided", async () => {
    const tmp = path.join(os.tmpdir(), `svc-cat-sqlite-file-${process.pid}-${Date.now()}.json`);
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    const cat = await initEmbeddedCatalog({ store: "sqlite", filePath: tmp, driver: "auto" });
    const h = await cat.health();
    expect(h.ok).toBe(false);
    expect(h.detail.store).toBe("file");
    expect(h.detail.requestedStore).toBe("sqlite");
    expect(h.detail.fallback).toBe(true);
    const up = await cat.upsertServices([{ id: "s1", name: "S1", component: "c" }]);
    expect(up.upserted).toBe(1);
    const h2 = await cat.health();
    expect(h2.ok).toBe(true);
  });

  it("falls back from sqlite to memory when no filePath", async () => {
    const cat = await initEmbeddedCatalog({ store: "sqlite", driver: "auto" });
    const h = await cat.health();
    expect(h.ok).toBe(true);
    expect(h.detail.store).toBe("memory");
    expect(h.detail.requestedStore).toBe("sqlite");
    expect(h.detail.fallback).toBe(true);
    const up = await cat.upsertServices([{ id: "m1", name: "M1", component: "c" }]);
    expect(up.upserted).toBe(1);
    const q = await cat.queryServices({ page: 1, pageSize: 10 });
    expect(q.total).toBe(1);
  });

  it("supports upsert and delete in memory", async () => {
    const cat = await initEmbeddedCatalog({ store: "memory" });
    const up = await cat.upsertServices([
      { id: "svc-1", name: "Service One", component: "comp-a", tags: ["t1"] },
      { id: "svc-2", name: "Service Two", component: "comp-b", owners: ["alice"] },
    ]);
    expect(up.upserted).toBe(2);

    const q1 = await cat.queryServices({ page: 1, pageSize: 10, sort: "id:asc" });
    expect(q1.total).toBe(2);
    expect(q1.items.map((x) => x.id)).toEqual(["svc-1", "svc-2"]);

    const del = await cat.deleteServices(["svc-1"]);
    expect(del.deleted).toBe(1);

    const q2 = await cat.queryServices({ page: 1, pageSize: 10 });
    expect(q2.total).toBe(1);
    expect(q2.items[0].id).toBe("svc-2");
  });

  it("supports file store with atomic writes and reload", async () => {
    const tmp = path.join(os.tmpdir(), `svc-cat-test-${process.pid}-${Date.now()}.json`);
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}

    const cat1 = await initEmbeddedCatalog({ store: "file", filePath: tmp });
    const h1 = await cat1.health();
    expect(h1.ok).toBe(false); // файл ещё не создан

    const up = await cat1.upsertServices([
      { id: "fsvc-1", name: "File One", component: "comp-f" },
      { id: "fsvc-2", name: "File Two", component: "comp-g" },
    ]);
    expect(up.upserted).toBe(2);

    const h2 = await cat1.health();
    expect(h2.ok).toBe(true); // после записи файл существует

    const qA = await cat1.queryServices({ page: 1, pageSize: 10, sort: "id:asc" });
    expect(qA.total).toBe(2);
    expect(qA.items.map((x) => x.id)).toEqual(["fsvc-1", "fsvc-2"]);

    // Новая инициализация должна перечитать файл по mtime
    const cat2 = await initEmbeddedCatalog({ store: "file", filePath: tmp });
    const qB = await cat2.queryServices({ page: 1, pageSize: 10, sort: "id:asc" });
    expect(qB.total).toBe(2);

    const del = await cat2.deleteServices(["fsvc-1"]);
    expect(del.deleted).toBe(1);
    const qC = await cat2.queryServices({ page: 1, pageSize: 10 });
    expect(qC.total).toBe(1);
  });
});
