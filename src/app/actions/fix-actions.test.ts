
import { fixMultipleMismatches } from './fix-actions';
import { AuditResult, Product, MismatchDetail } from '@/lib/types';
import { updateProductVariant } from '@/lib/shopify';

// Mock dependencies
jest.mock('@/lib/shopify', () => ({
    updateProduct: jest.fn(),
    updateProductVariant: jest.fn(),
    inventorySetQuantities: jest.fn(),
    addProductTags: jest.fn(),
    removeProductTags: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    }
}));

jest.mock('@/services/logger', () => ({
    log: jest.fn(),
}));

jest.mock('@/lib/action-utils', () => ({
    getErrorMessage: (err: any) => err.message || 'Error',
}));

jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
}));


describe('fixMultipleMismatches - compare_at_price', () => {
    const mockCsvProduct: Product = {
        id: 'gid://shopify/Product/1',
        variantId: 'gid://shopify/ProductVariant/12345',
        inventoryItemId: 'gid://shopify/InventoryItem/1',
        sku: 'TEST-SKU',
        name: 'Test Product',
        price: 100,
        inventory: 10,
        descriptionHtml: '',
        productType: 'Test',
        vendor: 'Test Vendor',
        tags: '',
        compareAtPrice: null,
        barcode: '123456',
        weight: 1000,
        mediaUrl: '',
        category: '',
        costPerItem: 50,
        imageId: null,
        option1Name: null,
        option1Value: null,
        option2Name: null,
        option2Value: null,
        option3Name: null,
        option3Value: null,
        templateSuffix: null,
        locationIds: [],
    };

    const mockShopifyProduct: Product = {
        ...mockCsvProduct,
        compareAtPrice: 150, // Mismatch!
    };

    const mockAuditResult: AuditResult = {
        sku: 'TEST-SKU',
        status: 'mismatched',
        csvProducts: [mockCsvProduct],
        shopifyProducts: [mockShopifyProduct],
        mismatches: [
            {
                field: 'compare_at_price',
                csvValue: 'N/A (Should be null or equal to price)',
                shopifyValue: 150,
            },
        ],
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should call updateProductVariant with compare_at_price: null when fixing a compare_at_price mismatch', async () => {
        const result = await fixMultipleMismatches([mockAuditResult], ['compare_at_price']);

        expect(result.success).toBe(true);
        expect(updateProductVariant).toHaveBeenCalledWith(12345, { compare_at_price: null });
    });
});
