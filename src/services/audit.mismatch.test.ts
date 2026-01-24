import { findMismatches } from './audit';
import { Product, MismatchDetail } from '@/lib/types';

// Mock dependencies to avoid runtime issues during test
jest.mock('@/lib/shopify', () => ({
  getShopifyProductsBySku: jest.fn(),
}));
jest.mock('./ftp', () => ({}));
jest.mock('./csv', () => ({}));
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock helper to create products
const createProduct = (overrides: Partial<Product>): Product => ({
  id: 'gid://shopify/Product/1',
  variantId: 'gid://shopify/ProductVariant/1',
  inventoryItemId: 'gid://shopify/InventoryItem/1',
  handle: 'test-product',
  sku: 'TEST-SKU',
  name: 'Test Product',
  price: 100,
  inventory: 10,
  descriptionHtml: '',
  productType: 'Test',
  vendor: 'Test Vendor',
  tags: '',
  compareAtPrice: null,
  costPerItem: 50,
  barcode: '123456',
  weight: 1000,
  mediaUrl: '',
  category: '',
  imageId: null,
  option1Name: null,
  option1Value: null,
  option2Name: null,
  option2Value: null,
  option3Name: null,
  option3Value: null,
  templateSuffix: null,
  locationIds: [],
  ...overrides,
});

describe('findMismatches', () => {
  it('detects price mismatch', () => {
    const csv = createProduct({ price: 200 });
    const shopify = createProduct({ price: 100 });
    const result = findMismatches(csv, shopify, 'regular.csv');
    expect(result).toContainEqual(
      expect.objectContaining({ field: 'price', csvValue: 200, shopifyValue: 100 })
    );
  });

  it('detects inventory mismatch', () => {
    const csv = createProduct({ inventory: 50 });
    const shopify = createProduct({ inventory: 40 });
    const result = findMismatches(csv, shopify, 'regular.csv');
    expect(result).toContainEqual(
      expect.objectContaining({ field: 'inventory', csvValue: 50, shopifyValue: 40 })
    );
  });

  describe('Clearance Logic', () => {
    const filename = 'clearance_update.csv';

    it('flags missing clearance tag', () => {
      const csv = createProduct({});
      const shopify = createProduct({ tags: 'summer, sale', templateSuffix: 'clearance' });
      const result = findMismatches(csv, shopify, filename);
      expect(result).toContainEqual(expect.objectContaining({ field: 'missing_clearance_tag' }));
    });

    it('flags incorrect template if tag is present but template is wrong', () => {
      const csv = createProduct({});
      const shopify = createProduct({ tags: 'clearance', templateSuffix: null });
      const result = findMismatches(csv, shopify, filename);
      expect(result).toContainEqual(
        expect.objectContaining({ field: 'incorrect_template_suffix', csvValue: 'clearance' })
      );
    });

    it('passes if tag and template are correct', () => {
      const csv = createProduct({});
      const shopify = createProduct({ tags: 'clearance', templateSuffix: 'clearance' });
      const result = findMismatches(csv, shopify, filename);
      expect(result).toHaveLength(0);
    });

    it('ignores clearance checks if price equals compareAtPrice (Exception)', () => {
      const csv = createProduct({ price: 100, compareAtPrice: 100 });
      // Even if missing tag and template
      const shopify = createProduct({ tags: '', templateSuffix: null, price: 100 });
      const result = findMismatches(csv, shopify, filename);
      // Should NOT have clearance errors. basic price match is satisfied.
      expect(result).not.toContainEqual(
        expect.objectContaining({ field: 'missing_clearance_tag' })
      );
      expect(result).not.toContainEqual(
        expect.objectContaining({ field: 'incorrect_template_suffix' })
      );
    });
  });

  describe('Oversize Logic', () => {
    it('enforces heavy-products template if oversize tag is present', () => {
      const csv = createProduct({}); // File content doesn't trigger oversize, the TAG does.
      const shopify = createProduct({ tags: 'oversize, other', templateSuffix: 'default' });
      const result = findMismatches(csv, shopify, 'regular.csv');
      expect(result).toContainEqual(
        expect.objectContaining({
          field: 'incorrect_template_suffix',
          csvValue: 'heavy-products',
          shopifyValue: 'default',
        })
      );
    });

    it('passes if oversize tag and heavy-products template exist', () => {
      const csv = createProduct({});
      const shopify = createProduct({ tags: 'oversize', templateSuffix: 'heavy-products' });
      const result = findMismatches(csv, shopify, 'regular.csv');
      expect(result).toHaveLength(0);
    });

    it('OVERRIDES Clearance logic: Oversize product in Clearance file uses heavy-products', () => {
      const csv = createProduct({});
      // Product has oversize tag, but we are in clearance file.
      // It should NOT ask for clearance template. It should ask for heavy-products.
      const shopify = createProduct({
        tags: 'oversize, clearance',
        templateSuffix: 'heavy-products',
      });
      const result = findMismatches(csv, shopify, 'clearance.csv');

      // Should NOT complain about bad template (because we have heavy-products)
      expect(result).not.toContainEqual(
        expect.objectContaining({ field: 'incorrect_template_suffix' })
      );
      expect(result).toHaveLength(0);
    });

    it('OVERRIDES Clearance logic: Oversize product in Clearance file without heavy-products fails', () => {
      const csv = createProduct({});
      // Product has oversize tag, is in clearance file, has clearance template.
      // This is WRONG. Should be heavy-products.
      const shopify = createProduct({ tags: 'oversize, clearance', templateSuffix: 'clearance' });
      const result = findMismatches(csv, shopify, 'clearance.csv');

      expect(result).toContainEqual(
        expect.objectContaining({
          field: 'incorrect_template_suffix',
          csvValue: 'heavy-products', // Expected heavy-products
        })
      );
    });

    it('flags mismatch if heavy-products template exists WITHOUT oversize tag (Regular File)', () => {
      const csv = createProduct({});
      const shopify = createProduct({ tags: 'regular', templateSuffix: 'heavy-products' });
      const result = findMismatches(csv, shopify, 'regular.csv');

      expect(result).toContainEqual(
        expect.objectContaining({
          field: 'incorrect_template_suffix',
          csvValue: 'Default Template', // Expected default because not clearance file
          shopifyValue: 'heavy-products',
        })
      );
    });

    it('flags mismatch if heavy-products template exists WITHOUT oversize tag (Clearance File)', () => {
      const csv = createProduct({});
      const shopify = createProduct({ tags: 'regular', templateSuffix: 'heavy-products' });
      const result = findMismatches(csv, shopify, 'clearance.csv');

      expect(result).toContainEqual(
        expect.objectContaining({
          field: 'incorrect_template_suffix',
          csvValue: 'clearance', // Expected clearance because it IS a clearance file
          shopifyValue: 'heavy-products',
        })
      );
    });
  });
});
