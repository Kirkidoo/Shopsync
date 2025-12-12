import { runAuditComparison } from './audit';
import { Product } from '@/lib/types';

// Mock the shopify library to avoid initialization errors
jest.mock('@/lib/shopify', () => ({
    getShopifyProductsBySku: jest.fn(),
    getFullProduct: jest.fn(),
}));

describe('Audit Service - OVERSIZE Tag', () => {
    const mockCsvProduct: Product = {
        id: '',
        variantId: '',
        inventoryItemId: '',
        handle: 'test-product',
        sku: 'TEST-SKU',
        name: 'Test Product',
        price: 20.0,
        inventory: 10,
        descriptionHtml: '<p>Description</p>',
        productType: 'Type',
        vendor: 'Vendor',
        tags: 'tag1',
        compareAtPrice: null,
        costPerItem: 10.0,
        barcode: null,
        weight: 1000,
        mediaUrl: null,
        category: null,
        option1Name: null,
        option1Value: null,
        option2Name: null,
        option2Value: null,
        option3Name: null,
        option3Value: null,
        imageId: null,
        templateSuffix: null,
    };

    const mockShopifyProduct: Product = {
        ...mockCsvProduct,
        id: 'gid://shopify/Product/123',
        variantId: 'gid://shopify/ProductVariant/456',
        inventoryItemId: 'gid://shopify/InventoryItem/789',
    };

    it('should identify missing OVERSIZE tag when present in CSV but not in Shopify', async () => {
        const csvProduct = { ...mockCsvProduct, tags: 'OVERSIZE, tag1' };
        const shopifyProduct = { ...mockShopifyProduct, tags: 'tag1' };

        const result = await runAuditComparison([csvProduct], [shopifyProduct], 'test.csv');

        expect(result.summary.mismatched).toBe(1);
        expect(result.report[0].status).toBe('mismatched');
        expect(result.report[0].mismatches).toContainEqual(
            expect.objectContaining({ field: 'missing_oversize_tag' })
        );
    });

    it('should match when OVERSIZE tag is present in both', async () => {
        const csvProduct = { ...mockCsvProduct, tags: 'OVERSIZE, tag1' };
        const shopifyProduct = { ...mockShopifyProduct, tags: 'tag1, OVERSIZE' };

        const result = await runAuditComparison([csvProduct], [shopifyProduct], 'test.csv');

        expect(result.summary.matched).toBe(1);
        expect(result.report[0].status).toBe('matched');
    });

    it('should ignore when OVERSIZE tag is not in CSV', async () => {
        const csvProduct = { ...mockCsvProduct, tags: 'tag1' };
        const shopifyProduct = { ...mockShopifyProduct, tags: 'tag1' };

        const result = await runAuditComparison([csvProduct], [shopifyProduct], 'test.csv');

        expect(result.summary.matched).toBe(1);
        expect(result.report[0].status).toBe('matched');
    });
});
