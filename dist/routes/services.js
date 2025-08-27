import { ApiImportV1Schema, QuerySchema, SCHEMA_VERSION } from '../types.js';
import { ImportFileBodySchema, loadJsonFile, normalizeToV1 } from '../normalize.js';
import { z } from 'zod';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { buildOpenApiDoc } from '../openapi.js';
export async function registerServiceRoutes(app, store) {
    app.get('/api/health', async () => ({ status: 'ok' }));
    app.get('/api/schema', async () => ({ version: SCHEMA_VERSION }));
    app.get('/api/services', async (req) => {
        const query = QuerySchema.parse(req.query);
        const result = store.search(query);
        const sorted = [...result].sort((a, b) => {
            const dir = query.order === 'asc' ? 1 : -1;
            switch (query.sort) {
                case 'name':
                    return dir * a.name.localeCompare(b.name);
                case 'owner':
                    return dir * a.owner.localeCompare(b.owner);
                case 'updatedAt':
                    return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
                case 'id':
                default:
                    return dir * a.id.localeCompare(b.id);
            }
        });
        const total = sorted.length;
        const start = Math.min(query.offset, Math.max(0, total));
        const end = Math.min(start + query.limit, total);
        const page = sorted.slice(start, end);
        return { items: page, total, limit: query.limit, offset: query.offset };
    });
    app.get('/api/services/:id', async (req, reply) => {
        const { id } = req.params;
        const svc = store.get(id);
        if (!svc)
            return reply.code(404).send({ error: 'not_found', message: 'Service not found' });
        return svc;
    });
    app.post('/api/import', async (req) => {
        const payload = ApiImportV1Schema.parse(req.body);
        store.import(payload.items);
        return { imported: payload.items.length, version: payload.version };
    });
    app.post('/api/import-file', async (req, reply) => {
        const body = ImportFileBodySchema.parse(req.body);
        try {
            const data = loadJsonFile(body.path);
            const v1 = normalizeToV1(data);
            store.import(v1.items);
            return { imported: v1.items.length, version: v1.version, from: body.path };
        }
        catch (e) {
            return reply.code(400).send({ error: 'bad_request', message: e?.message ?? 'Invalid file' });
        }
    });
    // Export API
    app.get('/api/export', async (req) => {
        const query = QuerySchema.parse(req.query);
        const result = store.search(query);
        const sorted = [...result].sort((a, b) => {
            const dir = query.order === 'asc' ? 1 : -1;
            switch (query.sort) {
                case 'name':
                    return dir * a.name.localeCompare(b.name);
                case 'owner':
                    return dir * a.owner.localeCompare(b.owner);
                case 'updatedAt':
                    return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
                case 'id':
                default:
                    return dir * a.id.localeCompare(b.id);
            }
        });
        const total = sorted.length;
        const start = Math.min(query.offset, Math.max(0, total));
        const end = Math.min(start + query.limit, total);
        const page = sorted.slice(start, end);
        return { items: page, total, limit: query.limit, offset: query.offset, version: SCHEMA_VERSION };
    });
    // Export to file (JSON or NDJSON)
    app.post('/api/export-file', async (req, reply) => {
        const bodySchema = z.object({
            path: z.string().min(1),
            format: z.enum(['json', 'ndjson']).default('json'),
            // optional filters same as query
            q: z.string().optional(),
            tag: z.union([z.string(), z.array(z.string())]).optional(),
            component: z.string().regex(/^[A-Z]{3,4}$/).optional(),
            owner: z.union([z.string(), z.array(z.string())]).optional(),
            updatedFrom: z.string().datetime().optional(),
            updatedTo: z.string().datetime().optional(),
            sort: z.enum(['id', 'name', 'owner', 'updatedAt']).default('id'),
            order: z.enum(['asc', 'desc']).default('asc'),
        });
        const input = bodySchema.safeParse(req.body);
        if (!input.success)
            return reply.code(400).send({ error: 'invalid body', issues: input.error.issues });
        const { path, format, ...filters } = input.data;
        const items = store.search({ ...filters });
        await mkdir(dirname(path), { recursive: true });
        if (format === 'json') {
            const payload = JSON.stringify({ version: SCHEMA_VERSION, items }, null, 2);
            await writeFile(path, payload, 'utf8');
        }
        else {
            const lines = items.map((it) => JSON.stringify(it)).join('\n') + (items.length ? '\n' : '');
            await writeFile(path, lines, 'utf8');
        }
        return { ok: true, path, format, count: items.length };
    });
    // OpenAPI document (generated from Zod)
    app.get('/openapi.json', async () => buildOpenApiDoc('http://localhost:3001'));
    app.get('/docs', async (req, reply) => {
        reply.header('content-type', 'text/html; charset=utf-8');
        return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>MCP Service Catalog — API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>body { margin:0 }</style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui' });
      };
    </script>
  </body>
</html>`;
    });
}
//# sourceMappingURL=services.js.map