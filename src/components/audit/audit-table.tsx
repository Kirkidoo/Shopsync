import { Accordion, AccordionItem, AccordionHeader, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { MismatchDetails } from './mismatch-details';
import { ProductDetails } from './product-details';
import { MissingProductDetailsDialog } from './missing-product-details-dialog';
import { AuditResult, Product, AuditStatus, MismatchDetail } from '@/lib/types';
import { CheckCircle2, AlertTriangle, PlusCircle, XCircle, Copy, Link, Trash2, Bot, Check, ChevronDown, ImageIcon, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DuplicateAuditTable } from './duplicate-audit-table';
import { CsvShopifyComparison } from './csv-shopify-comparison';

interface AuditTableProps {
    paginatedHandleKeys: string[];
    filteredGroupedByHandle: Record<string, AuditResult[]>;
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
    paginatedHandleKeys, filteredGroupedByHandle, groupedBySku, filter, selectedHandles, data,
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
                    if (!items) return null;

                    const productTitle =
                        items[0].csvProducts[0]?.name || items[0].shopifyProducts[0]?.name || handle;
                    const hasMismatch = items.some((i) => i.status === 'mismatched' && i.mismatches.length > 0);
                    const isMissing = items.every((i) => i.status === 'missing_in_shopify');
                    const notInCsv = items.every((i) => i.status === 'not_in_csv');

                    const overallStatus: AuditStatus | 'matched' = hasMismatch
                        ? 'mismatched'
                        : isMissing
                            ? 'missing_in_shopify'
                            : notInCsv
                                ? 'not_in_csv'
                                : 'matched';

                    if (overallStatus === 'matched' && filter !== 'all') {
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
                                            className={cn("h-5 w-5 shrink-0",
                                                overallStatus === 'mismatched' ? 'text-yellow-500' :
                                                    overallStatus === 'missing_in_shopify' ? 'text-red-500' : 'text-blue-500'
                                            )}
                                        />
                                        <div className="flex-grow text-left">
                                            <p className="font-semibold">{productTitle}</p>
                                            <p className="text-sm text-muted-foreground">{handle}</p>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <div className="flex items-center gap-2 p-3">
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
                                        {items.map((item) => {
                                            let itemConfig = statusConfig[item.status as Exclude<AuditStatus, 'matched'>];

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
                                                            className={cn("whitespace-nowrap", itemConfig.badgeClass)}
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
                                                            {item.csvProducts[0] && (
                                                                <CsvShopifyComparison
                                                                    csvProduct={item.csvProducts[0]}
                                                                    shopifyProduct={item.shopifyProducts[0]}
                                                                />
                                                            )}
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
        </div>
    );
}
