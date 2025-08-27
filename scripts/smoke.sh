#!/usr/bin/env bash
set -euo pipefail
BASE="http://127.0.0.1:3001"

echo "# Health" && curl -s "$BASE/api/health" | jq .
echo

echo "# Schema" && curl -s "$BASE/api/schema" | jq .
echo

echo "# List (DISC, sort by updatedAt desc, limit=1)" && \
  curl -s "$BASE/api/services?component=DISC&sort=updatedAt&order=desc&limit=1&offset=0" | jq '{total,limit,offset,first: .items[0].id}'
echo

echo "# Search (q=catalog, tag=catalog)" && \
  curl -s "$BASE/api/services?q=catalog&tag=catalog" | jq '{total, ids: [.items[].id]}'
echo

echo "# OpenAPI" && curl -s "$BASE/openapi.json" | jq '.openapi, .info.title'
echo

echo "# Docs (Swagger UI status)" && curl -s -o /dev/null -w "%{http_code}\n" "$BASE/docs"
echo
