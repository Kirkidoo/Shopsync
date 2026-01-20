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

const getHandle = (item: AuditResult) =>
  item.shopifyProducts[0]?.handle || item.csvProducts[0]?.handle || `no-handle-${item.sku}`;

const hasAllExpectedTags = (
  shopifyTags: string | undefined | null,
  csvTags: string | undefined | null,
  category: string | undefined | null,
  customTag: string
): boolean => {
  if (!shopifyTags) return false;

  const currentTags = new Set(
    shopifyTags.split(',').map((t) => t.trim().toLowerCase())
  );

  // 1. Check CSV Tags (first 3)
  if (csvTags) {
    const expectedCsvTags = csvTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 3);

    for (const tag of expectedCsvTags) {
      if (!currentTags.has(tag)) return false;
    }
  }

  // 2. Check Category
  if (category) {
    if (!currentTags.has(category.trim().toLowerCase())) return false;
  }

  // 3. Check Custom Tag
  if (customTag) {
    if (!currentTags.has(customTag.trim().toLowerCase())) return false;
  }

  return true;
};

const MismatchDetails = ({
  mismatches,
  onFix,
  onMarkAsFixed,
  disabled,
  sku,
}: {
  mismatches: MismatchDetail[];
  onFix: (fixType: MismatchDetail['field']) => void;
  onMarkAsFixed: (fixType: MismatchDetail['field']) => void;
  disabled: boolean;
  sku: string;
}) => {
  return (
    <div className="mt-2 flex flex-col gap-2">
      {mismatches.map((mismatch, index) => {
        const canBeFixed =
          mismatch.field !== 'duplicate_in_shopify' && mismatch.field !== 'heavy_product_flag';
        const isWarningOnly = mismatch.field === 'heavy_product_flag';

        return (
          <div
            key={`${sku}-${mismatch.field}-${index}`}
            className="flex items-center gap-2 rounded-md bg-yellow-50 p-2 text-xs dark:bg-yellow-900/20"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
            <div className="flex-grow">
              <span className="font-semibold capitalize">
                {mismatch.field.replace(/_/g, ' ')}:{' '}
              </span>
              {mismatch.field === 'h1_tag' && (
                <span className="text-muted-foreground">
                  Product description contains an H1 tag.
                </span>
              )}
              {mismatch.field === 'duplicate_in_shopify' && (
                <span className="text-muted-foreground">SKU exists multiple times in Shopify.</span>
              )}
              {mismatch.field === 'heavy_product_flag' && (
                <span className="text-muted-foreground">
                  Product is over 50lbs ({mismatch.csvValue}).
                </span>
              )}

              {mismatch.field === 'clearance_price_mismatch' && (
                <span className="text-muted-foreground">
                  Price equals Compare At Price. Not a valid clearance item.
                </span>
              )}
              {mismatch.field !== 'h1_tag' &&
                mismatch.field !== 'duplicate_in_shopify' &&
                mismatch.field !== 'heavy_product_flag' &&
                mismatch.field !== 'clearance_price_mismatch' && (
                  <>
                    <span className="mr-2 text-red-500 line-through">
                      {mismatch.shopifyValue ?? 'N/A'}
                    </span>
                    <span className="text-green-500">{mismatch.csvValue ?? 'N/A'}</span>
                  </>
                )}
            </div>
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => onMarkAsFixed(mismatch.field)}
                      disabled={disabled}
                      aria-label="Mark as fixed"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Mark as fixed (hide from report)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {canBeFixed && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => onFix(mismatch.field)}
                  disabled={disabled}
                >
                  <Wrench className="mr-1.5 h-3.5 w-3.5" />
                  Fix
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const MissingProductDetailsDialog = ({ product }: { product: Product }) => {
  const dataMap: { label: string; value: any; notes?: string }[] = [
    // Product Level
    { label: 'Shopify Product Title', value: product.name, notes: "From 'Title' column" },
    { label: 'Shopify Product Handle', value: product.handle, notes: "From 'Handle' column" },
    {
      label: 'Product Description',
      value: product.descriptionHtml || 'N/A',
      notes: "From 'Body (HTML)' column. H1 tags will be converted to H2.",
    },
    { label: 'Vendor', value: product.vendor, notes: "From 'Vendor' column" },
    { label: 'Product Type', value: product.productType, notes: "From 'Tags' column (3rd tag)" },
    {
      label: 'Collection',
      value: product.category,
      notes: "From 'Category' column. Will be linked to a collection with this title.",
    },
    {
      label: 'Tags',
      value: 'N/A',
      notes: "'Clearance' tag added if filename contains 'clearance'",
    },

    // Variant Level
    { label: 'Variant SKU', value: product.sku, notes: "From 'SKU' column" },
    {
      label: 'Variant Image',
      value: product.mediaUrl,
      notes: "From 'Variant Image' column. Will be assigned to this variant.",
    },
    {
      label: 'Variant Price',
      value: `$${product.price?.toFixed(2)}`,
      notes: "From 'Price' column",
    },
    {
      label: 'Variant Compare At Price',
      value: product.compareAtPrice ? `$${product.compareAtPrice.toFixed(2)}` : 'N/A',
      notes: "From 'Compare At Price' column",
    },
    {
      label: 'Variant Cost',
      value: product.costPerItem ? `$${product.costPerItem.toFixed(2) ?? 'N/A'}` : 'N/A',
      notes: "From 'Cost Per Item' column",
    },
    {
      label: 'Variant Barcode (GTIN)',
      value: product.barcode || 'N/A',
      notes: "From 'Variant Barcode' column",
    },
    {
      label: 'Variant Inventory',
      value: product.inventory,
      notes: "From 'Variant Inventory Qty'. Will be set at 'Gamma Warehouse' location.",
    },

    // Options
    {
      label: 'Option 1',
      value: product.option1Name ? `${product.option1Name}: ${product.option1Value}` : 'N/A',
      notes: "From 'Option1 Name' and 'Option1 Value'",
    },
    {
      label: 'Option 2',
      value: product.option2Name ? `${product.option2Name}: ${product.option2Value}` : 'N/A',
      notes: "From 'Option2 Name' and 'Option2 Value'",
    },
    {
      label: 'Option 3',
      value: product.option3Name ? `${product.option3Name}: ${product.option3Value}` : 'N/A',
      notes: "From 'Option3 Name' and 'Option3 Value'",
    },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7">
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          View Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Product Creation Preview</DialogTitle>
          <DialogDescription>
            This is the data that will be sent to Shopify to create the new product variant with
            SKU: <span className="font-bold text-foreground">{product.sku}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Shopify Field</TableHead>
                <TableHead>Value from FTP File</TableHead>
                <TableHead>Notes / Source Column</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataMap.map(({ label, value, notes }) => (
                <TableRow key={label}>
                  <TableCell className="font-medium">{label}</TableCell>
                  <TableCell>
                    {typeof value === 'string' && value.startsWith('http') ? (
                      <a
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block max-w-xs truncate text-primary underline hover:text-primary/80"
                      >
                        {value}
                      </a>
                    ) : (
                      <span className="truncate">{value ?? 'N/A'}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{notes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const gToLbs = (grams: number | null | undefined): string => {
  if (grams === null || grams === undefined) return 'N/A';
  const lbs = grams * 0.00220462;
  return `${lbs.toFixed(2)} lbs`;
};

const ProductDetails = ({ product }: { product: Product | null }) => {
  if (!product) return null;
  return (
    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <DollarSign className="h-3.5 w-3.5" /> Price:{' '}
        <span className="font-medium text-foreground">${product.price.toFixed(2)}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <List className="h-3.5 w-3.5" /> Stock:{' '}
        <span className="font-medium text-foreground">{product.inventory ?? 'N/A'}</span>
      </span>
      <span className="flex items-center gap-1.5" title={product.locationIds?.join(', ')}>
        <MapPin className="h-3.5 w-3.5" /> Locs: {product.locationIds?.length || 0}
        {product.locationIds?.includes('gid://shopify/Location/86376317245') && (
          <span className="ml-1 font-bold text-blue-500">(Garage)</span>
        )}
      </span>
    </div>
  );
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

const MismatchIcons = ({ mismatches }: { mismatches: MismatchDetail[] }) => {
  const fields = Array.from(new Set(mismatches.map(m => m.field)));
  return (
    <div className="flex items-center gap-1">
      {fields.slice(0, 3).map(f => (
        <AlertTriangle key={f} className="h-4 w-4 text-yellow-500" />
      ))}
      {fields.length > 3 && <span className="text-xs text-muted-foreground">+{fields.length - 3}</span>}
    </div>
  );
};

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
    allGroupedByHandle,
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
  // We keep selection state here because it's specific to the current view/page interactions
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
    setIsAutoCreating // Exposed for effects if needed
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
  const handleSelectHandle = (handle: string, checked: boolean) => {
    const newSelected = new Set(selectedHandles);
    if (checked) newSelected.add(handle);
    else newSelected.delete(handle);
    setSelectedHandles(newSelected);
  };

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


  // Auto Run Logic (Implemented in Component as it requires iterating view data)
  const processingRef = useRef(false);

  useEffect(() => {
    if (isAutoRunning && !isFixing && !processingRef.current) {
      // Find next item on current page or filtered list
      const itemToFix = filteredData.find(item =>
        item.status === 'mismatched' && item.mismatches.length > 0
      );

      if (itemToFix) {
        processingRef.current = true;
        // Fix all fixable mismatches for this item
        const fixableTypes = itemToFix.mismatches
          .map(m => m.field); // All remaining types are fixable or handled


        if (fixableTypes.length > 0) {
          handleBulkFix(new Set([
            itemToFix.shopifyProducts[0]?.handle || itemToFix.sku // Using handle logic
          ]), fixableTypes); // Pass handle set to bulk fix or single? 
          // handleBulkFix handles Sets of handles.
          // Ideally we call handleFixSingleMismatch for atomic updates but bulk is fine too.
          // Wait, handleBulkFix is async wrapped in startTransition.
          // We need to know when it finishes to process next.
          // `isFixing` becomes true.
          // So we just trigger it.
          // `handleBulkFix` in hook takes (targetHandles, types).
          // Logic to extract handle:
          const h = itemToFix.shopifyProducts[0]?.handle || itemToFix.csvProducts[0]?.handle || `no-handle-${itemToFix.sku}`;

          // Reuse hook function but we need to ensure it uses the handle correctly
          // handleBulkFix uses reportData, so passing handle is enough.
          // But wait, `useAuditActions` `handleBulkFix` implementation filters by handle.

          // Actually `handleBulkFix` is perfect.
        } else {
          // Skip if not fixable? Should not happen due to filter above.
          processingRef.current = false;
        }
      } else {
        // No more items
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
        item.status === 'missing_in_shopify' // && !createdProductHandles.has(handle) - filteredData already excludes
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
  const startAutoTagUpdate = () => setIsAutoUpdatingTags(true);
  const stopAutoTagUpdate = () => setIsAutoUpdatingTags(false);
  const confirmAutoTagUpdate = (tag: string) => {
    setShowAutoTagDialog(false);
    // Logic for massive auto update... 
    // This was simpler in original: just call bulkUpdateTags for all filteredData?
    // Let's implement simpler version: pass all handles
    // handleUpdateTags(tag, reportData...);
    // For now, let's just use `handleUpdateTags` which takes items.
    // We can pass `filteredData` (respecting current filters)
    handleUpdateTags(tag, filteredData);
  };


  // Helpers for Media Manager
  const editingMissingMediaVariants = editingMissingMedia
    ? groupedByHandle[editingMissingMedia]?.map(i => i.csvProducts[0]).filter(Boolean) || []
    : [];



  const handleOpenMissingVariantMediaManager = (items: AuditResult[]) => {
    if (items.length === 0) return;
    const parentId = items[0].shopifyProducts[0]?.id; // Assuming valid parent
    if (parentId) {
      setEditingMissingVariantMedia({ items, parentProductId: parentId });
    }
  };

  const memoizedMissingVariants = useMemo(() => {
    if (!editingMissingVariantMedia) return [];
    return editingMissingVariantMedia.items
      .map((i) => i.csvProducts[0])
      .filter((p): p is Product => !!p);
  }, [editingMissingVariantMedia]);


  const renderRegularReport = () => (
    <Accordion type="single" collapsible className="w-full">
      {paginatedHandleKeys.map((handle) => {
        const items = groupedByHandle[handle];
        const productTitle =
          items[0].csvProducts[0]?.name || items[0].shopifyProducts[0]?.name || handle;
        const hasMismatch = items.some((i) => i.status === 'mismatched' && i.mismatches.length > 0);
        const isMissing = items.every((i) => i.status === 'missing_in_shopify');
        const notInCsv = items.every((i) => i.status === 'not_in_csv');

        const allMismatches = items.flatMap((i) => i.mismatches);

        const overallStatus: AuditStatus | 'matched' = hasMismatch
          ? 'mismatched'
          : isMissing
            ? 'missing_in_shopify'
            : notInCsv
              ? 'not_in_csv'
              : 'matched';

        if (overallStatus === 'matched') {
          return null;
        }

        const config = statusConfig[overallStatus];

        const allVariantsForHandleInShopify = data.filter(
          (d) => d.shopifyProducts[0]?.handle === handle
        );
        const isOnlyVariantNotInCsv =
          notInCsv && allVariantsForHandleInShopify.length === items.length;

        const productId = items[0].shopifyProducts[0]?.id;
        const imageCount = productId ? imageCounts[productId] : undefined;
        const isLoadingImages = productId ? loadingImageCounts.has(productId) : false;
        const canHaveUnlinkedImages = imageCount !== undefined && items.length < imageCount;

        const isMissingProductCase =
          isMissing && items.every((i) => i.mismatches.some((m) => m.missingType === 'product'));
        const isMissingVariantCase = isMissing && !isMissingProductCase;

        return (
          <AccordionItem value={handle} key={handle} className="border-b last:border-b-0">
            <AccordionHeader className="flex items-center p-0">
              {(filter === 'mismatched' ||
                (filter === 'missing_in_shopify' && isMissingProductCase) ||
                filter === 'all') && (
                  <div className="p-3 pl-4">
                    <Checkbox
                      checked={selectedHandles.has(handle)}
                      onCheckedChange={(checked) => handleSelectHandle(handle, !!checked)}
                      aria-label={`Select product ${handle} `}
                      disabled={isFixing || isAutoRunning || isAutoCreating || isMissingVariantCase}
                    />
                  </div>
                )}
              <AccordionTrigger
                className="flex-grow p-3 text-left"
                disabled={isFixing || isAutoRunning || isAutoCreating}
              >
                <div className="flex flex-grow items-center gap-4">
                  <config.icon
                    className={`h - 5 w - 5 shrink - 0 ${overallStatus === 'mismatched'
                      ? 'text-yellow-500'
                      : overallStatus === 'missing_in_shopify'
                        ? 'text-red-500'
                        : 'text-blue-500'
                      } `}
                  />
                  <div className="flex-grow text-left">
                    <p className="font-semibold">{productTitle}</p>
                    <p className="text-sm text-muted-foreground">{handle}</p>
                  </div>
                </div>
              </AccordionTrigger>
              <div className="flex items-center gap-2 p-3">
                {hasMismatch && <MismatchIcons mismatches={allMismatches} />}
                {canHaveUnlinkedImages && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => e.stopPropagation()}
                        disabled={isFixing || isAutoRunning || isAutoCreating}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Unlinked ({imageCount! - items.length})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Unlinked Images?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This product has {imageCount} images but only {items.length} variants
                          (SKUs). This action will permanently delete the{' '}
                          {imageCount! - items.length} unlinked images from Shopify. This cannot be
                          undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteUnlinked(productId!);
                          }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Yes, Delete Images
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {items.some((i) => i.status === 'mismatched' && i.mismatches.length > 0) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        disabled={isFixing || isAutoRunning || isAutoCreating}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Bot className="mr-2 h-4 w-4" />
                        Fix Selected
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBulkFix(new Set([handle]));
                        }}
                      >
                        Fix All Mismatches
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Fix Specific Field</DropdownMenuLabel>
                      {MISMATCH_FILTER_TYPES.filter(
                        (t) => t !== 'duplicate_in_shopify' && t !== 'heavy_product_flag'
                      ).map((type) => (
                        <DropdownMenuItem
                          key={type}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBulkFix(new Set([handle]), [type]);
                          }}
                        >
                          Fix {type.replace(/_/g, ' ')} Only
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem
                        key="incorrect_template_suffix"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBulkFix(new Set([handle]), ['incorrect_template_suffix']);
                        }}
                      >
                        Fix Incorrect Template Suffix Only
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setFixDialogHandles(new Set([handle]));
                          setShowFixDialog(true);
                        }}
                      >
                        Custom Fix...
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {isMissingProductCase && (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsCreated(handle);
                            }}
                            disabled={isFixing || isAutoRunning || isAutoCreating}
                            aria-label="Mark as created"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Mark as created (hide from report)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreate(items[0]);
                      }}
                      disabled={isFixing || isAutoRunning || isAutoCreating}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Create Product
                    </Button>
                  </>
                )}
                {isMissingVariantCase && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenMissingVariantMediaManager(items);
                      }}
                    >
                      <ImageIcon className="mr-2 h-4 w-4" /> Manage Media
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBulkCreateVariants(items);
                      }}
                      disabled={isFixing}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" /> Add All {items.length} Variants
                    </Button>
                  </>
                )}
                <Badge variant="outline" className="w-[80px] justify-center">
                  {items.length} SKU{items.length > 1 ? 's' : ''}
                </Badge>

                {productId && !isMissingVariantCase && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-[180px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingMediaFor(productId);
                    }}
                    disabled={isAutoRunning || isAutoCreating}
                  >
                    {isLoadingImages ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ImageIcon className="mr-2 h-4 w-4" />
                    )}
                    Manage Media{' '}
                    {imageCount !== undefined && (
                      <span
                        className={cn(imageCount > items.length ? 'font-bold text-yellow-400' : '')}
                      >
                        ({imageCount})
                      </span>
                    )}
                  </Button>
                )}
                {isMissingProductCase && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-[160px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingMissingMedia(handle);
                    }}
                    disabled={isAutoRunning || isAutoCreating}
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Manage Media
                  </Button>
                )}
              </div>
            </AccordionHeader>

            <AccordionContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">SKU</TableHead>
                    <TableHead className="w-[180px]">Status</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="w-[240px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => {
                    // We use 'let' instead of 'const' to allow fallback assignment
                    let itemConfig = statusConfig[item.status as Exclude<AuditStatus, 'matched'>];

                    // If status is 'matched' (or unknown), itemConfig will be undefined.
                    // We provide a fallback to prevent the crash.
                    if (!itemConfig) {
                      itemConfig = {
                        icon: CheckCircle2,
                        text: 'Matched',
                        badgeClass:
                          'bg-green-100 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
                      };
                    }
                    const productForDetails = item.csvProducts[0] || item.shopifyProducts[0];

                    if (item.status === 'mismatched' && item.mismatches.length === 0) return null;
                    if (
                      item.status === 'missing_in_shopify' &&
                      !item.mismatches.some((m) => m.field === 'missing_in_shopify')
                    )
                      return null;

                    return (
                      <TableRow
                        key={item.sku}
                        className={
                          item.status === 'mismatched'
                            ? 'bg-yellow-50/50 dark:bg-yellow-900/10'
                            : item.status === 'missing_in_shopify'
                              ? 'bg-red-50/50 dark:bg-red-900/10'
                              : item.status === 'not_in_csv'
                                ? 'bg-blue-50/50 dark:bg-blue-900/10'
                                : ''
                        }
                      >
                        <TableCell className="font-medium">{item.sku}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`whitespace - nowrap ${itemConfig.badgeClass} `}
                          >
                            <itemConfig.icon className="mr-1.5 h-3.5 w-3.5" />
                            {itemConfig.text}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            {item.status === 'mismatched' && item.mismatches.length > 0 && (
                              <MismatchDetails
                                sku={item.sku}
                                mismatches={item.mismatches}
                                onFix={(fixType) => handleFixSingleMismatch(item, fixType)}
                                onMarkAsFixed={(fixType) => handleMarkAsFixed(item.sku, fixType)}
                                disabled={isFixing || isAutoRunning || isAutoCreating}
                              />
                            )}
                            {item.status === 'missing_in_shopify' && (
                              <p className="text-sm text-muted-foreground">
                                This SKU is a{' '}
                                <span className="font-semibold text-foreground">
                                  {item.mismatches.find((m) => m.field === 'missing_in_shopify')
                                    ?.missingType === 'product'
                                    ? 'Missing Product'
                                    : 'Missing Variant'}
                                </span>
                                .
                                {item.mismatches.some((m) => m.field === 'heavy_product_flag') && (
                                  <span className="mt-1 block">
                                    {' '}
                                    <AlertTriangle className="mr-1 inline-block h-4 w-4 text-yellow-500" />{' '}
                                    This is a heavy product.
                                  </span>
                                )}
                              </p>
                            )}
                            {item.status === 'not_in_csv' && (
                              <p className="text-sm text-muted-foreground">
                                This product exists in Shopify but not in your CSV file.
                              </p>
                            )}
                            <ProductDetails product={productForDetails} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {item.status === 'missing_in_shopify' && item.csvProducts[0] && (
                              <>
                                <MissingProductDetailsDialog product={item.csvProducts[0]} />
                              </>
                            )}

                            {item.status === 'not_in_csv' && !isOnlyVariantNotInCsv && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={isFixing || isAutoRunning || isAutoCreating}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete Variant
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this variant?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete the variant with SKU &quot;{item.sku}&quot;
                                      from Shopify. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteVariant(item)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Yes, delete variant
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {notInCsv && isOnlyVariantNotInCsv && (
                    <TableRow>
                      <TableCell colSpan={4} className="p-2 text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={isFixing || isAutoRunning || isAutoCreating}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete Entire Product
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this entire product?</AlertDialogTitle>
                              <AlertDialogDescription>
                                All variants for &quot;{productTitle}&quot; are not in the CSV. This will
                                permanently delete the entire product and its {items.length}{' '}
                                variants from Shopify. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteProduct(items[0])}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Yes, delete product
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>

  );

  const hasSelectionWithUnlinkedImages = selectedHandles.size > 0 && Array.from(selectedHandles).some(h => {
    const items = groupedByHandle[h];
    const pid = items?.[0]?.shopifyProducts[0]?.id;
    const count = pid ? imageCounts[pid] : undefined;
    return count !== undefined && items && count > items.length;
  });


  const hasSelectionWithMismatches = selectedHandles.size > 0 && Array.from(selectedHandles).some(h =>
    groupedByHandle[h]?.some(i => i.status === 'mismatched' && i.mismatches.length > 0)
  );

  return (
    <>
      <Card className="w-full">
        <AuditStats
          reportSummary={currentSummary} // Use derived summary
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
            handleBulkFix={(h, t) => handleBulkFix(h || selectedHandles, t)}
            handleBulkDeleteUnlinked={() => {
              const ids = Array.from(selectedHandles).map(h => groupedByHandle[h][0].shopifyProducts[0].id).filter(Boolean);
              handleBulkDeleteUnlinked(ids);
            }}
            handleBulkCreate={() => handleBulkCreate(selectedHandles)}
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
            filteredGroupedByHandle={groupedByHandle} // filteredData is flat, groupedByHandle is derived from it
            allGroupedByHandle={allGroupedByHandle}
            groupedBySku={groupedBySku}
            filter={filter}
            selectedHandles={selectedHandles}
            data={reportData} // needed for duplicates lookup or internal logic
            imageCounts={imageCounts}
            loadingImageCounts={loadingImageCounts}
            isFixing={isFixing}
            isAutoRunning={isAutoRunning}
            isAutoCreating={isAutoCreating}

            handleSelectHandle={handleSelectHandle}
            handleDeleteUnlinked={handleDeleteUnlinked}
            handleBulkFix={(h, t) => handleBulkFix(h, t)}
            handleMarkAsCreated={handleMarkAsCreated}
            handleCreate={handleCreate}
            handleOpenMissingVariantMediaManager={handleOpenMissingVariantMediaManager}
            handleBulkCreateVariants={handleBulkCreateVariants}
            setEditingMediaFor={setEditingMediaFor}
            setEditingMissingMedia={setEditingMissingMedia}
            handleFixSingleMismatch={handleFixSingleMismatch}
            handleMarkAsFixed={(sku, type) => handleMarkAsFixed(sku, type)}
            handleDeleteVariant={handleDeleteVariant}
            handleDeleteProduct={handleDeleteProduct}

            statusConfig={statusConfig}
            MISMATCH_FILTER_TYPES={MISMATCH_FILTER_TYPES}
            setFixDialogHandles={setFixDialogHandles}
            setShowFixDialog={setShowFixDialog}
            onSelectAllPage={toggleSelectAllPage}
            isAllPageSelected={isAllOnPageSelected}
          />

          {/* Pagination Controls Reuse from AuditFilters or Table? 
                Actually AuditFilters has the top controls.
                Bottom pagination is good to have.
                Let's add it here or inside AuditTable.
                AuditTable usually has rows. 
                Let's add pagination below AuditTable.
            */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-4">
              <div className="flex items-center gap-2 text-sm">
                {/* Reuse handlesPerPage state */}
                <span className="text-muted-foreground">Items per page</span>
                {/* Simplified Select for brevity */}
                {/* ... Use standard Select ... */}
                {/* For now, just Next/Prev buttons */}
              </div>
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
                // handle saving pre-creation media logic? 
                // Original: handleSavePreCreationMedia. 
                // Likely updates local state or something.
                // For now, close logic.
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
              onSaveMissingVariant={(result) => { // handleSaveMissingVariantMedia
                setEditingMissingVariantMedia(null);
                onRefresh(); // Refresh to show changes?
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <UpdateTagsDialog
        isOpen={showUpdateTagsDialog}
        onClose={() => setShowUpdateTagsDialog(false)}
        onConfirm={(tag) => handleUpdateTags(tag, Array.from(selectedHandles).map(h => groupedByHandle[h][0]))} // Map handles to items
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
