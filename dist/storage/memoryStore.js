import fs from 'node:fs';
import path from 'node:path';
import { ServiceListSchema, ServiceSchema } from '../types.js';
export class MemoryStore {
    constructor(initial) {
        this.services = new Map();
        this.byComponent = new Map();
        this.byOwner = new Map();
        this.byTag = new Map();
        if (initial)
            this.load(initial);
    }
    static fromFile(filePath) {
        const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
        const raw = fs.readFileSync(abs, 'utf-8');
        const json = JSON.parse(raw);
        const list = ServiceListSchema.parse(json);
        return new MemoryStore(list);
    }
    load(list) {
        this.services.clear();
        this.byComponent.clear();
        this.byOwner.clear();
        this.byTag.clear();
        for (const s of list) {
            const parsed = ServiceSchema.parse(s);
            this.services.set(parsed.id, parsed);
            this.indexService(parsed);
        }
    }
    all() {
        return Array.from(this.services.values());
    }
    get(id) {
        return this.services.get(id);
    }
    search(params) {
        const { q, tag, component, owner, updatedFrom, updatedTo } = params;
        // Build candidate set via indices
        let candidateIds = null;
        if (component) {
            candidateIds = new Set(this.byComponent.get(component) ?? []);
        }
        if (owner) {
            const owners = Array.isArray(owner) ? owner : [owner];
            const ownerSet = new Set(owners.flatMap(o => Array.from(this.byOwner.get(o) ?? [])));
            candidateIds = candidateIds === null ? ownerSet : intersect(candidateIds, ownerSet);
        }
        if (tag) {
            const tags = Array.isArray(tag) ? tag : [tag];
            // For tags we require every tag to be present → intersect sets for each tag
            let tagSet = null;
            for (const t of tags) {
                const ids = new Set(this.byTag.get(t) ?? []);
                tagSet = tagSet === null ? ids : intersect(tagSet, ids);
            }
            candidateIds = candidateIds === null ? (tagSet ?? new Set()) : intersect(candidateIds, tagSet ?? new Set());
        }
        // Expand candidates to records; if still null → all services
        const base = candidateIds ? Array.from(candidateIds).map(id => this.services.get(id)).filter(Boolean) : this.all();
        // Apply residual filters (dates and q)
        const filtered = base.filter((s) => {
            if (updatedFrom && new Date(s.updatedAt).getTime() < new Date(updatedFrom).getTime())
                return false;
            if (updatedTo && new Date(s.updatedAt).getTime() > new Date(updatedTo).getTime())
                return false;
            if (q) {
                const hay = `${s.id} ${s.name} ${s.owner} ${s.component} ${s.tags.join(' ')} ${s.endpoints.map(e => e.url).join(' ')}`.toLowerCase();
                if (!hay.includes(q.toLowerCase()))
                    return false;
            }
            return true;
        });
        return filtered;
    }
    import(list) {
        for (const s of list) {
            const parsed = ServiceSchema.parse(s);
            this.services.set(parsed.id, parsed);
            this.indexService(parsed);
        }
    }
    indexService(svc) {
        // component
        if (!this.byComponent.has(svc.component))
            this.byComponent.set(svc.component, new Set());
        this.byComponent.get(svc.component).add(svc.id);
        // owner
        if (!this.byOwner.has(svc.owner))
            this.byOwner.set(svc.owner, new Set());
        this.byOwner.get(svc.owner).add(svc.id);
        // tags
        for (const t of svc.tags) {
            if (!this.byTag.has(t))
                this.byTag.set(t, new Set());
            this.byTag.get(t).add(svc.id);
        }
    }
}
function intersect(a, b) {
    const out = new Set();
    const smaller = a.size <= b.size ? a : b;
    const larger = a.size <= b.size ? b : a;
    for (const v of smaller)
        if (larger.has(v))
            out.add(v);
    return out;
}
