import fs from 'node:fs';
import path from 'node:path';
import { Service, ServiceList, ServiceListSchema } from '../types.js';
import { Store } from './store.js';
import { MemoryStore } from './memoryStore.js';

export class FileStore implements Store {
  private delegate: MemoryStore;
  private filePath: string;

  private constructor(filePath: string, list: ServiceList) {
    this.filePath = filePath;
    this.delegate = new MemoryStore(list);
  }

  static fromFile(filePath: string): FileStore {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    let list: ServiceList = [];
    if (fs.existsSync(abs)) {
      const raw = fs.readFileSync(abs, 'utf-8');
      const json = JSON.parse(raw);
      list = ServiceListSchema.parse(json);
    } else {
      // ensure directory exists
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, '[]', 'utf-8');
    }
    return new FileStore(abs, list);
  }

  private saveAtomic(list: ServiceList) {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf-8');
    fs.renameSync(tmp, this.filePath);
  }

  all() { return this.delegate.all(); }
  get(id: string) { return this.delegate.get(id); }
  search(params: { q?: string; tag?: string | string[]; component?: string; owner?: string | string[]; updatedFrom?: string; updatedTo?: string }) {
    return this.delegate.search(params);
  }
  import(list: ServiceList) {
    this.delegate.import(list);
    // persist current snapshot
    this.saveAtomic(this.delegate.all());
  }
}
