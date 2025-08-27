# MCP Service Catalog

Минимальный сервис каталога сервисов для MCP. Поддерживает импорт v1, фильтры (включая мульти‑значные и по дате), сортировку, пагинацию, экспорт и OpenAPI с интерактивной документацией.

## Run

```bash
# from ./service-catalog
npm install
npm run dev  # http://localhost:3001
```

Конфигурация хранилища:

- По умолчанию используется память (`STORE=memory`) с первоначальной загрузкой из `data/services.json`.
- Файловое хранилище: установить `STORE=file` и (опционально) `FILE_PATH` (по умолчанию `data/services.json`).

Примеры:

```bash
# Память (default)
STORE=memory npm run dev

# Файл (автосохранение при импорте)
STORE=file FILE_PATH=data/services.json npm run dev
```

Хранилище: память и файл

По умолчанию используется in-memory хранилище. Для персистентности включите файловое JSON‑хранилище:

```bash
STORE=file FILE_PATH=data/services.json npm run dev
```

При импорте данные автоматически сохраняются атомарной записью.

```bash
curl -s -X POST http://localhost:3001/api/import-file \
  -H 'Content-Type: application/json' \
  -d '{ "path": "data/services.json" }'
```

## Endpoints

- GET `/api/health` → `{ status: "ok" }`
- GET `/api/services` → `{ items: Service[] }`
  - Query params: `q`, `tag`, `component` (3-4 upper letters, e.g. `DISC`, `IMPL`)
- GET `/api/services/:id` → `Service`
- POST `/api/import` (body: `{ version: "v1", items: Service[] }`) → `{ imported: number, version: "v1" }`
 - POST `/api/import-file` (body: `{ path: "data/*.json" }`) → `{ imported: number, version: "v1" }`
 - GET `/api/export` → `{ items, total, limit, offset, version }` (поддерживает те же query‑параметры, что и `/api/services`)
 - POST `/api/export-file` (body: `{ path: string, format?: 'json'|'ndjson', ...filters }`) → `{ ok: true, path, format, count }`
 - GET `/openapi.json` → OpenAPI 3.0 спецификация (генерируется из Zod)
 - GET `/docs` → Swagger UI для `/openapi.json`

## Data Schema

`Service` (v1):
- `id: string`
- `name: string`
- `owner: string`
- `component: [A-Z]{3,4}` (per MCP-NAM-202)
- `tags: string[]`
- `endpoints: { kind: 'http'|'grpc'|'tcp', url: string, description?: string }[]`
- `links: { title: string, url: string }[]`
- `updatedAt: ISO string`
- `status?: 'active'|'deprecated'` (default: `active`)
- `domain?: string`
- `owners?: string[]`
- `annotations?: Record<string,string>`

Zod validators enforce schema on import and on startup.

## Быстрый старт

1) Установка зависимостей

```bash
npm i
```

2) Запуск сервера (по умолчанию STORE=memory)

```bash
npm run dev
```

3) Проверка health

```bash
curl -s http://127.0.0.1:3001/api/health | jq
```

4) Swagger UI (интерактивная документация)

Откройте в браузере:

- http://127.0.0.1:3001/docs — Swagger UI
- http://127.0.0.1:3001/openapi.json — OpenAPI спецификация

## Импорт

Поддерживается импорт схемы v1: `POST /api/import` с `version:"v1"` и массивом `items`.

```bash
curl -s -X POST http://127.0.0.1:3001/api/import \
  -H 'content-type: application/json' \
  -d '{
    "version":"v1",
    "items": [
      {
        "id":"svc-1",
        "name":"Service 1",
        "owner":"platform",
        "component":"DISC",
        "tags":["catalog","x"],
        "endpoints":[{"kind":"http","url":"https://api.example.com/1"}],
        "updatedAt":"2024-06-01T12:00:00.000Z"
      }
    ]
  }'
```

Импорт из файла: `POST /api/import-file` с JSON `{ "path": "data/services.json" }`.

```bash
curl -s -X POST http://127.0.0.1:3001/api/import-file \
  -H 'content-type: application/json' \
  -d '{"path":"data/services.json"}'
```

## Usage examples

Base URL: `http://localhost:3001`

Health:

```bash
curl -s http://localhost:3001/api/health
```

Schema version:

```bash
curl -s http://localhost:3001/api/schema
```

List services with filters, sort, pagination:

```bash
curl -s "http://localhost:3001/api/services?component=DISC&owner=team-platform&sort=updatedAt&order=desc&limit=10&offset=0"
```

Full-text search (q) and tag filter:

```bash
curl -s "http://localhost:3001/api/services?q=catalog&tag=catalog"
```

Get by id:

```bash
curl -s http://localhost:3001/api/services/svc-catalog
```

Import payload (v1):

```bash
curl -s -X POST http://localhost:3001/api/import \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "v1",
    "items": [
      {
        "id": "svc-new",
        "name": "New Service",
        "owner": "team-platform",
        "component": "DISC",
        "tags": ["new"],
        "endpoints": [{ "kind": "http", "url": "http://localhost:9000" }],
        "links": [{ "title": "Repo", "url": "http://example.com" }],
        "updatedAt": "2025-08-24T12:34:56Z"
      }
    ]
  }'
```

Экспорт (тот же набор фильтров):

```bash
curl -s 'http://localhost:3001/api/export?component=DISC&sort=updatedAt&order=desc&limit=2&offset=0' | jq '{total, version, ids: [.items[].id]}'
```

OpenAPI JSON:

```bash
curl -s http://127.0.0.1:3001/openapi.json | jq '.info'
```

## Smoke

Quick check of meta fields (total/limit/offset) and ordering:

```bash
curl -s 'http://localhost:3001/api/services?component=DISC&sort=updatedAt&order=desc&limit=1&offset=0'
```

Экспорт (тот же набор фильтров):

```bash
curl -s 'http://localhost:3001/api/export?component=DISC&sort=updatedAt&order=desc&limit=2&offset=0' | jq '{total, version, ids: [.items[].id]}'
```

OpenAPI JSON:

```bash
curl -s http://127.0.0.1:3001/openapi.json | jq '.info'
```

## Library (ESM)

Библиотека предоставляет ESM‑API, доступное через экспорт `service-catalog/lib`.

### Установка

Бандл и типы публикуются в `dist/` и экспортируются в `package.json` через поле `exports`:

```json
{
  "exports": {
    "./lib": {
      "import": "./dist/lib.mjs",
      "types": "./dist/lib.d.ts"
    }
  },
  "types": "./dist/lib.d.ts"
}
```

### Быстрый старт (ESM)

```ts
import { initEmbeddedCatalog } from 'service-catalog/lib';
import type { ServiceItem, ServiceQuery } from 'service-catalog/lib';

// Выберите хранилище: 'memory' | 'file' | 'sqlite'
const catalog = await initEmbeddedCatalog({
  store: 'file',
  filePath: 'data/services.json',
  // driver: 'auto' | 'native' | 'wasm' // используется только для store='sqlite'
});

// Health (показывает, был ли активирован фоллбэк)
const h = await catalog.health();
console.log(h);

// Чтение: фильтры, сортировка, пагинация
const page = await catalog.queryServices({
  component: 'DISC',
  search: 'catalog', // полнотекстовый поиск по id/name/component/tags
  sort: 'updatedAt:desc', // поле:направление
  page: 1,
  pageSize: 10,
} satisfies ServiceQuery);
console.log(page.items.map(i => i.id));

// Запись: upsert/delete (в памяти и JSON/JSONL файле; JSONL‑директория — read‑only)
await catalog.upsertServices([
  { id: 'svc-new', name: 'New', owner: 'team-platform', component: 'DISC', tags: [], endpoints: [], links: [], updatedAt: new Date().toISOString() } as ServiceItem,
]);
await catalog.deleteServices(['svc-old']);
```

### Режимы хранения

- memory — данные хранятся в памяти процесса, чтение/поиск быстрые за счёт индексов.
- file — JSON/NDJSON (JSONL) файл; поддерживается атомарная запись снапшота и потоковое чтение для JSONL/директории `.jsonl`.
- sqlite — в текущем билде драйверы SQLite не связаны; автодетект сообщает `available=false` и библиотека автоматически выполняет фоллбэк в `file` (если задан `filePath`) или в `memory`.

См. `src/lib/sqlite/driver.ts` и `src/lib/embedded.ts` — поле `health().detail` отражает `fallback: true` и `driverResolution`.

### Поиск и фильтры

- Фильтры: `component`, `domain`, `status`, `owner`(ы), `tag`(и), `updatedFrom/updatedTo`.
- Полнотекст: поле `search` (по id/name/component/tags).
- Сортировка: `sort` в формате `field[:asc|desc]` (поддерживается `updatedAt`, строки/числа).
- Пагинация: `page`, `pageSize`.

Интерфейсы: `ServiceItem`, `ServiceQuery`, `ServicePage` экспортированы в `service-catalog/lib`.

## Next

- Validate per-schema version header in payloads (v1)
- Persist to file/db (beyond in-memory)
- Pagination & sorting
