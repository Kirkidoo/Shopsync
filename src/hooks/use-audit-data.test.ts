import { renderHook, act } from '@testing-library/react';
import { useAuditData } from './use-audit-data';
import { AuditResult, Product, Summary } from '@/lib/types';

// Mock getHandle since it's used internally
jest.mock('@/components/audit/audit-utils', () => ({
    getHandle: (item: any) => item.shopifyProducts[0]?.handle || item.csvProducts[0]?.handle || `no-handle-${item.sku}`,
    hasAllExpectedTags: () => true,
}));

// Mock utils
jest.mock('@/lib/utils', () => ({
    getFixedMismatches: () => new Set(),
    getCreatedProductHandles: () => new Set(),
    clearAuditMemory: jest.fn(),
    markMismatchAsFixed: jest.fn(),
}));

describe('useAuditData', () => {
    const mockProduct: Product = {
        id: 'gid://shopify/Product/123',
        variantId: 'gid://shopify/ProductVariant/456',
        inventoryItemId: 'gid://shopify/InventoryItem/789',
        handle: 'test-product',
        sku: 'TEST-SKU',
        name: 'Test Product',
        price: 10.0,
        inventory: 100,
        descriptionHtml: '',
        productType: 'Test',
        vendor: 'Test Vendor',
        tags: '',
        compareAtPrice: null,
        costPerItem: null,
        barcode: null,
        weight: 100,
        mediaUrl: null,
        category: null,
        imageId: null,
        option1Name: null,
        option1Value: null,
        option2Name: null,
        option2Value: null,
        option3Name: null,
        option3Value: null,
        templateSuffix: null
    };

    const mockData: AuditResult[] = [
        {
            sku: 'SKU-1',
            csvProducts: [],
            shopifyProducts: [{ ...mockProduct, handle: 'handle-1', sku: 'SKU-1' }],
            status: 'matched',
            mismatches: []
        },
        {
            sku: 'SKU-2',
            csvProducts: [],
            shopifyProducts: [{ ...mockProduct, handle: 'handle-1', sku: 'SKU-2' }],
            status: 'matched',
            mismatches: []
        },
        {
            sku: 'SKU-3',
            csvProducts: [],
            shopifyProducts: [{ ...mockProduct, handle: 'handle-2', sku: 'SKU-3' }],
            status: 'matched',
            mismatches: []
        }
    ];

    const mockSummary: Summary = {
        matched: 3,
        mismatched: 0,
        not_in_csv: 0,
        missing_in_shopify: 0,
        duplicate_in_shopify: 0
    };

    it('should correctly group all data by handle in allGroupedByHandle', () => {
        const { result } = renderHook(() => useAuditData({ initialData: mockData, initialSummary: mockSummary }));

        // Check if allGroupedByHandle exists and is correct
        expect(result.current.allGroupedByHandle).toBeDefined();

        // Handle 1 should have 2 items
        expect(result.current.allGroupedByHandle['handle-1']).toHaveLength(2);
        expect(result.current.allGroupedByHandle['handle-1'].map(i => i.sku)).toEqual(expect.arrayContaining(['SKU-1', 'SKU-2']));

        // Handle 2 should have 1 item
        expect(result.current.allGroupedByHandle['handle-2']).toHaveLength(1);
        expect(result.current.allGroupedByHandle['handle-2'][0].sku).toBe('SKU-3');
    });

    it('should update allGroupedByHandle when data changes', () => {
        const { result, rerender } = renderHook(({ data }) => useAuditData({ initialData: data, initialSummary: mockSummary }), {
            initialProps: { data: mockData }
        });

        expect(result.current.allGroupedByHandle['handle-1']).toHaveLength(2);

        const newData = [
            ...mockData,
            {
                sku: 'SKU-4',
                csvProducts: [],
                shopifyProducts: [{ ...mockProduct, handle: 'handle-1', sku: 'SKU-4' }],
                status: 'matched' as const,
                mismatches: []
            }
        ];

        rerender({ data: newData });

        expect(result.current.allGroupedByHandle['handle-1']).toHaveLength(3);
        expect(result.current.allGroupedByHandle['handle-1'].map(i => i.sku)).toContain('SKU-4');
    });
});
