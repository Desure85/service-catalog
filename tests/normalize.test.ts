import { describe, it, expect } from 'vitest';
import { normalizeToV1 } from '../src/normalize.js';
import { SCHEMA_VERSION } from '../src/types.js';

const svc = {
  id: 'x', name: 'X', owner: 'team-x', component: 'disc',
  tags: ['t'], endpoints: [{ kind: 'http', url: 'http://x' }], links: [], updatedAt: '2025-08-24T00:00:00Z'
};

describe('normalizeToV1', () => {
  it('passes through v1 payload', () => {
    const v1 = { version: SCHEMA_VERSION, items: [svc] } as any;
    const out = normalizeToV1(v1);
    expect(out.version).toBe('v1');
    expect(out.items[0].component).toBe('DISC');
  });

  it('accepts v0 {items:[..]}', () => {
    const v0 = { items: [svc] } as any;
    const out = normalizeToV1(v0);
    expect(out.version).toBe('v1');
    expect(out.items[0].component).toBe('DISC');
  });

  it('accepts raw array', () => {
    const arr = [svc] as any;
    const out = normalizeToV1(arr);
    expect(out.items.length).toBe(1);
  });

  it('rejects invalid', () => {
    expect(() => normalizeToV1({})).toThrowError();
  });
});
