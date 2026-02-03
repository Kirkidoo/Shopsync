import { renderHook, act } from '@testing-library/react';
import { useAuditData } from './use-audit-data';
import { AuditResult, Summary } from '@/lib/types';

// Mock data
const mockSummary: Summary = {
  matched: 0,
  mismatched: 0,
  not_in_csv: 0,
  missing_in_shopify: 0,
  duplicate_in_shopify: 0,
};

const mockData: AuditResult[] = [
  {
    sku: 'SKU1',
    status: 'mismatched',
    mismatches: [{ field: 'price', csvValue: '10', shopifyValue: '20' }],
    csvProducts: [],
    shopifyProducts: [{ handle: 'handle1', id: '1' } as any],
  },
  {
    sku: 'SKU2',
    status: 'matched',
    mismatches: [],
    csvProducts: [],
    shopifyProducts: [{ handle: 'handle1', id: '1' } as any], // Same handle as SKU1
  },
  {
    sku: 'SKU3',
    status: 'missing_in_shopify',
    mismatches: [],
    csvProducts: [],
    shopifyProducts: [], // No handle
  },
  {
    sku: 'SKU4',
    status: 'not_in_csv',
    mismatches: [],
    csvProducts: [],
    shopifyProducts: [{ handle: 'handle2', id: '2' } as any],
  }
];

describe('useAuditData', () => {
  it('should return allGroupedByHandle containing all items with handles', () => {
    const { result } = renderHook(() => useAuditData({ initialData: mockData, initialSummary: mockSummary }));

    const { allGroupedByHandle } = result.current;

    // Check handle1
    expect(allGroupedByHandle['handle1']).toBeDefined();
    expect(allGroupedByHandle['handle1']).toHaveLength(2);
    expect(allGroupedByHandle['handle1'].map(i => i.sku).sort()).toEqual(['SKU1', 'SKU2']);

    // Check handle2
    expect(allGroupedByHandle['handle2']).toBeDefined();
    expect(allGroupedByHandle['handle2']).toHaveLength(1);
    expect(allGroupedByHandle['handle2'][0].sku).toBe('SKU4');

    // Check missing handle
    // SKU3 has no shopifyProducts, so no handle. It should not be in the map.
    const allHandles = Object.values(allGroupedByHandle).flat();
    expect(allHandles.find(i => i.sku === 'SKU3')).toBeUndefined();
  });

  it('should maintain allGroupedByHandle even when filteredData is filtered', () => {
    const { result } = renderHook(() => useAuditData({ initialData: mockData, initialSummary: mockSummary }));

    // Apply filter to remove 'matched' items
    act(() => {
        result.current.setFilter('mismatched');
    });

    // filteredData should only have SKU1
    expect(result.current.filteredData).toHaveLength(1);
    expect(result.current.filteredData[0].sku).toBe('SKU1');

    // groupedByHandle (based on filteredData) should only have handle1 with SKU1
    expect(result.current.groupedByHandle['handle1']).toHaveLength(1);
    expect(result.current.groupedByHandle['handle1'][0].sku).toBe('SKU1');

    // allGroupedByHandle should still have both SKU1 and SKU2 for handle1
    expect(result.current.allGroupedByHandle['handle1']).toHaveLength(2);
    expect(result.current.allGroupedByHandle['handle1'].map(i => i.sku).sort()).toEqual(['SKU1', 'SKU2']);
  });
});
