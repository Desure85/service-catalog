import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { FileStore } from '../src/storage/fileStore.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';

const sample = [
  {
    id: 'fs-svc-1',
    name: 'FS One',
    owner: 'platform',
    component: 'DISC',
    tags: ['catalog', 'persist'],
    endpoints: [{ kind: 'http', url: 'https://fs-one' }],
    links: [],
    status: 'active',
    updatedAt: '2025-01-01T00:00:00.000Z'
  },
  {
    id: 'fs-svc-2',
    name: 'FS Two',
    owner: 'core',
    component: 'IMPL',
    tags: ['catalog'],
    endpoints: [{ kind: 'http', url: 'https://fs-two' }],
    links: [],
    status: 'active',
    updatedAt: '2025-02-01T00:00:00.000Z'
  }
];

describe('FileStore persistence e2e', () => {
  const filePath = join(tmpdir(), `catalog-filestore-${Date.now()}.json`);
  let app1: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    // First app with FileStore, should create empty file if not exists
    const store = FileStore.fromFile(filePath);
    app1 = await buildApp(store);
  });

  afterAll(async () => {
    await app1.close();
    try { await unlink(filePath); } catch {}
  });

  it('imports into filestore and persists to disk', async () => {
    const res = await app1.inject({
      method: 'POST',
      url: '/api/import',
      payload: { version: 'v1', items: sample }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.imported).toBe(sample.length);

    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(sample.length);
  });

  it('restarts with FileStore and serves persisted data', async () => {
    // Close first app and start a fresh one with the same file
    await app1.close();
    const app2 = await buildApp(FileStore.fromFile(filePath));
    const listRes = await app2.inject({ method: 'GET', url: '/api/services', query: { q: 'FS' } as any });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json() as any;
    expect(Array.isArray(list.items)).toBe(true);
    const ids = new Set(list.items.map((i: any) => i.id));
    expect(ids.has('fs-svc-1')).toBe(true);
    expect(ids.has('fs-svc-2')).toBe(true);

    // Export to NDJSON file and validate line count
    const ndjsonPath = filePath.replace(/\.json$/, '.ndjson');
    const exp = await app2.inject({ method: 'POST', url: '/api/export-file', payload: { path: ndjsonPath, format: 'ndjson' } });
    expect(exp.statusCode).toBe(200);
    const info = exp.json() as any;
    expect(info.ok).toBe(true);

    const nd = await readFile(ndjsonPath, 'utf8');
    const lines = nd.trim().split('\n');
    expect(lines.length).toBe(info.count);

    await app2.close();
    try { await unlink(ndjsonPath); } catch {}
  });
});
