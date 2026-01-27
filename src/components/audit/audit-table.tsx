import { Accordion } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { DuplicateAuditTable } from './duplicate-audit-table';
import { AuditResult, Product, AuditStatus, MismatchDetail } from '@/lib/types';
import { Search } from 'lucide-react';
import { AuditTableItem } from './audit-table-item';

interface AuditTableProps {
    paginatedHandleKeys: string[];
    filteredGroupedByHandle: Record<string, AuditResult[]>;
    allGroupedByHandle: Record<string, AuditResult[]>;
    groupedBySku: Record<string, Product[]>;
    filter: string;
    selectedHandles: Set<string>;
    data: AuditResult[];
    imageCounts: Record<string, number>;
    loadingImageCounts: Set<string>;
    isFixing: boolean;
    isAutoRunning: boolean;
    isAutoCreating: boolean;

    // Actions
    handleSelectHandle: (handle: string, checked: boolean) => void;
    handleDeleteUnlinked: (productId: string) => void;
    handleBulkFix: (handles?: Set<string>, types?: MismatchDetail['field'][]) => void;
    handleMarkAsCreated: (handle: string) => void;
    handleCreate: (item: AuditResult) => void;
    handleOpenMissingVariantMediaManager: (items: AuditResult[]) => void;
    handleBulkCreateVariants: (items: AuditResult[]) => void;
    setEditingMediaFor: (id: string) => void;
    setEditingMissingMedia: (handle: string) => void;
    handleFixSingleMismatch: (item: AuditResult, fixType: MismatchDetail['field']) => void;
    handleMarkAsFixed: (sku: string, fixType: MismatchDetail['field']) => void;
    handleDeleteVariant: (item: AuditResult) => void;
    handleDeleteProduct: (item: AuditResult, product?: Product) => void;

    // Utils
    statusConfig: any;
    MISMATCH_FILTER_TYPES: MismatchDetail['field'][];
    setFixDialogHandles: (s: Set<string>) => void;
    setShowFixDialog: (b: boolean) => void;
    onSelectAllPage: () => void;
    isAllPageSelected: boolean;
}

export function AuditTable({
    paginatedHandleKeys, filteredGroupedByHandle, allGroupedByHandle, groupedBySku, filter, selectedHandles, data,
    imageCounts, loadingImageCounts, isFixing, isAutoRunning, isAutoCreating,
    handleSelectHandle, handleDeleteUnlinked, handleBulkFix, handleMarkAsCreated, handleCreate,
    handleOpenMissingVariantMediaManager, handleBulkCreateVariants, setEditingMediaFor, setEditingMissingMedia,
    handleFixSingleMismatch, handleMarkAsFixed, handleDeleteVariant, handleDeleteProduct,
    statusConfig, MISMATCH_FILTER_TYPES, setFixDialogHandles, setShowFixDialog,
    onSelectAllPage, isAllPageSelected
}: AuditTableProps) {

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
                data={data}
                statusConfig={statusConfig}
                isFixing={isFixing}
                isAutoRunning={isAutoRunning}
                handleDeleteProduct={handleDeleteProduct}
            />
        );
    }

    return (
        <div className="space-y-0">
            {(filter === 'mismatched' || filter === 'missing_in_shopify' || filter === 'all') && (
                <div className="sticky top-0 z-10 flex items-center border-b bg-background/95 px-0 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="flex w-full items-center gap-4 px-3">
                        <div className="pl-1">
                            <Checkbox
                                checked={isAllPageSelected}
                                onCheckedChange={onSelectAllPage}
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
            <Accordion type="single" collapsible className="w-full">
                {paginatedHandleKeys.map((handle) => {
                    const items = filteredGroupedByHandle[handle];

                    // Optimization: calculate these here instead of inside the item or passing large data
                    const allVariantsForHandle = allGroupedByHandle[handle] || [];
                    const notInCsv = items?.every((i) => i.status === 'not_in_csv');
                    const isOnlyVariantNotInCsv =
                        !!(notInCsv && items && allVariantsForHandle.length === items.length);

                    const productId = items?.[0]?.shopifyProducts[0]?.id;
                    const imageCount = productId ? imageCounts[productId] : undefined;
                    const isLoadingImages = productId ? loadingImageCounts.has(productId) : false;

                    return (
                        <AuditTableItem
                            key={handle}
                            handle={handle}
                            items={items}
                            filter={filter}
                            isSelected={selectedHandles.has(handle)}
                            isOnlyVariantNotInCsv={isOnlyVariantNotInCsv}
                            imageCount={imageCount}
                            isLoadingImages={isLoadingImages}
                            isFixing={isFixing}
                            isAutoRunning={isAutoRunning}
                            isAutoCreating={isAutoCreating}
                            statusConfig={statusConfig}
                            MISMATCH_FILTER_TYPES={MISMATCH_FILTER_TYPES}
                            handleSelectHandle={handleSelectHandle}
                            handleDeleteUnlinked={handleDeleteUnlinked}
                            handleBulkFix={handleBulkFix}
                            handleMarkAsCreated={handleMarkAsCreated}
                            handleCreate={handleCreate}
                            handleOpenMissingVariantMediaManager={handleOpenMissingVariantMediaManager}
                            handleBulkCreateVariants={handleBulkCreateVariants}
                            setEditingMediaFor={setEditingMediaFor}
                            setEditingMissingMedia={setEditingMissingMedia}
                            handleFixSingleMismatch={handleFixSingleMismatch}
                            handleMarkAsFixed={handleMarkAsFixed}
                            handleDeleteVariant={handleDeleteVariant}
                            handleDeleteProduct={handleDeleteProduct}
                            setFixDialogHandles={setFixDialogHandles}
                            setShowFixDialog={setShowFixDialog}
                        />
                    );
                })}
            </Accordion>
        </div>
    );
}
