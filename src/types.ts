import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Enable zod-to-openapi metadata in this module as well
extendZodWithOpenApi(z);

export const SCHEMA_VERSION = 'v1' as const;

export const ServiceSchema = z.object({
  id: z.string().min(1).describe('Уникальный идентификатор сервиса')
    .openapi({ example: 'svc-catalog' }),
  name: z.string().min(1).describe('Человекочитаемое имя сервиса')
    .openapi({ example: 'Service Catalog' }),
  owner: z.string().min(1).describe('Ответственный владелец (группа/команда)')
    .openapi({ example: 'team-platform' }),
  // Компонент по NAM-спецификации: допускаем 3-4 заглавные буквы (например: DOC, NAM, ADR, DISC, IMPL)
  component: z.string().regex(/^[A-Z]{3,4}$/)
    .describe('Код компонента (3–4 заглавные буквы) по NAM-202')
    .openapi({ example: 'DISC' }),
  tags: z.array(z.string()).default([]).describe('Метки для поиска и категоризации')
    .openapi({ example: ['catalog','mcp'] }),
  endpoints: z.array(z.object({
    kind: z.enum(['http', 'grpc', 'tcp']).default('http').describe('Тип эндпойнта'),
    url: z.string().url().or(z.string().min(1)).describe('URL эндпойнта'),
    description: z.string().optional().describe('Описание назначения эндпойнта'),
  })).default([]).describe('Список сетевых эндпойнтов')
    .openapi({
      example: [ { kind: 'http', url: 'https://api.example.com/catalog', description: 'Public API' } ]
    }),
  links: z.array(z.object({
    title: z.string().describe('Заголовок ссылки'),
    url: z.string().url().or(z.string().min(1)).describe('URL ссылки'),
  })).default([]).describe('Внешние ссылки (репозиторий, документация и т.п.)')
    .openapi({ example: [ { title: 'Repo', url: 'https://github.com/org/repo' } ] }),
  updatedAt: z.string().datetime().or(z.string().min(1)).describe('Время последнего обновления ISO8601')
    .openapi({ example: '2025-08-24T12:34:56Z' }),
  status: z.enum(['active','deprecated']).optional().default('active').describe('Статус жизненного цикла')
    .openapi({ example: 'active' }),
  domain: z.string().optional().describe('Бизнес-домен сервиса')
    .openapi({ example: 'catalog' }),
  owners: z.array(z.string()).optional().describe('Дополнительные владельцы/контакты')
    .openapi({ example: ['team-platform','devrel'] }),
  annotations: z.record(z.string()).optional().describe('Произвольные аннотации (k=v)')
    .openapi({ example: { tier: '1', region: 'eu' } }),
}).describe('Сервис каталога (v1)');
export type Service = z.infer<typeof ServiceSchema>;

export const ServiceListSchema = z.array(ServiceSchema);
export type ServiceList = z.infer<typeof ServiceListSchema>;

export const QuerySchema = z.object({
  q: z.string().optional().describe('Строка полнотекстового поиска')
    .openapi({ example: 'catalog' }),
  tag: z.union([z.string(), z.array(z.string())]).optional().describe('Тег(и) фильтрации (AND по множеству)')
    .openapi({ example: ['catalog','mcp'] }),
  component: z.string().regex(/^[A-Z]{3,4}$/).optional().describe('Код компонента по NAM-202 (3–4 заглавные буквы)')
    .openapi({ example: 'DISC' }),
  owner: z.union([z.string(), z.array(z.string())]).optional().describe('Владелец или список владельцев')
    .openapi({ example: ['team-platform'] }),
  updatedFrom: z.string().datetime().optional().describe('Нижняя граница даты обновления (ISO8601)')
    .openapi({ example: '2025-01-01T00:00:00Z' }),
  updatedTo: z.string().datetime().optional().describe('Верхняя граница даты обновления (ISO8601)')
    .openapi({ example: '2025-12-31T23:59:59Z' }),
  limit: z.coerce.number().int().min(1).max(100).default(50).describe('Размер страницы (1..100)')
    .openapi({ example: 20 }),
  offset: z.coerce.number().int().min(0).default(0).describe('Смещение результатов (>=0)')
    .openapi({ example: 0 }),
  sort: z.enum(['id','name','owner','updatedAt']).default('id').describe('Поле сортировки')
    .openapi({ example: 'updatedAt' }),
  order: z.enum(['asc','desc']).default('asc').describe('Порядок сортировки')
    .openapi({ example: 'desc' }),
}).describe('Параметры запроса списка сервисов');
export type Query = z.infer<typeof QuerySchema>;

// API Import payloads
export const ApiImportV1Schema = z.object({
  version: z.literal(SCHEMA_VERSION),
  items: ServiceListSchema,
});
export type ApiImportV1 = z.infer<typeof ApiImportV1Schema>;
