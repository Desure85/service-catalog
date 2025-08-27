import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerServiceRoutes } from './routes/services.js';
import { MemoryStore } from './storage/memoryStore.js';
import { FileStore } from './storage/fileStore.js';
async function main() {
    const app = Fastify({ logger: true });
    await app.register(cors, { origin: true });
    const mode = (process.env.STORE || 'memory').toLowerCase();
    const filePath = process.env.FILE_PATH || 'data/services.json';
    const store = mode === 'file' ? FileStore.fromFile(filePath) : MemoryStore.fromFile(filePath);
    await registerServiceRoutes(app, store);
    const port = Number(process.env.PORT || 3001);
    const host = process.env.HOST || '0.0.0.0';
    try {
        await app.listen({ port, host });
        app.log.info(`service-catalog listening on http://${host}:${port}`);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=server.js.map