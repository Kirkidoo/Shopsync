import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { DuplicateAuditTable } from './duplicate-audit-table';
import { AuditResult, Product, AuditStatus, MismatchDetail } from '@/lib/types';
import { Search } from 'lucide-react';
import { AuditTableItem } from './audit-table-item';
import { useAuditUIStore, useAuditDataStore } from '@/store/audit-store';
import { useAuditData } from '@/hooks/use-audit-data';
import { useAuditActions } from '@/hooks/use-audit-actions';

interface AuditTableProps {
    statusConfig: any;
    MISMATCH_FILTER_TYPES: MismatchDetail['field'][];
    fileName: string;
    onRefresh: () => void;
}

export function AuditTable({
    statusConfig, MISMATCH_FILTER_TYPES, fileName, onRefresh
}: AuditTableProps) {
    const parentRef = useRef<HTMLDivElement>(null);

    // Data Hook (contains derived data like groupedByHandle, paginatedHandleKeys)
    const {
        paginatedHandleKeys,
        groupedByHandle,
        groupedBySku,
        reportData: reportDataArray
    } = useAuditData();
    const reportData = useAuditDataStore((state) => state.reportData);

    // UI Store Selectors
    const filter = useAuditUIStore((state) => state.filter);
    const isFixing = useAuditUIStore((state) => state.isFixing);
    const isAutoRunning = useAuditUIStore((state) => state.isAutoRunning);
    const isAutoCreating = useAuditUIStore((state) => state.isAutoCreating);
    const setSelectedHandles = useAuditUIStore((state) => state.setSelectedHandles);
    const selectedHandles = useAuditUIStore((state) => state.selectedHandles);
    const imageCounts = useAuditDataStore((state) => state.imageCounts);
    const loadingImageCounts = useAuditDataStore((state) => state.loadingImageCounts);

    // Derived Selection State (keeping it local for now as it depends on paginatedHandleKeys)
    const isAllOnPageSelected = paginatedHandleKeys.length > 0 &&
        paginatedHandleKeys.every(h => selectedHandles.has(h));

    const toggleSelectAllPage = () => {
        if (isAllOnPageSelected) {
            setSelectedHandles((prev: Set<string>) => {
                const next = new Set(prev);
                paginatedHandleKeys.forEach(h => next.delete(h));
                return next;
            });
        } else {
            setSelectedHandles((prev: Set<string>) => {
                const next = new Set(prev);
                paginatedHandleKeys.forEach(h => next.add(h));
                return next;
            });
        }
    };

    const rowVirtualizer = useVirtualizer({
        count: paginatedHandleKeys.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 64, // Estimated height of an AccordionItem
        overscan: 10,
    });

    if (paginatedHandleKeys.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <div className="mb-4 rounded-full bg-muted p-4">
                    <Search className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="mb-1 text-lg font-medium text-foreground">No items found</h3>
                <p>Try adjusting your search or filters.</p>
            </div>
        );
    }

    if (filter === 'duplicate_in_shopify') {
        return (
            <DuplicateAuditTable
                paginatedHandleKeys={paginatedHandleKeys}
                groupedBySku={groupedBySku}
                reportData={reportData}
                statusConfig={statusConfig}
                fileName={fileName}
                onRefresh={onRefresh}
            />
        );
    }

    return (
        <div
            ref={parentRef}
            className="h-[calc(100vh-250px)] overflow-auto"
        >
            {(filter === 'mismatched' || filter === 'missing_in_shopify' || filter === 'all') && (
                <div className="sticky top-0 z-20 flex items-center border-b bg-background/95 px-0 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="flex w-full items-center gap-4 px-3">
                        <div className="pl-1">
                            <Checkbox
                                checked={isAllOnPageSelected}
                                onCheckedChange={toggleSelectAllPage}
                                aria-label="Select all on page"
                                disabled={isFixing || isAutoRunning || isAutoCreating}
                            />
                        </div>
                        <div className="flex-grow text-xs font-medium uppercase tracking-wider text-muted-foreground pl-3">
                            Product / Issue
                        </div>
                        <div className="mr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Actions
                        </div>
                    </div>
                </div>
            )}
            <div
                style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                <div className="w-full">
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const handle = paginatedHandleKeys[virtualRow.index];
                        const items = groupedByHandle[handle];

                        // Optimization: calculate these here instead of inside the item or passing large data
                        const allVariantsForHandleInShopify = reportDataArray.filter(
                            (d) => d.shopifyProducts[0]?.handle === handle
                        );
                        const notInCsv = items?.every((i) => i.status === 'not_in_csv');
                        const isOnlyVariantNotInCsv =
                            !!(notInCsv && items && allVariantsForHandleInShopify.length === items.length);

                        const productId = items?.[0]?.shopifyProducts[0]?.id;
                        const imageCount = productId ? imageCounts[productId] : undefined;
                        const isLoadingImages = productId ? loadingImageCounts.has(productId) : false;

                        return (
                            <div
                                key={virtualRow.key}
                                ref={rowVirtualizer.measureElement}
                                data-index={virtualRow.index}
                                className="pb-6"
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <AuditTableItem
                                    handle={handle}
                                    items={items}
                                    isOnlyVariantNotInCsv={isOnlyVariantNotInCsv}
                                    imageCount={imageCount}
                                    isLoadingImages={isLoadingImages}
                                    statusConfig={statusConfig}
                                    MISMATCH_FILTER_TYPES={MISMATCH_FILTER_TYPES}
                                    fileName={fileName}
                                    onRefresh={onRefresh}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
