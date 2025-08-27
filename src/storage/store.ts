import { Service, ServiceList } from '../types.js';

export interface Store {
  all(): ServiceList;
  get(id: string): Service | undefined;
  search(params: { q?: string; tag?: string | string[]; component?: string; owner?: string | string[]; updatedFrom?: string; updatedTo?: string }): ServiceList;
  import(list: ServiceList): void;
}
