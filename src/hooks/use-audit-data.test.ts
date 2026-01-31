import { renderHook } from '@testing-library/react';
import { useAuditData } from './use-audit-data';
import { AuditResult, Summary } from '@/lib/types';

// Mock initial data
const mockInitialData: AuditResult[] = [
  {
    sku: 'SKU-1',
    status: 'matched',
    mismatches: [],
    csvProducts: [{ handle: 'handle-1' } as any],
    shopifyProducts: [{ handle: 'handle-1', id: 'gid://1' } as any],
  },
  {
    sku: 'SKU-2',
    status: 'matched',
    mismatches: [],
    csvProducts: [{ handle: 'handle-1' } as any],
    shopifyProducts: [{ handle: 'handle-1', id: 'gid://2' } as any],
  },
  {
    sku: 'SKU-3',
    status: 'not_in_csv',
    mismatches: [],
    csvProducts: [],
    shopifyProducts: [{ handle: 'handle-2', id: 'gid://3' } as any],
  },
];

const mockSummary: Summary = {
  matched: 2,
  mismatched: 0,
  missing_in_shopify: 0,
  not_in_csv: 1,
  duplicate_in_shopify: 0,
};

describe('useAuditData', () => {
  it('should group all items by handle correctly', () => {
    const { result } = renderHook(() =>
      useAuditData({ initialData: mockInitialData, initialSummary: mockSummary })
    );

    // Verify allGroupedByHandle (Note: this property doesn't exist yet, so this test is expected to fail or TS error until implemented)
    // Using 'any' to bypass TS check for now until we update the hook
    const { allGroupedByHandle } = result.current as any;

    expect(allGroupedByHandle).toBeDefined();
    expect(Object.keys(allGroupedByHandle)).toHaveLength(2);
    expect(allGroupedByHandle['handle-1']).toHaveLength(2);
    expect(allGroupedByHandle['handle-2']).toHaveLength(1);

    // Verify content
    const handle1Skus = allGroupedByHandle['handle-1'].map((i: AuditResult) => i.sku);
    expect(handle1Skus).toContain('SKU-1');
    expect(handle1Skus).toContain('SKU-2');
  });
});
