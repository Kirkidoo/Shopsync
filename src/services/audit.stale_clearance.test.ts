import { findStaleClearanceProducts } from './audit';
import { Product } from '@/lib/types';

// Mock dependencies
jest.mock('@/lib/shopify', () => ({
    getShopifyProductsBySku: jest.fn(),
    getShopifyProductsByTag: jest.fn(),
    getFullProduct: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));

describe('findStaleClearanceProducts - Variant Logic', () => {
    const mockProduct = (sku: string, handle: string): Product => ({
        id: `id-${sku}`,
        variantId: `vid-${sku}`,
        inventoryItemId: `iid-${sku}`,
        handle,
        sku,
        name: `Product ${sku}`,
        price: 10.0,
        inventory: 5,
        descriptionHtml: '',
        productType: '',
        vendor: '',
        tags: 'Clearance',
        compareAtPrice: 20.0,
        costPerItem: 5.0,
        barcode: null,
        weight: 0,
        mediaUrl: null,
        category: null,
        imageId: null,
        templateSuffix: 'clearance',
        option1Name: null,
        option1Value: null,
        option2Name: null,
        option2Value: null,
        option3Name: null,
        option3Value: null,
        locationIds: [],
    });

    it('should NOT flag variant A2 if variant A1 is in CSV (same handle)', () => {
        const shopifyA1 = mockProduct('A1', 'product-a');
        const shopifyA2 = mockProduct('A2', 'product-a');

        const csvA1 = { ...shopifyA1 };

        const results = findStaleClearanceProducts(
            [shopifyA1, shopifyA2],
            [csvA1],
            'Clearance.csv'
        );

        // Sku A1 is in CSV -> skip.
        // Sku A2 is NOT in CSV, BUT handle 'product-a' IS in CSV (from A1) -> should skip.
        expect(results).toHaveLength(0);
    });

    it('should flag both B1 and B2 if NO variant of handle B is in CSV', () => {
        const shopifyB1 = mockProduct('B1', 'product-b');
        const shopifyB2 = mockProduct('B2', 'product-b');

        const results = findStaleClearanceProducts(
            [shopifyB1, shopifyB2],
            [],
            'Clearance.csv'
        );

        expect(results).toHaveLength(2);
        expect(results[0].product.sku).toBe('B1');
        expect(results[1].product.sku).toBe('B2');
        expect(results[0].mismatch.csvValue).toBe('Not in Clearance file');
    });
});
