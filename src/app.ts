import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { registerServiceRoutes } from './routes/services.js';
import { MemoryStore } from './storage/memoryStore.js';
import { Store } from './storage/store.js';

export async function buildApp(store?: Store): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  const s = store ?? new MemoryStore();
  await registerServiceRoutes(app, s);
  return app;
}
