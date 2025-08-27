import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ApiImportV1Schema, Service, ServiceSchema } from './types.js';

export const ImportFileBodySchema = z.object({
  path: z.string().regex(/^data\/.+\.json$/),
  version: z.enum(['v0','v1']).optional()
});

export type ImportFileBody = z.infer<typeof ImportFileBodySchema>;

export function loadJsonFile<T = unknown>(filePath: string): T {
  const abs = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(abs, 'utf-8');
  return JSON.parse(raw) as T;
}

export function normalizeToV1(input: unknown): { version: 'v1', items: Service[] } {
  // Accept: v1 payload, v0 object {items}, or raw array of services
  // 1) v1
  const maybeV1 = ApiImportV1Schema.safeParse(input);
  if (maybeV1.success) {
    // ensure each item passes ServiceSchema (already validated in ApiImportV1Schema)
    return maybeV1.data;
  }

  // 2) object with items (v0)
  if (typeof input === 'object' && input && 'items' in (input as any)) {
    const items = (input as any).items;
    if (!Array.isArray(items)) throw new Error('Invalid v0: items must be an array');
    const normalized = items.map(normalizeServiceItem);
    return { version: 'v1', items: normalized };
  }

  // 3) raw array
  if (Array.isArray(input)) {
    const normalized = input.map(normalizeServiceItem);
    return { version: 'v1', items: normalized };
  }

  throw new Error('Unsupported import payload');
}

function normalizeServiceItem(it: any): Service {
  if (!it || typeof it !== 'object') throw new Error('Invalid service item');
  // Normalize component: uppercase
  const component = String(it.component ?? '').toUpperCase();
  const updatedAt = it.updatedAt ?? new Date().toISOString();
  const svc = {
    id: String(it.id),
    name: String(it.name),
    owner: String(it.owner),
    component,
    tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
    endpoints: Array.isArray(it.endpoints) ? it.endpoints.map((e: any) => ({
      kind: e?.kind ?? 'http',
      url: String(e?.url),
      description: e?.description ?? undefined,
    })) : [],
    links: Array.isArray(it.links) ? it.links.map((l: any) => ({
      title: String(l?.title ?? 'link'),
      url: String(l?.url),
    })) : [],
    updatedAt: String(updatedAt),
  } as Service;
  // Validate with schema, will enforce component /^[A-Z]{3,4}$/
  return ServiceSchema.parse(svc);
}
