'use server';

import { Product, AuditResult, MismatchDetail } from '@/lib/types';
import {
    updateProduct,
    updateProductVariant,
    inventorySetQuantities,
    addProductTags,
    removeProductTags,
} from '@/lib/shopify';
import { revalidatePath } from 'next/cache';
import { log } from '@/services/logger';
import { logger } from '@/lib/logger';
import { GAMMA_WAREHOUSE_LOCATION_ID } from '@/lib/constants';
import { getErrorMessage } from '@/lib/action-utils';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Internal helper ─────────────────────────────────────────────────

async function _fixSingleMismatch(
    fixType: MismatchDetail['field'],
    csvProduct: Product,
    shopifyProduct: Product,
    targetValue?: string | number | null
): Promise<{ success: boolean; message: string }> {
    logger.info(`Attempting to fix '${fixType}' for SKU: ${csvProduct.sku}`);
    await log('INFO', `Attempting to fix '${fixType}' for SKU: ${csvProduct.sku}`);

    const fixPayload: Product = {
        ...csvProduct,
        id: shopifyProduct.id,
        variantId: shopifyProduct.variantId,
        inventoryItemId: shopifyProduct.inventoryItemId,
        descriptionHtml: shopifyProduct.descriptionHtml,
    };

    try {
        switch (fixType) {
            case 'price':
                if (fixPayload.variantId) {
                    const numericVariantId = parseInt(fixPayload.variantId.split('/').pop() || '0', 10);
                    if (numericVariantId) {
                        await updateProductVariant(numericVariantId, { price: fixPayload.price });
                    }
                }
                break;
            case 'inventory':
                if (fixPayload.inventoryItemId && fixPayload.inventory !== null) {
                    await inventorySetQuantities(
                        fixPayload.inventoryItemId,
                        fixPayload.inventory,
                        GAMMA_WAREHOUSE_LOCATION_ID
                    );
                }
                break;

            case 'missing_clearance_tag':
                await addProductTags(fixPayload.id, ['Clearance']);
                break;
            case 'missing_oversize_tag':
                await addProductTags(fixPayload.id, ['OVERSIZE']);
                await updateProduct(fixPayload.id, { templateSuffix: 'heavy-products' });
                break;
            case 'incorrect_template_suffix':
                let newSuffix = '';
                if (typeof targetValue === 'string') {
                    if (targetValue === 'Default Template') {
                        newSuffix = '';
                    } else {
                        newSuffix = targetValue;
                    }
                } else {
                    newSuffix = 'clearance';
                }
                await updateProduct(fixPayload.id, { templateSuffix: newSuffix });
                break;

            case 'clearance_price_mismatch':
                await removeProductTags(fixPayload.id, ['Clearance', 'clearance']);
                await updateProduct(fixPayload.id, { templateSuffix: '' });
                break;
            case 'stale_clearance_tag':
                await removeProductTags(fixPayload.id, ['Clearance', 'clearance']);
                await updateProduct(fixPayload.id, { templateSuffix: '' });
                break;

            case 'duplicate_in_shopify':
            case 'duplicate_handle':
                return {
                    success: true,
                    message: `SKU ${csvProduct.sku} is a warning, no server action taken.`,
                };
        }
        await log('SUCCESS', `Successfully fixed ${fixType} for ${csvProduct.sku}`);
        return { success: true, message: `Successfully fixed ${fixType} for ${csvProduct.sku}` };
    } catch (error) {
        const message = getErrorMessage(error);
        logger.error(`Failed to fix ${fixType} for SKU ${csvProduct.sku}:`, error);
        await log('ERROR', `Failed to fix ${fixType} for SKU ${csvProduct.sku}: ${message}`);
        return { success: false, message };
    }
}

// ── Exported server actions ─────────────────────────────────────────

export async function fixMultipleMismatches(
    items: AuditResult[],
    targetFields?: MismatchDetail['field'][]
): Promise<{ success: boolean; message: string; results: any[] }> {
    let fixCount = 0;
    const allResults: any[] = [];

    const itemsToProcess =
        targetFields && targetFields.length > 0
            ? items
                .map((item) => ({
                    ...item,
                    mismatches: item.mismatches.filter((m) => targetFields.includes(m.field)),
                }))
                .filter((item) => item.mismatches.length > 0)
            : items;

    const groupedByProductId = itemsToProcess.reduce(
        (acc, item) => {
            if (item.status === 'mismatched' && item.shopifyProducts.length > 0) {
                const productId = item.shopifyProducts[0].id;
                if (!acc[productId]) {
                    acc[productId] = [];
                }
                acc[productId].push(item);
            }
            return acc;
        },
        {} as Record<string, AuditResult[]>
    );

    const CONCURRENCY_LIMIT = 2;
    const queue = Object.values(groupedByProductId);

    const worker = async () => {
        while (queue.length > 0) {
            const productItems = queue.shift();
            if (!productItems) break;

            await sleep(1000);

            const productId = productItems[0].shopifyProducts[0].id;
            const fixPromises: Promise<{
                sku: string;
                field: MismatchDetail['field'];
                success: boolean;
                message: string;
            }>[] = [];

            for (const item of productItems) {
                const csvProduct = item.csvProducts[0];
                const shopifyProduct = item.shopifyProducts[0];

                for (const mismatch of item.mismatches) {
                    fixPromises.push(
                        _fixSingleMismatch(mismatch.field, csvProduct, shopifyProduct, mismatch.csvValue).then(
                            (result) => ({
                                sku: item.sku,
                                field: mismatch.field,
                                ...result,
                            })
                        )
                    );
                }
            }

            try {
                const results = await Promise.all(fixPromises);
                allResults.push(...results);
                const successfulFixesInBatch = results.filter((r) => r.success).length;
                fixCount += successfulFixesInBatch;

                if (successfulFixesInBatch < results.length) {
                    logger.warn(`Some fixes failed for product ID ${productId}`);
                }
            } catch (error) {
                logger.error(
                    `An error occurred during parallel fix execution for product ID ${productId}:`,
                    error
                );
            }
        }
    };

    const workers = Array(Math.min(Object.keys(groupedByProductId).length, CONCURRENCY_LIMIT))
        .fill(null)
        .map(worker);
    await Promise.all(workers);

    if (fixCount > 0) {
        revalidatePath('/');
    }

    const totalFixesAttempted = allResults.length;
    const successfulFixes = allResults.filter((r) => r.success);
    const message = `Attempted to fix ${totalFixesAttempted} issues. Successfully fixed ${fixCount}.`;
    logger.info(message);
    return { success: true, message, results: successfulFixes };
}

export async function bulkUpdateTags(
    items: AuditResult[],
    customTag?: string
): Promise<{ success: boolean; message: string; updatedCount: number; error?: string }> {
    let successCount = 0;
    const itemResults: any[] = [];

    const CONCURRENCY_LIMIT = 5;
    const queue = [...items];

    const worker = async () => {
        while (queue.length > 0) {
            const item = queue.shift();
            if (!item) break;

            await sleep(500);

            const csvProduct = item.csvProducts[0];
            const shopifyProduct = item.shopifyProducts[0];

            if (!shopifyProduct) {
                itemResults.push({ sku: item.sku, success: false, message: 'Product not found in Shopify.' });
                continue;
            }

            if (!csvProduct) {
                itemResults.push({ sku: item.sku, success: false, message: 'Product not found in CSV.' });
                continue;
            }

            const tagSet = new Set<string>();

            if (csvProduct.tags) {
                csvProduct.tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .slice(0, 3)
                    .forEach((t) => tagSet.add(t));
            }

            if (csvProduct.category) {
                tagSet.add(csvProduct.category.trim());
            }

            if (customTag) {
                tagSet.add(customTag.trim());
            }

            const tags = Array.from(tagSet).join(', ');

            logger.info(`Updating tags for ${item.sku} to: "${tags}"`);

            try {
                await updateProduct(shopifyProduct.id, { tags });
                successCount++;
                itemResults.push({ sku: item.sku, success: true, message: 'Tags updated successfully.' });
            } catch (error) {
                const message = getErrorMessage(error);
                logger.error(`Failed to update tags for ${item.sku}:`, error);
                itemResults.push({ sku: item.sku, success: false, message });
            }
        }
    };

    const workers = Array(Math.min(items.length, CONCURRENCY_LIMIT))
        .fill(null)
        .map(worker);
    await Promise.all(workers);

    if (successCount > 0) {
        revalidatePath('/');
    }

    const failedItems = itemResults.filter((r) => !r.success);
    const error =
        failedItems.length > 0
            ? failedItems.map((r) => `${r.sku}: ${r.message}`).join('; ')
            : undefined;

    return {
        success: successCount > 0,
        message: `Successfully updated tags for ${successCount} products.`,
        updatedCount: successCount,
        error,
    };
}
