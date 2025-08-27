import { performance } from 'node:perf_hooks';
import { MemoryStore } from '../src/storage/memoryStore.js';
import { Service, ServiceList } from '../src/types.js';

// Simple percentile helper
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function randPick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randStr(prefix: string, n = 6) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = prefix;
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function generateServices(count: number): ServiceList {
  const components = ['DISC','IMPL','DOCS','ADRS'];
  const owners = Array.from({ length: 20 }, (_, i) => `team-${i}`);
  const tags = ['catalog', 'mcp', 'backend', 'frontend', 'infra', 'etl', 'realtime', 'batch'];
  const out: ServiceList = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const id = `svc-${i}-${randStr('')}`;
    const tcount = 1 + Math.floor(Math.random() * 4);
    const stags = Array.from({ length: tcount }, () => randPick(tags));
    const updatedAt = new Date(now - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 365)).toISOString();
    const svc: Service = {
      id,
      name: `Service ${i}`,
      owner: randPick(owners),
      component: randPick(components),
      tags: Array.from(new Set(stags)),
      endpoints: [
        { kind: 'http', url: `https://api.example.com/${id}` }
      ],
      links: [],
      updatedAt,
      status: 'active',
      domain: Math.random() < 0.5 ? 'catalog' : 'platform',
      owners: Math.random() < 0.3 ? [randPick(owners)] : undefined,
      annotations: Math.random() < 0.2 ? { tier: String(1 + Math.floor(Math.random()*3)) } : undefined,
    };
    out.push(svc);
  }
  return out;
}

async function runCase(store: MemoryStore, name: string, fn: () => void, iterations = 100) {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    const t1 = performance.now();
    times.push(t1 - t0);
  }
  times.sort((a, b) => a - b);
  const p50 = percentile(times, 50);
  const p95 = percentile(times, 95);
  console.log(`${name}: p50=${p50.toFixed(2)}ms, p95=${p95.toFixed(2)}ms`);
}

async function main() {
  const sizes = (process.env.SIZES || '2000,10000').split(',').map(s => Number(s.trim())).filter(Boolean);
  const iterations = Number(process.env.ITERS || 100);

  for (const n of sizes) {
    console.log(`\n=== Dataset: ${n} services ===`);
    const data = generateServices(n);
    const store = new MemoryStore(data);

    // Warmup simple queries
    store.search({ q: 'service' });

    const sample = data[Math.floor(Math.random() * data.length)];
    const comp = sample.component;
    const owner = sample.owner;
    const tagA = sample.tags[0] || 'catalog';
    const tagB = 'mcp';

    await runCase(store, 'by component', () => { store.search({ component: comp }); }, iterations);
    await runCase(store, 'by owner', () => { store.search({ owner }); }, iterations);
    await runCase(store, 'by tags (AND 2)', () => { store.search({ tag: [tagA, tagB] }); }, iterations);
    await runCase(store, 'by q="catalog"', () => { store.search({ q: 'catalog' }); }, iterations);
    const from = new Date(Date.now() - 1000 * 60 * 60 * 24 * 180).toISOString();
    await runCase(store, 'by updatedFrom (180d)', () => { store.search({ updatedFrom: from }); }, iterations);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
