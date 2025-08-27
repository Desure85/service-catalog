import fs from 'node:fs';
import path from 'node:path';
import { ServiceListSchema } from '../types.js';
import { MemoryStore } from './memoryStore.js';
export class FileStore {
    constructor(filePath, list) {
        this.filePath = filePath;
        this.delegate = new MemoryStore(list);
    }
    static fromFile(filePath) {
        const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
        let list = [];
        if (fs.existsSync(abs)) {
            const raw = fs.readFileSync(abs, 'utf-8');
            const json = JSON.parse(raw);
            list = ServiceListSchema.parse(json);
        }
        else {
            // ensure directory exists
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, '[]', 'utf-8');
        }
        return new FileStore(abs, list);
    }
    saveAtomic(list) {
        const tmp = `${this.filePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf-8');
        fs.renameSync(tmp, this.filePath);
    }
    all() { return this.delegate.all(); }
    get(id) { return this.delegate.get(id); }
    search(params) {
        return this.delegate.search(params);
    }
    import(list) {
        this.delegate.import(list);
        // persist current snapshot
        this.saveAtomic(this.delegate.all());
    }
}
//# sourceMappingURL=fileStore.js.map