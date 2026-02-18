export interface Product {
  id: string; // Shopify Product GID
  variantId: string; // Shopify Variant GID
  inventoryItemId: string; // Shopify Inventory Item GID
  handle: string;
  sku: string;
  name: string;
  price: number;
  inventory: number | null;
  descriptionHtml: string | null;
  productType: string | null;
  vendor: string | null;
  tags: string | null;
  compareAtPrice: number | null;
  costPerItem: number | null;
  barcode: string | null;
  weight: number | null; // Always in grams from source
  mediaUrl: string | null;
  category: string | null; // For mapping to Shopify Collections
  imageId: number | null; // Shopify Image ID
  option1Name: string | null;
  option1Value: string | null;
  option2Name: string | null;
  option2Value: string | null;
  option3Name: string | null;
  option3Value: string | null;
  templateSuffix: string | null;
  locationIds?: string[]; // List of location GIDs where this variant is stocked
  rawCsvData?: Record<string, string>; // Raw CSV row data for display
}

export type AuditStatus =
  | 'mismatched'
  | 'not_in_csv'
  | 'missing_in_shopify'
  | 'duplicate_in_shopify'
  | 'duplicate_handle'
  | 'matched';

export interface MismatchDetail {
  field:
  | 'price'
  | 'inventory'
  | 'missing_in_shopify'
  | 'duplicate_in_shopify'
  | 'duplicate_handle'
  | 'missing_clearance_tag'
  | 'incorrect_template_suffix'
  | 'clearance_price_mismatch'
  | 'missing_category_tag'
  | 'missing_oversize_tag'
  | 'heavy_product_flag'
  | 'compare_at_price'
  | 'h1_tag'
  | 'stale_clearance_tag';
  csvValue: string | number | null;
  shopifyValue: string | number | null;
  missingType?: 'product' | 'variant';
}

export interface AuditResult {
  sku: string;
  csvProducts: Product[];
  shopifyProducts: Product[];
  status: AuditStatus;
  mismatches: MismatchDetail[];
}

export interface DuplicateSku {
  sku: string;
  count: number;
}

export interface Summary {
  matched: number;
  mismatched: number;
  not_in_csv: number;
  missing_in_shopify: number;
  duplicate_in_shopify: number;
  duplicate_handle: number;
}

export interface ShopifyProductImage {
  id: number;
  product_id: number;
  src: string;
  variant_ids: number[];
  isFtpSource?: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'ERROR' | 'WARN' | 'SUCCESS';
  message: string;
  details?: any;
}
