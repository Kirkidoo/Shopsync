export interface Product {
  sku: string;
  name: string;
  price: number;
}

export type AuditStatus = 'matched' | 'mismatched' | 'new_in_shopify' | 'only_in_csv';

export interface AuditResult {
  sku: string;
  csvProduct: Product | null;
  shopifyProduct: Product | null;
  status: AuditStatus;
}
