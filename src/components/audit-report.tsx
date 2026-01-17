'use client';

import { useState, useTransition, useEffect, useRef, useCallback, useMemo } from 'react';
import { AuditResult, AuditStatus, DuplicateSku, Summary, MismatchDetail, Product } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, AccordionHeader } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

// Components
import { AuditStats } from './audit/audit-stats';
import { AuditTabs } from './audit/audit-tabs';
import { AuditToolbar } from './audit/audit-toolbar';
import { AuditTable } from './audit/audit-table';
import { FixMismatchesDialog } from './audit/fix-mismatches-dialog';
import { UpdateTagsDialog } from './audit/update-tags-dialog';
import { MediaManager } from '@/components/media-manager';
import { PreCreationMediaManager } from '@/components/pre-creation-media-manager';

// Hooks
import { useAuditData } from '@/hooks/use-audit-data';
import { useAuditActions } from '@/hooks/use-audit-actions';

// Utils
import { downloadCsv, clearAuditMemory, cn } from '@/lib/utils';
import { AlertTriangle, PlusCircle, XCircle, Copy, FileWarning, CheckCircle2, Siren, Loader2, ArrowLeft, RefreshCw, Download, Check, Wrench, Eye, DollarSign, List, MapPin, Trash2, Bot, ChevronDown, ImageIcon } from 'lucide-react';

const statusConfig: {
  [key in AuditStatus]: {
    icon: React.ElementType;
    text: string;
    badgeClass: string;
  };
} = {
  matched: {
    icon: CheckCircle2,
    text: 'Matched',
    badgeClass:
      'bg-green-100 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
  },
  mismatched: {
    icon: AlertTriangle,
    text: 'Mismatched',
    badgeClass:
      'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700',
  },
  not_in_csv: {
    icon: PlusCircle,
    text: 'Not in CSV',
    badgeClass:
      'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
  },
  missing_in_shopify: {
    icon: XCircle,
    text: 'Missing in Shopify',
    badgeClass:
      'bg-red-100 text-red-800 border-red-200 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',
  },
  duplicate_in_shopify: {
    icon: Copy,
    text: 'Duplicate in Shopify',
    badgeClass:
      'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700',
  },
  duplicate_handle: {
    icon: FileWarning,
    text: 'Duplicate Handle',
    badgeClass:
      'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700',
  },
};

const MISMATCH_FILTER_TYPES: MismatchDetail['field'][] = [
  'price',
  'inventory',
  'missing_clearance_tag',
  'incorrect_template_suffix',
  'clearance_price_mismatch',
  'missing_category_tag',
  'missing_oversize_tag',
  'heavy_product_flag',
  'compare_at_price',
];

interface AuditReportProps {
  data: AuditResult[];
  summary: any;
  duplicates: DuplicateSku[];
  fileName: string;
  onReset: () => void;
  onRefresh: () => void;
}

export default function AuditReport({
  data,
  summary,
  duplicates,
  fileName,
  onReset,
  onRefresh,
}: AuditReportProps) {
  const { toast } = useToast();

  // Data Logic Hook
  const {
    reportData, setReportData,
    reportSummary, setReportSummary,
    filter, setFilter,
    searchTerm, setSearchTerm,
    currentPage, setCurrentPage,
    handlesPerPage, setHandlesPerPage,
    mismatchFilters, setMismatchFilters,
    filterSingleSku, setFilterSingleSku,
    selectedVendor, setSelectedVendor,
    filterCustomTag, setFilterCustomTag,
    fixedMismatches, setFixedMismatches,
    createdProductHandles, setCreatedProductHandles,
    updatedProductHandles, setUpdatedProductHandles,
    filteredData,
    uniqueVendors,
    groupedByHandle,
    groupedBySku,
    handleKeys,
    paginatedHandleKeys,
    totalPages,
    currentSummary,
    columnFilters,
    setColumnFilters,
    availableCsvColumns
  } = useAuditData({ initialData: data, initialSummary: summary });

  // Component Local State (UI)
  const [selectedHandles, setSelectedHandles] = useState<Set<string>>(new Set());
  const [showRefresh, setShowRefresh] = useState(false);

  // Dialog State
  const [editingMissingMedia, setEditingMissingMedia] = useState<string | null>(null);
  const [editingMediaFor, setEditingMediaFor] = useState<string | null>(null);
  const [editingMissingVariantMedia, setEditingMissingVariantMedia] = useState<{
    items: AuditResult[];
    parentProductId: string;
  } | null>(null);

  const [showFixDialog, setShowFixDialog] = useState(false);
  const [fixDialogHandles, setFixDialogHandles] = useState<Set<string> | null>(null);
  const [showUpdateTagsDialog, setShowUpdateTagsDialog] = useState(false);
  const [showAutoTagDialog, setShowAutoTagDialog] = useState(false);
  const [isAutoUpdatingTags, setIsAutoUpdatingTags] = useState(false);
  const [imageCounts, setImageCounts] = useState<Record<string, number>>({});
  const [loadingImageCounts, setLoadingImageCounts] = useState<Set<string>>(new Set());

  // Actions Hook
  const {
    isFixing,
    isAutoRunning,
    isAutoCreating,
    handleFixSingleMismatch,
    handleMarkAsFixed,
    handleBulkFix,
    handleCreate,
    handleMarkAsCreated,
    handleBulkCreate,
    handleBulkCreateVariants,
    handleDeleteProduct,
    handleDeleteVariant,
    handleDeleteUnlinked,
    handleBulkDeleteUnlinked,
    handleUpdateTags,
    startAutoRun,
    stopAutoRun,
    startAutoCreate,
    stopAutoCreate,
    setIsAutoRunning,
    setIsAutoCreating
  } = useAuditActions({
    reportData,
    setReportData,
    fileName,
    onRefresh,
    setFixedMismatches,
    setCreatedProductHandles,
    setUpdatedProductHandles,
    setSelectedHandles
  });

  // Derived UI State
  const isSomeOnPageSelected =
    paginatedHandleKeys.some((handle) => selectedHandles.has(handle)) &&
    !paginatedHandleKeys.every((handle) => selectedHandles.has(handle));
  const isAllOnPageSelected =
    paginatedHandleKeys.length > 0 &&
    paginatedHandleKeys.every((handle) => selectedHandles.has(handle));

  // Selection Logic
  // OPTIMIZATION: Use functional update to avoid recreating function when selectedHandles changes
  const handleSelectHandle = useCallback((handle: string, checked: boolean) => {
    setSelectedHandles((prev) => {
      const newSelected = new Set(prev);
      if (checked) newSelected.add(handle);
      else newSelected.delete(handle);
      return newSelected;
    });
  }, []);

  const toggleSelectAllPage = useCallback(() => {
    const newSelected = new Set(selectedHandles);
    if (isAllOnPageSelected) {
      paginatedHandleKeys.forEach((handle) => newSelected.delete(handle));
    } else {
      paginatedHandleKeys.forEach((handle) => newSelected.add(handle));
    }
    setSelectedHandles(newSelected);
  }, [isAllOnPageSelected, paginatedHandleKeys, selectedHandles]);

  const handleClearAuditMemory = () => {
    clearAuditMemory();
    setFixedMismatches(new Set());
    setCreatedProductHandles(new Set());
    setUpdatedProductHandles(new Set());
    window.location.reload();
  };

  const handleDownload = () => {
    downloadCsv(filteredData, fileName);
  };

  // Effects
  useEffect(() => {
    if (data !== reportData) {
      setShowRefresh(true);
    } else {
      setShowRefresh(false);
    }
  }, [data, reportData]);


  // Auto Run Logic
  const processingRef = useRef(false);

  useEffect(() => {
    if (isAutoRunning && !isFixing && !processingRef.current) {
      const itemToFix = filteredData.find(item =>
        item.status === 'mismatched' && item.mismatches.length > 0
      );

      if (itemToFix) {
        processingRef.current = true;
        const fixableTypes = itemToFix.mismatches.map(m => m.field);

        if (fixableTypes.length > 0) {
          handleBulkFix(new Set([
            itemToFix.shopifyProducts[0]?.handle || itemToFix.sku
          ]), fixableTypes);
        } else {
          processingRef.current = false;
        }
      } else {
        setIsAutoRunning(false);
        toast({
          title: "Auto run complete!",
          description: "All fixable issues have been processed.",
        });
      }
    } else if (!isFixing) {
      processingRef.current = false;
    }
  }, [isAutoRunning, isFixing, filteredData, handleBulkFix, setIsAutoRunning, toast]);

  useEffect(() => {
    if (isAutoCreating && !isFixing && !processingRef.current) {
      const itemToCreate = filteredData.find(item =>
        item.status === 'missing_in_shopify'
      );

      if (itemToCreate) {
        processingRef.current = true;
        handleCreate(itemToCreate);
      } else {
        setIsAutoCreating(false);
        toast({
          title: "Auto create complete!",
          description: "All missing products have been created.",
        });
      }
    } else if (!isFixing) {
      processingRef.current = false;
    }
  }, [isAutoCreating, isFixing, filteredData, handleCreate, setIsAutoCreating, toast]);

  // Tag Auto Update Logic
  const confirmAutoTagUpdate = (tag: string) => {
    setShowAutoTagDialog(false);
    handleUpdateTags(tag, filteredData);
  };

  // Helpers for Media Manager
  const editingMissingMediaVariants = editingMissingMedia
    ? groupedByHandle[editingMissingMedia]?.map(i => i.csvProducts[0]).filter(Boolean) || []
    : [];

  const handleOpenMissingVariantMediaManager = useCallback((items: AuditResult[]) => {
    if (items.length === 0) return;
    const parentId = items[0].shopifyProducts[0]?.id;
    if (parentId) {
      setEditingMissingVariantMedia({ items, parentProductId: parentId });
    }
  }, []);

  const memoizedMissingVariants = useMemo(() => {
    if (!editingMissingVariantMedia) return [];
    return editingMissingVariantMedia.items
      .map((i) => i.csvProducts[0])
      .filter((p): p is Product => !!p);
  }, [editingMissingVariantMedia]);

  const hasSelectionWithUnlinkedImages = selectedHandles.size > 0 && Array.from(selectedHandles).some(h => {
    const items = groupedByHandle[h];
    const pid = items?.[0]?.shopifyProducts[0]?.id;
    const count = pid ? imageCounts[pid] : undefined;
    return count !== undefined && items && count > items.length;
  });

  const hasSelectionWithMismatches = selectedHandles.size > 0 && Array.from(selectedHandles).some(h =>
    groupedByHandle[h]?.some(i => i.status === 'mismatched' && i.mismatches.length > 0)
  );

  // OPTIMIZATION: Memoize handlers passed to AuditTable to prevent unnecessary re-renders of AuditTableItem
  const handleBulkDeleteUnlinkedWrapper = useCallback(() => {
    const ids = Array.from(selectedHandles).map(h => groupedByHandle[h][0].shopifyProducts[0].id).filter(Boolean);
    handleBulkDeleteUnlinked(ids);
  }, [selectedHandles, groupedByHandle, handleBulkDeleteUnlinked]);

  const handleBulkCreateWrapper = useCallback(() => handleBulkCreate(selectedHandles), [selectedHandles, handleBulkCreate]);

  // This one is used by AuditToolbar, depends on selectedHandles
  const handleToolbarBulkFix = useCallback((h?: Set<string>, t?: MismatchDetail['field'][]) => {
      handleBulkFix(h || selectedHandles, t);
  }, [handleBulkFix, selectedHandles]);

  // This one is used by AuditTableItem, does NOT depend on selectedHandles closure (items pass their own handle)
  const handleTableBulkFix = useCallback((h?: Set<string>, t?: MismatchDetail['field'][]) => {
      handleBulkFix(h, t);
  }, [handleBulkFix]);

  const handleMarkAsFixedWrapper = useCallback((sku: string, type: MismatchDetail['field']) => {
      handleMarkAsFixed(sku, type);
  }, [handleMarkAsFixed]);

  return (
    <>
      <Card className="w-full">
        <AuditStats
          reportSummary={currentSummary}
          duplicates={duplicates}
          filter={filter}
          isFixing={isFixing}
          isAutoRunning={isAutoRunning}
          isAutoCreating={isAutoCreating}
          fileName={fileName}
        />
        <CardContent>
          <AuditTabs
            filter={filter}
            setFilter={setFilter}
            reportSummary={currentSummary}
            handleKeysLength={handleKeys.length}
            onReset={onReset}
            onRefresh={onRefresh}
            handleDownload={handleDownload}
            showRefresh={showRefresh}
            isFixing={isFixing}
            isAutoRunning={isAutoRunning}
            isAutoCreating={isAutoCreating}
          />

          <AuditToolbar
            filter={filter}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filterSingleSku={filterSingleSku}
            setFilterSingleSku={setFilterSingleSku}
            mismatchFilters={mismatchFilters}
            handleMismatchFilterChange={(field, checked) => {
              const next = new Set(mismatchFilters);
              if (checked) next.add(field);
              else next.delete(field);
              setMismatchFilters(next);
            }}
            handleClearAuditMemory={handleClearAuditMemory}
            selectedVendor={selectedVendor}
            setSelectedVendor={setSelectedVendor}
            uniqueVendors={uniqueVendors}
            isFixing={isFixing}
            isAutoRunning={isAutoRunning}
            isAutoCreating={isAutoCreating}
            selectedHandlesSize={selectedHandles.size}
            hasSelectionWithMismatches={hasSelectionWithMismatches}
            hasSelectionWithUnlinkedImages={hasSelectionWithUnlinkedImages}
            handleBulkFix={handleToolbarBulkFix}
            handleBulkDeleteUnlinked={handleBulkDeleteUnlinkedWrapper}
            handleBulkCreate={handleBulkCreateWrapper}
            startAutoRun={startAutoRun}
            stopAutoRun={stopAutoRun}
            startAutoCreate={startAutoCreate}
            stopAutoCreate={stopAutoCreate}
            availableMismatchTypes={new Set(MISMATCH_FILTER_TYPES)}
            setFixDialogHandles={setFixDialogHandles}
            setShowFixDialog={setShowFixDialog}
            MISMATCH_FILTER_TYPES={MISMATCH_FILTER_TYPES}
            columnFilters={columnFilters}
            setColumnFilters={setColumnFilters}
            availableCsvColumns={availableCsvColumns}
          />

          <AuditTable
            paginatedHandleKeys={paginatedHandleKeys}
            filteredGroupedByHandle={groupedByHandle}
            groupedBySku={groupedBySku}
            filter={filter}
            selectedHandles={selectedHandles}
            data={reportData}
            imageCounts={imageCounts}
            loadingImageCounts={loadingImageCounts}
            isFixing={isFixing}
            isAutoRunning={isAutoRunning}
            isAutoCreating={isAutoCreating}

            handleSelectHandle={handleSelectHandle}
            handleDeleteUnlinked={handleDeleteUnlinked}
            handleBulkFix={handleTableBulkFix}
            handleMarkAsCreated={handleMarkAsCreated}
            handleCreate={handleCreate}
            handleOpenMissingVariantMediaManager={handleOpenMissingVariantMediaManager}
            handleBulkCreateVariants={handleBulkCreateVariants}
            setEditingMediaFor={setEditingMediaFor}
            setEditingMissingMedia={setEditingMissingMedia}
            handleFixSingleMismatch={handleFixSingleMismatch}
            handleMarkAsFixed={handleMarkAsFixedWrapper}
            handleDeleteVariant={handleDeleteVariant}
            handleDeleteProduct={handleDeleteProduct}

            statusConfig={statusConfig}
            MISMATCH_FILTER_TYPES={MISMATCH_FILTER_TYPES}
            setFixDialogHandles={setFixDialogHandles}
            setShowFixDialog={setShowFixDialog}
            onSelectAllPage={toggleSelectAllPage}
            isAllPageSelected={isAllOnPageSelected}
          />

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-4">
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1 || isFixing || isAutoRunning || isAutoCreating}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || isFixing || isAutoRunning || isAutoCreating}
              >
                Next
              </Button>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Dialogs */}
      <Dialog open={!!editingMediaFor} onOpenChange={(open) => !open && setEditingMediaFor(null)}>
        <DialogContent className="max-w-5xl">
          {editingMediaFor && (
            <MediaManager
              key={editingMediaFor}
              productId={editingMediaFor}
              onImageCountChange={(newCount: number) => {
                setImageCounts(prev => ({ ...prev, [editingMediaFor]: newCount }));
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingMissingMedia}
        onOpenChange={(open) => !open && setEditingMissingMedia(null)}
      >
        <DialogContent className="max-w-5xl">
          {editingMissingMedia && (
            <PreCreationMediaManager
              key={editingMissingMedia}
              variants={editingMissingMediaVariants}
              onSave={(result) => {
                setEditingMissingMedia(null);
                toast({ title: "Media saved (simulation)", description: "This feature requires implementation." });
              }}
              onCancel={() => setEditingMissingMedia(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingMissingVariantMedia}
        onOpenChange={(open) => !open && setEditingMissingVariantMedia(null)}
      >
        <DialogContent className="max-w-5xl">
          {editingMissingVariantMedia && (
            <MediaManager
              key={editingMissingVariantMedia.parentProductId}
              productId={editingMissingVariantMedia.parentProductId}
              onImageCountChange={() => { }}
              isMissingVariantMode={true}
              missingVariants={memoizedMissingVariants}
              onSaveMissingVariant={(result) => {
                setEditingMissingVariantMedia(null);
                onRefresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <UpdateTagsDialog
        isOpen={showUpdateTagsDialog}
        onClose={() => setShowUpdateTagsDialog(false)}
        onConfirm={(tag) => handleUpdateTags(tag, Array.from(selectedHandles).map(h => groupedByHandle[h][0]))}
        count={selectedHandles.size}
      />
      <UpdateTagsDialog
        isOpen={showAutoTagDialog}
        onClose={() => setShowAutoTagDialog(false)}
        onConfirm={confirmAutoTagUpdate}
        count={reportData.filter(item => item.shopifyProducts.length > 0).length}
      />
      <FixMismatchesDialog
        isOpen={showFixDialog}
        onClose={() => {
          setShowFixDialog(false);
          setFixDialogHandles(null);
        }}
        onConfirm={(types) => {
          handleBulkFix(fixDialogHandles || selectedHandles, types);
          setShowFixDialog(false);
          setFixDialogHandles(null);
        }}
        availableTypes={new Set(MISMATCH_FILTER_TYPES)}
      />
    </>
  );
}
