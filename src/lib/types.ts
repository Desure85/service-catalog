export interface ServiceQuery {
  search?: string;
  component?: string;
  owner?: string | string[];
  tag?: string | string[];
  domain?: string;
  status?: string;
  updatedFrom?: string; // ISO
  updatedTo?: string;   // ISO
  sort?: string;        // "field:asc|desc", e.g. "updatedAt:desc"
  page?: number;
  pageSize?: number;
}

export interface ServiceItem {
  id: string;
  name: string;
  component: string;
  domain?: string;
  status?: string;
  owners?: string[];
  tags?: string[];
  annotations?: Record<string, string>;
  updatedAt?: string; // ISO
}

export interface ServicePage {
  items: ServiceItem[];
  total: number;
  page: number;
  pageSize: number;
}
