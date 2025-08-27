import { describe, it, expect } from 'vitest';
import { ServiceSchema, ServiceListSchema, ApiImportV1Schema, SCHEMA_VERSION } from '../src/types.js';

describe('Service schema v1', () => {
  it('accepts valid service', () => {
    const svc = ServiceSchema.parse({
      id: 'svc-x',
      name: 'X',
      owner: 'team-x',
      component: 'DISC',
      tags: ['a'],
      endpoints: [{ kind: 'http', url: 'http://localhost:1' }],
      links: [{ title: 'repo', url: 'http://example.com' }],
      updatedAt: '2025-08-24T10:00:00Z',
    });
    expect(svc.id).toBe('svc-x');
  });

  it('rejects invalid component (lowercase or len!=3..4)', () => {
    expect(() => ServiceSchema.parse({
      id: 'bad', name: 'Bad', owner: 't', component: 'ImPl', updatedAt: '2025-08-24'
    })).toThrowError();
    expect(() => ServiceSchema.parse({
      id: 'bad2', name: 'Bad2', owner: 't', component: 'TOOLONG', updatedAt: '2025-08-24'
    })).toThrowError();
  });

  it('import payload requires version v1', () => {
    const payload = ApiImportV1Schema.parse({ version: SCHEMA_VERSION, items: ServiceListSchema.parse([]) });
    expect(payload.version).toBe('v1');
  });
});
