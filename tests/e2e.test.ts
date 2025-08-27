import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryStore } from '../src/storage/memoryStore.js';
import { Service } from '../src/types.js';

function makeService(i: number): Service {
  const comp = i % 2 === 0 ? 'DISC' : 'AUTH';
  const owner = i % 3 === 0 ? 'platform' : i % 3 === 1 ? 'core' : 'sec';
  const tags = ['catalog', i % 5 === 0 ? 'x' : 'y'];
  return {
    id: `svc-${i}`,
    name: `Service ${i}`,
    owner,
    component: comp,
    tags,
    description: `Synthetic service ${i}`,
    endpoints: [{ kind: 'http', url: `https://api.example.com/${i}` }],
    updatedAt: new Date(2024, (i % 12), (i % 28) + 1).toISOString(),
  };
}

describe('E2E Service Catalog', () => {
  const N = 2000;
  const data: Service[] = Array.from({ length: N }, (_, i) => makeService(i));
  const store = new MemoryStore(data);
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(store);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists services with pagination and sorting', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/services?limit=10&offset=0&sort=updatedAt&order=desc' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.items).toHaveLength(10);
    expect(body.total).toBe(N);
  });

  it('filters by multiple tags (AND) and owners (OR across items)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/services?tag=catalog&tag=x&owner=platform&owner=core' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    // should be > 0 but < N
    expect(body.total).toBeGreaterThan(0);
    expect(body.total).toBeLessThan(N);
  });

  it('filters by component and date range', async () => {
    const from = '2024-03-01T00:00:00.000Z';
    const to = '2024-08-31T23:59:59.000Z';
    const res = await app.inject({ method: 'GET', url: `/api/services?component=DISC&updatedFrom=${encodeURIComponent(from)}&updatedTo=${encodeURIComponent(to)}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.total).toBeGreaterThan(0);
    for (const it of body.items) {
      expect(it.component).toBe('DISC');
      const t = new Date(it.updatedAt).getTime();
      expect(t).toBeGreaterThanOrEqual(new Date(from).getTime());
      expect(t).toBeLessThanOrEqual(new Date(to).getTime());
    }
  });

  it('export mirrors services list and returns version', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/export?limit=5&offset=0' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.items).toHaveLength(5);
    expect(body.version).toBeDefined();
  });

  it('openapi and docs endpoints are available', async () => {
    const oas = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(oas.statusCode).toBe(200);
    const info = oas.json() as any;
    expect(info.openapi).toBe('3.0.0');

    const docs = await app.inject({ method: 'GET', url: '/docs' });
    expect(docs.statusCode).toBe(200);
    expect(docs.headers['content-type']).toMatch(/text\/html/);
  });

  it('performance: multi-filter query within budget', async () => {
    const t0 = Date.now();
    const res = await app.inject({ method: 'GET', url: '/api/services?component=AUTH&tag=catalog&owner=core&sort=updatedAt&order=desc&limit=50' });
    const dt = Date.now() - t0;
    expect(res.statusCode).toBe(200);
    expect(dt).toBeLessThan(200); // 200ms budget for synthetic 2k
  });
});
