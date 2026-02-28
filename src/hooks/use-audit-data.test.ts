import { renderHook } from '@testing-library/react';
import { useAuditData } from './use-audit-data';
import { AuditResult, Summary, Product } from '@/lib/types';

// Mock data helpers
const createMockProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'gid://shopify/Product/1',
  variantId: 'gid://shopify/ProductVariant/1',
  inventoryItemId: 'gid://shopify/InventoryItem/1',
  handle: 'product-handle-1',
  sku: 'SKU-1',
  name: 'Product 1',
  price: 10.0,
  inventory: 10,
  descriptionHtml: '',
  productType: 'Type',
  vendor: 'Vendor',
  tags: '',
  compareAtPrice: null,
  costPerItem: null,
  barcode: null,
  weight: 0,
  mediaUrl: null,
  category: null,
  imageId: null,
  option1Name: null,
  option1Value: null,
  option2Name: null,
  option2Value: null,
  option3Name: null,
  option3Value: null,
  templateSuffix: null,
  ...overrides
});

const createMockAuditResult = (overrides: Partial<AuditResult> = {}): AuditResult => ({
  sku: 'SKU-1',
  csvProducts: [],
  shopifyProducts: [createMockProduct()],
  status: 'matched',
  mismatches: [],
  ...overrides
});

const mockSummary: Summary = {
  matched: 0,
  mismatched: 0,
  not_in_csv: 0,
  missing_in_shopify: 0,
  duplicate_in_shopify: 0
};

describe('useAuditData', () => {
  it('should group all shopify variants by handle', () => {
    const product1 = createMockProduct({ handle: 'handle-1', sku: 'SKU-1' });
    const product2 = createMockProduct({ handle: 'handle-1', sku: 'SKU-2', variantId: 'gid://shopify/ProductVariant/2' });
    const product3 = createMockProduct({ handle: 'handle-2', sku: 'SKU-3' });

    const auditData: AuditResult[] = [
      createMockAuditResult({ sku: 'SKU-1', shopifyProducts: [product1] }),
      createMockAuditResult({ sku: 'SKU-2', shopifyProducts: [product2] }),
      createMockAuditResult({ sku: 'SKU-3', shopifyProducts: [product3] }),
      // Item without shopify product (e.g. missing in shopify)
      createMockAuditResult({ sku: 'SKU-4', shopifyProducts: [], status: 'missing_in_shopify' })
    ];

    const { result } = renderHook(() => useAuditData({
      initialData: auditData,
      initialSummary: mockSummary
    }));

    const grouped = result.current.allShopifyVariantsByHandle;

    expect(grouped['handle-1']).toHaveLength(2);
    expect(grouped['handle-1'].map((i: AuditResult) => i.sku)).toEqual(['SKU-1', 'SKU-2']);

    expect(grouped['handle-2']).toHaveLength(1);
    expect(grouped['handle-2'][0].sku).toEqual('SKU-3');

    // Missing product shouldn't have a key (or be grouped under undefined)
    expect(grouped['undefined']).toBeUndefined();
  });
});
