
import { renderHook } from '@testing-library/react';
import { useAuditData } from './use-audit-data';
import { AuditResult, Summary } from '@/lib/types';

// Mock getHandle since it's used in the hook
jest.mock('@/components/audit/audit-utils', () => ({
  getHandle: (item: any) => item.shopifyProducts[0]?.handle || item.csvProducts[0]?.handle || `no-handle-${item.sku}`,
  hasAllExpectedTags: jest.fn(),
}));

// Mock utils
jest.mock('@/lib/utils', () => ({
  getFixedMismatches: () => new Set(),
  getCreatedProductHandles: () => new Set(),
  markMismatchAsFixed: jest.fn(),
}));

describe('useAuditData Optimization', () => {
  it('should correctly compute allGroupedByHandle', () => {
    const mockData: AuditResult[] = [
      {
        sku: 'SKU1',
        status: 'matched',
        mismatches: [],
        shopifyProducts: [{ handle: 'handle-1', id: '1', tags: '', vendor: '' } as any],
        csvProducts: [{ handle: 'handle-1', tags: '', category: '' } as any],
        variantId: 'v1'
      },
      {
        sku: 'SKU2',
        status: 'matched',
        mismatches: [],
        shopifyProducts: [{ handle: 'handle-1', id: '1', tags: '', vendor: '' } as any], // Same handle
        csvProducts: [{ handle: 'handle-1', tags: '', category: '' } as any],
        variantId: 'v2'
      },
      {
        sku: 'SKU3',
        status: 'not_in_csv',
        mismatches: [],
        shopifyProducts: [{ handle: 'handle-2', id: '2', tags: '', vendor: '' } as any],
        csvProducts: [],
        variantId: 'v3'
      }
    ];

    const mockSummary: Summary = {
      matched: 0, mismatched: 0, missing_in_shopify: 0, not_in_csv: 0, duplicate_in_shopify: 0, duplicate_handle: 0
    };

    const { result } = renderHook(() => useAuditData({ initialData: mockData, initialSummary: mockSummary }));

    const map = result.current.allGroupedByHandle;

    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(2);
    expect(map.get('handle-1')).toHaveLength(2);
    expect(map.get('handle-2')).toHaveLength(1);

    // Check content
    const handle1Items = map.get('handle-1');
    expect(handle1Items?.map(i => i.sku)).toEqual(['SKU1', 'SKU2']);
  });
});
