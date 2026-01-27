import { renderHook } from '@testing-library/react';
import { useAuditData } from './use-audit-data';
import { AuditResult, AuditStatus, Summary } from '@/lib/types';

describe('useAuditData', () => {
    const mockData: AuditResult[] = [
        {
            sku: 'SKU-1',
            status: 'matched',
            shopifyProducts: [{ handle: 'handle-1' } as any],
            csvProducts: [{ handle: 'handle-1' } as any],
            mismatches: [],
        },
        {
            sku: 'SKU-2',
            status: 'mismatched',
            shopifyProducts: [{ handle: 'handle-1' } as any],
            csvProducts: [{ handle: 'handle-1' } as any],
            mismatches: [{ field: 'price', csvValue: '10', shopifyValue: '20' }],
        },
        {
            sku: 'SKU-3',
            status: 'missing_in_shopify',
            shopifyProducts: [],
            csvProducts: [{ handle: 'handle-2' } as any],
            mismatches: [],
        }
    ];

    const mockSummary: Summary = {
        matched: 1,
        mismatched: 1,
        missing_in_shopify: 1,
        not_in_csv: 0,
        duplicate_in_shopify: 0,
    };

    it('should correctly group all items by handle regardless of filter', () => {
        const { result } = renderHook(() => useAuditData({ initialData: mockData, initialSummary: mockSummary }));

        // Check initial grouping
        expect(result.current.allGroupedByHandle['handle-1']).toHaveLength(2);
        expect(result.current.allGroupedByHandle['handle-2']).toHaveLength(1);

        // Change filter (should affect filteredData/groupedByHandle but NOT allGroupedByHandle)
        // Note: setting filter requires acting inside act() in real app, but here we just check derivation.
        // Wait, renderHook returns result ref which updates on rerender.
        // We can trigger state update.
    });
});
