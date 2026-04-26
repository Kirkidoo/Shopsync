import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { MismatchDetails } from './mismatch-details';
import { MissingProductDetailsDialog } from './missing-product-details-dialog';
import { AuditResult, Product, AuditStatus, MismatchDetail } from '@/lib/types';
import { CheckCircle2, AlertTriangle, PlusCircle, XCircle, Copy, Link, Trash2, Bot, Check, ChevronDown, ImageIcon, Loader2, X, CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuditUIStore, useAuditDataStore } from '@/store/audit-store';
import { useAuditActions } from '@/hooks/use-audit-actions';

interface AuditTableItemProps {
    handle: string;
    items: AuditResult[];
    isOnlyVariantNotInCsv: boolean;
    imageCount?: number;
    isLoadingImages: boolean;
    statusConfig: any;
    MISMATCH_FILTER_TYPES: MismatchDetail['field'][];
    fileName: string;
    onRefresh: () => void;
}

const AuditTableItem = React.memo(function AuditTableItem({
    handle, items, isOnlyVariantNotInCsv,
    imageCount, isLoadingImages,
    statusConfig, MISMATCH_FILTER_TYPES,
    fileName, onRefresh
}: AuditTableItemProps) {
    // UI Store Selectors
    const filter = useAuditUIStore((state) => state.filter);
    const isSelected = useAuditUIStore((state) => state.selectedHandles).has(handle);
    const toggleHandleSelection = useAuditUIStore((state) => state.toggleHandleSelection);
    const isFixing = useAuditUIStore((state) => state.isFixing);
    const isAutoRunning = useAuditUIStore((state) => state.isAutoRunning);
    const isAutoCreating = useAuditUIStore((state) => state.isAutoCreating);
    const setShowFixDialog = useAuditUIStore((state) => state.setShowFixDialog);
    const setEditingMediaFor = useAuditUIStore((state) => state.setEditingMediaFor);
    const setEditingMissingMedia = useAuditUIStore((state) => state.setEditingMissingMedia);
    const setEditingMissingVariantMedia = useAuditUIStore((state) => state.setEditingMissingVariantMedia);

    // Actions Hook
    const {
        handleDeleteUnlinked,
        handleBulkFix,
        handleMarkAsCreated,
        handleCreate,
        handleBulkCreateVariants,
        handleFixSingleMismatch,
        handleMarkAsFixed,
        handleDeleteVariant,
        handleDeleteProduct,
    } = useAuditActions({ fileName, onRefresh });

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
    const productId = items[0].shopifyProducts[0]?.id;
    const canHaveUnlinkedImages = imageCount !== undefined && items.length < imageCount;

    const isMissingProductCase =
        isMissing && items.every((i) => i.mismatches.some((m) => m.missingType === 'product'));
    const isMissingVariantCase = isMissing && !isMissingProductCase;

    const getUniqueMismatches = () => {
        const mismatchNames = new Set<string>();
        items.forEach((item) => {
            if (item.status === 'mismatched') {
                item.mismatches.forEach((m) => mismatchNames.add(m.field.replace(/_/g, ' ')));
            }
        });
        return Array.from(mismatchNames);
    };
    const uniqueMismatchFields = getUniqueMismatches();

    return (
        <div className="flex flex-col w-full">
            {/* Parent Level (Product Context) */}
            <div className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                overallStatus === 'mismatched' ? 'bg-yellow-50/40 border-yellow-200/60 dark:bg-yellow-900/20 dark:border-yellow-900/50' :
                    overallStatus === 'missing_in_shopify' ? 'bg-red-50/40 border-red-200/60 dark:bg-red-900/20 dark:border-red-900/50' :
                        overallStatus === 'not_in_csv' ? 'bg-blue-50/40 border-blue-200/60 dark:bg-blue-900/20 dark:border-blue-900/50' :
                            'bg-muted/10 border-muted'
            )}>
                <div className="flex items-center gap-4 flex-grow overflow-hidden pr-4">
                    {(filter === 'mismatched' ||
                        (filter === 'missing_in_shopify' && isMissingProductCase) ||
                        filter === 'all') && (
                            <div className="shrink-0">
                                <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleHandleSelection(handle)}
                                    aria-label={`Select product ${handle} `}
                                    disabled={isFixing || isAutoRunning || isAutoCreating || isMissingVariantCase}
                                />
                            </div>
                        )}
                    <config.icon
                        className={cn("h-5 w-5 shrink-0",
                            overallStatus === 'mismatched' ? 'text-yellow-600 dark:text-yellow-500' :
                                overallStatus === 'missing_in_shopify' ? 'text-red-500' : 'text-blue-500'
                        )}
                    />
                    <div className="flex items-center gap-3 shrink-0 truncate">
                        <span className="font-semibold text-foreground truncate">{productTitle}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {uniqueMismatchFields.map(field => (
                            <Badge key={field} variant="secondary" className="text-[10px] uppercase font-semibold text-muted-foreground bg-muted/50 border-transparent hover:bg-muted/50">
                                {field}
                            </Badge>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {canHaveUnlinkedImages && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="destructive"
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
                                        onClick={() => handleDeleteUnlinked(productId!)}
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
                                    variant="default"
                                    disabled={isFixing || isAutoRunning || isAutoCreating}
                                >
                                    <Bot className="mr-2 h-4 w-4" />
                                    Fix Selected
                                    <ChevronDown className="ml-2 h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleBulkFix(new Set([handle]))}>
                                    Fix All Mismatches
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Fix Specific Field</DropdownMenuLabel>
                                {MISMATCH_FILTER_TYPES.filter(
                                    (t) => t !== 'duplicate_in_shopify' && t !== 'heavy_product_flag'
                                ).map((type) => (
                                    <DropdownMenuItem
                                        key={type}
                                        onClick={() => handleBulkFix(new Set([handle]), [type])}
                                    >
                                        Fix {type.replace(/_/g, ' ')} Only
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setShowFixDialog(true, new Set([handle]))}>
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
                                            onClick={() => handleMarkAsCreated(handle)}
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
                                onClick={() => handleCreate(items[0])}
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
                                onClick={() => setEditingMissingVariantMedia({ parentProductId: items[0].shopifyProducts[0]?.id || '', items })}
                            >
                                <ImageIcon className="mr-2 h-4 w-4" /> Manage Media
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => handleBulkCreateVariants(items)}
                                disabled={isFixing}
                            >
                                <PlusCircle className="mr-2 h-4 w-4" /> Add All {items.length} Variants
                            </Button>
                        </>
                    )}

                    <Badge variant="outline" className="justify-center shrink-0 ml-1">
                        {items.length} SKU{items.length > 1 ? 's' : ''}
                    </Badge>

                    {productId && !isMissingVariantCase && (
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingMediaFor(productId)}
                            disabled={isAutoRunning || isAutoCreating}
                        >
                            {isLoadingImages ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <ImageIcon className="mr-2 h-4 w-4" />
                            )}
                            Media{' '}
                            {imageCount !== undefined && (
                                <span className={cn("ml-1", imageCount > items.length ? 'font-bold text-yellow-500' : '')}>
                                    ({imageCount})
                                </span>
                            )}
                        </Button>
                    )}
                    {isMissingProductCase && (
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingMissingMedia(handle)}
                            disabled={isAutoRunning || isAutoCreating}
                        >
                            <ImageIcon className="mr-2 h-4 w-4" />
                            Media
                        </Button>
                    )}
                </div>
            </div>

            {/* Child Level (Variant/SKU Details) */}
            <div className="flex flex-col gap-3 mt-4 ml-8 pl-6 border-l-2 border-muted/50">
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

                    if (item.status === 'mismatched' && item.mismatches.length === 0) return null;
                    if (
                        item.status === 'missing_in_shopify' &&
                        !item.mismatches.some((m) => m.field === 'missing_in_shopify')
                    )
                        return null;

                    return (
                        <div key={item.sku} className="flex flex-col gap-1.5 p-3 rounded-md bg-card border shadow-sm w-full transition-all hover:border-yellow-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <CornerDownRight className="h-4 w-4 text-muted-foreground/50" />
                                    <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                                        SKU: <span className="text-foreground tracking-tight font-mono">{item.sku}</span>
                                    </span>
                                    <Badge
                                        variant="outline"
                                        className={cn("whitespace-nowrap px-2 py-0 h-5 text-[10px]", itemConfig.badgeClass)}
                                    >
                                        <itemConfig.icon className="mr-1 h-3 w-3" />
                                        {itemConfig.text}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-3">
                                    {item.status === 'missing_in_shopify' && item.csvProducts[0] && (
                                        <MissingProductDetailsDialog product={item.csvProducts[0]} />
                                    )}

                                    {item.status === 'not_in_csv' && !isOnlyVariantNotInCsv && (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
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
                            </div>

                            <div className="pl-7 w-full flex flex-col gap-2">
                                {item.status === 'mismatched' && item.mismatches.length > 0 && (
                                    <MismatchDetails
                                        sku={item.sku}
                                        mismatches={item.mismatches}
                                        onFix={(fixType) => handleFixSingleMismatch(item, fixType)}
                                        onMarkAsFixed={(fixType) => handleMarkAsFixed(item.sku, fixType)}
                                        disabled={isFixing || isAutoRunning || isAutoCreating}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}

                {notInCsv && isOnlyVariantNotInCsv && (
                    <div className="flex justify-end mt-1 pr-1">
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
                    </div>
                )}
            </div>
        </div>
    );
});

export { AuditTableItem };
