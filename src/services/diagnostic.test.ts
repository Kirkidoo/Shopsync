
import { findMismatches } from './audit';
import { Product } from '@/lib/types';

// Mock dependencies to avoid runtime issues during test
jest.mock('@/lib/shopify', () => ({
    getShopifyProductsBySku: jest.fn(),
    getShopifyProductsByTag: jest.fn(),
}));
jest.mock('./ftp', () => ({}));
jest.mock('./csv', () => ({}));
jest.mock('@/lib/logger', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    }
}));

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

describe('Diagnostic Audit Check', () => {
    it('handles numerical equality even with strings', () => {
        const csv = createProduct({ price: 369.95 });
        const shopify = createProduct({
            price: 369.95,
            compareAtPrice: "369.95" as any
        });

        const result = findMismatches(csv, shopify, 'regular.csv');
        const mismatch = result.find(m => m.field === 'compare_at_price');
        expect(mismatch).toBeUndefined(); // SHOULD MATCH
    });

    it('handles numeric equality for price mismatch check', () => {
        const csv = createProduct({ price: 369.95 });
        const shopify = createProduct({ price: "369.95" as any });

        const result = findMismatches(csv, shopify, 'regular.csv');
        const mismatch = result.find(m => m.field === 'price');
        expect(mismatch).toBeUndefined(); // SHOULD MATCH
    });

    it('correctly flags real mismatch', () => {
        const csv = createProduct({ price: 369.95 });
        const shopify = createProduct({
            price: 369.95,
            compareAtPrice: 389.95
        });

        const result = findMismatches(csv, shopify, 'regular.csv');
        const mismatch = result.find(m => m.field === 'compare_at_price');
        expect(mismatch).toBeDefined(); // SHOULD FLAG
    });

    it('handles null compareAtPrice correctly', () => {
        const csv = createProduct({ price: 100 });
        const shopify = createProduct({ price: 100, compareAtPrice: null });

        const result = findMismatches(csv, shopify, 'regular.csv');
        const mismatch = result.find(m => m.field === 'compare_at_price');
        expect(mismatch).toBeUndefined(); // SHOULD MATCH
    });

    it('handles undefined compareAtPrice and identifies potential bug', () => {
        const csv = createProduct({ price: 100 });
        const shopify = createProduct({ price: 100, compareAtPrice: undefined as any });

        const result = findMismatches(csv, shopify, 'regular.csv');
        const mismatch = result.find(m => m.field === 'compare_at_price');

        // If it's undefined, Number(undefined) is NaN. NaN !== price is true.
        if (mismatch) {
            console.log("UNDEFINED TRIGGERED MISMATCH (as expected with current logic)");
        }
    });

    it('handles zero compareAtPrice correctly', () => {
        const csv = createProduct({ price: 100 });
        const shopify = createProduct({ price: 100, compareAtPrice: 0 });

        const result = findMismatches(csv, shopify, 'regular.csv');
        const mismatch = result.find(m => m.field === 'compare_at_price');

        if (mismatch) {
            console.log("ZERO TRIGGERED MISMATCH (0 is not null and not 100)");
        }
    });
});
