import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryStore } from '../src/storage/memoryStore.js';
import { Service } from '../src/types.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';

const sample: Service[] = [
  {
    id: 'svc-1',
    name: 'A',
    owner: 'platform',
    component: 'DISC',
    tags: ['catalog','x'],
    endpoints: [{ kind: 'http', url: 'https://a' }],
    links: [],
    status: 'active',
    updatedAt: '2024-06-01T00:00:00.000Z'
  },
  {
    id: 'svc-2',
    name: 'B',
    owner: 'core',
    component: 'AUTH',
    tags: ['catalog','y'],
    endpoints: [{ kind: 'http', url: 'https://b' }],
    links: [],
    status: 'active',
    updatedAt: '2024-07-01T00:00:00.000Z'
  }
];

describe('Export to file', () => {
  const store = new MemoryStore(sample);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(store);
  });
  afterAll(async () => {
    await app.close();
  });

  it('writes JSON file with version and items', async () => {
    const path = join(tmpdir(), `catalog-export-${Date.now()}.json`);
    const res = await app.inject({
      method: 'POST',
      url: '/api/export-file',
      payload: { path, format: 'json', tag: 'catalog', sort: 'id', order: 'asc' }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.count).toBeGreaterThan(0);

    const content = await readFile(path, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBeDefined();
    expect(Array.isArray(parsed.items)).toBe(true);

    await unlink(path);
  });

  it('writes NDJSON with one JSON per line', async () => {
    const path = join(tmpdir(), `catalog-export-${Date.now()}.ndjson`);
    const res = await app.inject({
      method: 'POST',
      url: '/api/export-file',
      payload: { path, format: 'ndjson', owner: ['platform','core'] }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.ok).toBe(true);

    const content = await readFile(path, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(body.count);
    const obj = JSON.parse(lines[0]);
    expect(obj.id).toBeDefined();

    await unlink(path);
  });
});
