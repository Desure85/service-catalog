import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerServiceRoutes } from './routes/services.js';
import { MemoryStore } from './storage/memoryStore.js';
export async function buildApp(store) {
    const app = Fastify({ logger: false });
    await app.register(cors, { origin: true });
    const s = store ?? new MemoryStore();
    await registerServiceRoutes(app, s);
    return app;
}
//# sourceMappingURL=app.js.map