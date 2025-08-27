import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryStore } from '../src/storage/memoryStore.js';
import { SCHEMA_VERSION } from '../src/types.js';

const seed = [
  {
    id: 'a', name: 'Alpha', owner: 'team-a', component: 'DISC', tags: ['x'],
    endpoints: [{ kind: 'http', url: 'http://a' }], links: [], updatedAt: '2025-08-24T10:00:00Z'
  },
  {
    id: 'b', name: 'Beta', owner: 'team-b', component: 'IMPL', tags: ['y'],
    endpoints: [{ kind: 'http', url: 'http://b' }], links: [], updatedAt: '2025-08-24T11:00:00Z'
  },
  {
    id: 'c', name: 'Catalog', owner: 'team-a', component: 'DISC', tags: ['x','catalog'],
    endpoints: [{ kind: 'http', url: 'http://c' }], links: [], updatedAt: '2025-08-24T12:00:00Z'
  },
];

describe('routes: services', () => {
  const store = new MemoryStore(seed as any);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(store);
  });

  it('health ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
  });

  it('filter by component and sort by updatedAt desc with pagination', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/services?component=DISC&sort=updatedAt&order=desc&limit=1&offset=0' });
    const body = res.json() as any;
    expect(body.total).toBe(2);
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(0);
    expect(body.items[0].id).toBe('c');
  });

  it('filter by owner and tag and q', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/services?owner=team-a&tag=catalog&q=catalog' });
    const body = res.json() as any;
    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe('c');
  });

  it('import v1 replaces/adds items', async () => {
    const payload = { version: SCHEMA_VERSION, items: [ { ...seed[0], id: 'a2' } ] };
    const res = await app.inject({ method: 'POST', url: '/api/import', payload });
    expect(res.statusCode).toBe(200);
    const info = res.json() as any;
    expect(info.version).toBe('v1');
    expect(info.imported).toBe(1);

    const list = await app.inject({ method: 'GET', url: '/api/services?q=a2' });
    const body = list.json() as any;
    expect(body.items.some((it: any) => it.id === 'a2')).toBe(true);
  });

  it('import-file loads from data/services.json (v0/v1) and imports', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/import-file', payload: { path: 'data/services.json' } });
    expect(res.statusCode).toBe(200);
    const info = res.json() as any;
    expect(info.version).toBe('v1');
    expect(info.imported).toBeGreaterThan(0);
  });
});
