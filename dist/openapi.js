import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { ServiceSchema, ApiImportV1Schema, QuerySchema, SCHEMA_VERSION } from './types.js';
import { z } from 'zod';
// Initialize zod-to-openapi extensions for Zod v3
extendZodWithOpenApi(z);
// Schemas not explicitly exported in types.ts (Endpoint) are inside ServiceSchema.
// We'll register the top-level schemas we expose via API.
const ExportResponseSchema = z.object({
    items: z.array(ServiceSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
    version: z.string().default(SCHEMA_VERSION),
});
export function buildOpenApiDoc(serverUrl = 'http://localhost:3001') {
    const registry = new OpenAPIRegistry();
    // Register core schemas
    registry.register('Service', ServiceSchema);
    registry.register('ServiceListResponse', ExportResponseSchema);
    registry.register('ImportV1', ApiImportV1Schema);
    registry.register('Query', QuerySchema);
    // Paths
    registry.registerPath({
        method: 'get',
        path: '/api/health',
        description: 'Health check',
        responses: {
            200: { description: 'ok' },
        },
    });
    registry.registerPath({
        method: 'get',
        path: '/api/schema',
        description: 'Schema version',
        responses: {
            200: {
                description: 'schema',
                content: {
                    'application/json': {
                        schema: z.object({ version: z.string().default(SCHEMA_VERSION) }),
                    },
                },
            },
        },
    });
    registry.registerPath({
        method: 'get',
        path: '/api/services',
        description: 'List services',
        request: {
            query: QuerySchema,
        },
        responses: {
            200: {
                description: 'list',
                content: { 'application/json': { schema: ExportResponseSchema } },
            },
        },
    });
    registry.registerPath({
        method: 'get',
        path: '/api/services/{id}',
        description: 'Get service',
        request: {
            params: z.object({ id: z.string() }),
        },
        responses: {
            200: {
                description: 'service',
                content: { 'application/json': { schema: ServiceSchema } },
            },
            404: { description: 'not found' },
        },
    });
    registry.registerPath({
        method: 'post',
        path: '/api/import',
        description: 'Import v1',
        request: { body: { content: { 'application/json': { schema: ApiImportV1Schema } } } },
        responses: { 200: { description: 'imported' } },
    });
    registry.registerPath({
        method: 'post',
        path: '/api/import-file',
        description: 'Import from file',
        request: {
            body: { content: { 'application/json': { schema: z.object({ path: z.string() }) } } },
        },
        responses: { 200: { description: 'imported' }, 400: { description: 'bad request' } },
    });
    registry.registerPath({
        method: 'get',
        path: '/api/export',
        description: 'Export list',
        request: { query: QuerySchema },
        responses: {
            200: { description: 'export', content: { 'application/json': { schema: ExportResponseSchema } } },
        },
    });
    registry.registerPath({
        method: 'post',
        path: '/api/export-file',
        description: 'Export to file',
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: z.object({
                            path: z.string(),
                            format: z.enum(['json', 'ndjson']).default('json'),
                        }).merge(QuerySchema.partial().omit({ limit: true, offset: true })),
                    },
                },
            },
        },
        responses: { 200: { description: 'file written' }, 400: { description: 'bad request' } },
    });
    const generator = new OpenApiGeneratorV3(registry.definitions);
    const doc = generator.generateDocument({
        openapi: '3.0.0',
        info: { title: 'MCP Service Catalog', version: '0.1.0' },
        servers: [{ url: serverUrl }],
    });
    return doc;
}
//# sourceMappingURL=openapi.js.map