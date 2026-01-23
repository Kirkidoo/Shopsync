import { startTransition, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { AuditResult, Product, MismatchDetail } from '@/lib/types';
import {
    fixMultipleMismatches,
    createInShopify,
    createMultipleInShopify,
    createMultipleVariantsForProduct,
    deleteFromShopify,
    deleteVariantFromShopify,
    deleteUnlinkedImages,
    deleteUnlinkedImagesForMultipleProducts,
    bulkUpdateTags,
} from '@/app/actions';
import {
    markMismatchAsFixed,
    markProductAsCreated,
} from '@/lib/utils';
import { getHandle } from '@/components/audit/audit-utils';
import { logger } from '@/lib/logger';

interface UseAuditActionsProps {
    reportData: AuditResult[];
    setReportData: React.Dispatch<React.SetStateAction<AuditResult[]>>;
    fileName: string;
    onRefresh: () => void;
    setFixedMismatches: React.Dispatch<React.SetStateAction<Set<string>>>;
    setCreatedProductHandles: React.Dispatch<React.SetStateAction<Set<string>>>;
    setUpdatedProductHandles: React.Dispatch<React.SetStateAction<Set<string>>>;
    setSelectedHandles: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function useAuditActions({
    reportData,
    setReportData,
    fileName,
    onRefresh,
    setFixedMismatches,
    setCreatedProductHandles,
    setUpdatedProductHandles,
    setSelectedHandles,
}: UseAuditActionsProps) {
    const { toast } = useToast();
    const [isFixing, setIsFixing] = useState(false);
    const [isAutoRunning, setIsAutoRunning] = useState(false);
    const [isAutoCreating, setIsAutoCreating] = useState(false);

    // --- Helpers ---

    const handleActionStart = useCallback((actionName: string) => {
        setIsFixing(true);
    }, []);

    const handleActionEnd = useCallback(() => {
        setIsFixing(false);
    }, []);

    // --- Mismatch Fixes ---

    const handleFixSingleMismatch = useCallback((item: AuditResult, fixType: MismatchDetail['field']) => {
        if (
            fixType === 'duplicate_in_shopify' ||
            fixType === 'heavy_product_flag'
        ) {
            toast({ title: "Info", description: 'This issue cannot be fixed automatically.' });
            return;
        }

        handleActionStart('Fixing mismatch...');
        startTransition(async () => {
            try {
                const result = await fixMultipleMismatches([item], [fixType]);
                if (result.success) {
                    toast({ title: "Success", description: result.message });
                    setFixedMismatches((prev) => {
                        const next = new Set(prev);
                        const key = `${item.sku}-${fixType}`;
                        next.add(key);
                        // Persist
                        markMismatchAsFixed(item.sku, fixType);
                        return next;
                    });
                } else {
                    toast({ title: "Error", description: result.message, variant: "destructive" });
                }
            } catch (error) {
                toast({ title: "Error", description: 'An unexpected error occurred.', variant: "destructive" });
                logger.error(error as any);
            } finally {
                handleActionEnd();
            }
        });
    }, [handleActionStart, handleActionEnd, setFixedMismatches, toast]);

    const handleMarkAsFixed = useCallback((sku: string, fixType: MismatchDetail['field']) => {
        setFixedMismatches((prev) => {
            const next = new Set(prev);
            const key = `${sku}-${fixType}`;
            next.add(key);
            markMismatchAsFixed(sku, fixType);
            return next;
        });
        toast({ title: "Success", description: `Marked ${fixType} as fixed for ${sku}` });
    }, [setFixedMismatches, toast]);

    const handleBulkFix = useCallback((
        targetHandles?: Set<string>,
        targetTypes?: MismatchDetail['field'][]
    ) => {
        handleActionStart('Running bulk fix...');
        startTransition(async () => {
            try {
                let itemsToFix = reportData.filter(
                    (item) => item.status === 'mismatched' && item.mismatches.length > 0
                );

                if (targetHandles) {
                    itemsToFix = itemsToFix.filter((item) => {
                        const handle = getHandle(item);
                        return targetHandles.has(handle);
                    });
                }

                if (itemsToFix.length === 0) {
                    toast({ title: "Info", description: 'No mismatches found to fix based on current selection.' });
                    handleActionEnd();
                    return;
                }

                const result = await fixMultipleMismatches(itemsToFix, targetTypes);

                if (result.success) {
                    toast({ title: "Success", description: result.message });

                    setFixedMismatches((prev) => {
                        const next = new Set(prev);
                        if (result.results) {
                            result.results.forEach((r: any) => {
                                if (r.success) {
                                    const key = `${r.sku}-${r.field}`;
                                    next.add(key);
                                    markMismatchAsFixed(r.sku, r.field);
                                }
                            });
                        }
                        return next;
                    });
                    if (targetHandles) {
                        setSelectedHandles(new Set()); // Clear selection
                    }

                } else {
                    toast({ title: "Error", description: result.message || 'Bulk fix failed.', variant: "destructive" });
                }
            } catch (error) {
                logger.error(error as any);
                toast({ title: "Error", description: 'An error occurred during bulk fix.', variant: "destructive" });
            } finally {
                handleActionEnd();
            }
        });
    }, [reportData, handleActionStart, handleActionEnd, setFixedMismatches, setSelectedHandles, toast]);

    // --- Creation ---

    const handleCreate = useCallback((item: AuditResult) => {
        const missingType = item.mismatches.find((m) => m.field === 'missing_in_shopify')?.missingType;

        if (!missingType) {
            toast({ title: "Error", description: 'Could not determine missing type (product vs variant).', variant: "destructive" });
            return;
        }

        const product = item.csvProducts[0];
        if (!product) return;

        handleActionStart(`Creating ${missingType}...`);
        startTransition(async () => {
            try {
                const handle = getHandle(item);
                const allVariants = reportData
                    .filter(d => getHandle(d) === handle && d.csvProducts.length > 0)
                    .map(d => d.csvProducts[0]);

                const result = await createInShopify(product, allVariants, fileName, missingType);
                if (result.success) {
                    toast({ title: "Success", description: result.message });
                    if (missingType === 'product') {
                        setCreatedProductHandles(prev => {
                            const newSet = new Set(prev);
                            newSet.add(handle);
                            return newSet;
                        });
                        markProductAsCreated(handle);
                    } else {
                        onRefresh();
                    }
                } else {
                    toast({ title: "Error", description: result.message, variant: "destructive" });
                }
            } catch (error) {
                toast({ title: "Error", description: 'Failed to create.', variant: "destructive" });
                logger.error(error as any);
            } finally {
                handleActionEnd();
            }
        });
    }, [reportData, fileName, onRefresh, handleActionStart, handleActionEnd, setCreatedProductHandles, toast]);

    const handleMarkAsCreated = useCallback((handle: string) => {
        setCreatedProductHandles(prev => {
            const next = new Set(prev);
            next.add(handle);
            return next;
        });
        markProductAsCreated(handle);
        toast({ title: "Success", description: `Marked ${handle} as created.` });
    }, [setCreatedProductHandles, toast]);

    const handleBulkCreate = useCallback((specificHandles?: Set<string>) => {
        const handlesToCreate = specificHandles || new Set();
        if (handlesToCreate.size === 0) return;

        handleActionStart(`Creating ${handlesToCreate.size} products...`);
        startTransition(async () => {
            try {
                const itemsToCreate: { product: Product; allVariants: Product[]; missingType: 'product' | 'variant' }[] = [];

                for (const handle of handlesToCreate) {
                    const handleItems = reportData.filter(d => getHandle(d) === handle);
                    if (handleItems.length === 0) continue;

                    const mainItem = handleItems[0];
                    const product = mainItem.csvProducts[0];
                    if (!product) continue;

                    const isMissingProduct = handleItems.every(i => i.mismatches.some(m => m.missingType === 'product'));

                    if (isMissingProduct) {
                        const allVariants = handleItems.map(i => i.csvProducts[0]).filter(Boolean);
                        itemsToCreate.push({
                            product,
                            allVariants,
                            missingType: 'product'
                        });
                    }
                }

                if (itemsToCreate.length === 0) {
                    toast({ title: "Warning", description: "No valid products found to create in selection." });
                    handleActionEnd();
                    return;
                }

                const result = await createMultipleInShopify(itemsToCreate, fileName);

                if (result.success) {
                    toast({ title: "Success", description: result.message });
                    setCreatedProductHandles(prev => {
                        const next = new Set(prev);
                        result.results.forEach((r: any) => {
                            if (r.success && r.handle) {
                                next.add(r.handle);
                                markProductAsCreated(r.handle);
                            }
                        });
                        return next;
                    });
                    setSelectedHandles(new Set());
                } else {
                    toast({ title: "Error", description: result.message, variant: "destructive" });
                }

            } catch (e) {
                logger.error(e as any);
                toast({ title: "Error", description: "Bulk create failed.", variant: "destructive" });
            } finally {
                handleActionEnd();
            }
        });
    }, [reportData, fileName, handleActionStart, handleActionEnd, setCreatedProductHandles, setSelectedHandles, toast]);

    const handleBulkCreateVariants = useCallback((items: AuditResult[]) => {
        handleActionStart("Adding variants...");
        startTransition(async () => {
            try {
                const variants = items.map(i => i.csvProducts[0]).filter(Boolean);
                const result = await createMultipleVariantsForProduct(variants);
                if (result.success) {
                    toast({ title: "Success", description: result.message });
                    onRefresh();
                } else {
                    toast({ title: "Error", description: result.message, variant: "destructive" });
                }
            } catch (e) {
                logger.error(e as any);
                toast({ title: "Error", description: "Failed to add variants.", variant: "destructive" });
            } finally {
                handleActionEnd();
            }
        });
    }, [handleActionStart, handleActionEnd, onRefresh, toast]);

    // --- Deletion ---

    const handleDeleteProduct = useCallback((item: AuditResult, specificProduct?: Product) => {
        const productToDelete = specificProduct || item.shopifyProducts[0];
        if (!productToDelete) return;

        const productId = productToDelete.id;
        if (!productId) return;

        handleActionStart("Deleting product...");
        startTransition(async () => {
            try {
                const result = await deleteFromShopify(productId);
                if (result.success) {
                    toast({ title: "Success", description: result.message });
                    setReportData(prev => prev.filter(d => d.shopifyProducts[0]?.id !== productId));
                } else {
                    toast({ title: "Error", description: result.message, variant: "destructive" });
                }
            } catch (e) {
                console.error(e);
                toast({ title: "Error", description: "Delete failed.", variant: "destructive" });
            } finally {
                handleActionEnd();
            }
        });
    }, [handleActionStart, handleActionEnd, setReportData, toast]);

    const handleDeleteVariant = useCallback((item: AuditResult) => {
        const variant = item.shopifyProducts[0];
        if (!variant) return;

        const productId = variant.id;
        const variantId = variant.variantId;

        if (!productId || !variantId) {
            toast({ title: "Error", description: "Missing ID information for deletion.", variant: "destructive" });
            return;
        }

        handleActionStart("Deleting variant...");
        startTransition(async () => {
            try {
                const result = await deleteVariantFromShopify(productId, variantId);
                if (result.success) {
                    toast({ title: "Success", description: result.message });
                    setReportData(prev => prev.filter(d => d.shopifyProducts[0]?.variantId !== variantId));
                } else {
                    toast({ title: "Error", description: result.message, variant: "destructive" });
                }
            } catch (e) {
                console.error(e);
                toast({ title: "Error", description: "Delete failed.", variant: "destructive" });
            } finally {
                handleActionEnd();
            }
        });
    }, [handleActionStart, handleActionEnd, setReportData, toast]);

    const handleDeleteUnlinked = useCallback((productId: string) => {
        handleActionStart("Deleting unlinked images...");
        startTransition(async () => {
            try {
                const result = await deleteUnlinkedImages(productId);
                if (result.success) {
                    toast({ title: "Success", description: result.message });
                } else {
                    toast({ title: "Error", description: result.message, variant: "destructive" });
                }
            } catch (e) {
                logger.error(e as any);
                toast({ title: "Error", description: "Failed to delete images.", variant: "destructive" });
            } finally {
                handleActionEnd();
            }
        });
    }, [handleActionStart, handleActionEnd, toast]);

    const handleBulkDeleteUnlinked = useCallback((selectedProductIds: string[]) => {
        handleActionStart(`Cleaning images for ${selectedProductIds.length} products...`);
        startTransition(async () => {
            try {
                const result = await deleteUnlinkedImagesForMultipleProducts(selectedProductIds);
                if (result.success) {
                    toast({ title: "Success", description: result.message });
                    setSelectedHandles(new Set());
                } else {
                    toast({ title: "Error", description: result.message, variant: "destructive" });
                }
            } catch (e) {
                logger.error(e as any);
                toast({ title: "Error", description: "Bulk delete images failed.", variant: "destructive" });
            } finally {
                handleActionEnd();
            }
        });
    }, [handleActionStart, handleActionEnd, setSelectedHandles, toast]);

    // --- Tags ---

    const handleUpdateTags = useCallback((customTag: string, selectedItems: AuditResult[]) => {
        handleActionStart("Updating tags...");
        startTransition(async () => {
            try {
                const result = await bulkUpdateTags(selectedItems, customTag);
                if (result.success) {
                    toast({ title: "Success", description: result.message });
                    setUpdatedProductHandles(prev => {
                        const next = new Set(prev);
                        selectedItems.forEach(i => {
                            const h = getHandle(i);
                            next.add(h);
                        });
                        return next;
                    });
                } else {
                    toast({ title: "Error", description: result.message, variant: "destructive" });
                }
            } catch (e) {
                logger.error(e as any);
                toast({ title: "Error", description: "Tag update failed.", variant: "destructive" });
            } finally {
                handleActionEnd();
            }
        });
    }, [handleActionStart, handleActionEnd, setUpdatedProductHandles, toast]);

    // --- Auto Run (Simple Loop) ---

    const startAutoRun = useCallback(() => setIsAutoRunning(true), []);
    const stopAutoRun = useCallback(() => setIsAutoRunning(false), []);
    const startAutoCreate = useCallback(() => setIsAutoCreating(true), []);
    const stopAutoCreate = useCallback(() => setIsAutoCreating(false), []);


    return {
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
        setIsAutoRunning, // exposed for effect
        setIsAutoCreating // exposed for effect
    };
}
