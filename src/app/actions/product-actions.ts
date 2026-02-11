'use server';

import { Product } from '@/lib/types';
import {
    getShopifyProductsBySku,
    updateProductVariant,
    inventorySetQuantities,
    createProduct,
    addProductVariant,
    connectInventoryToLocation,
    getShopifyLocations,
    disconnectInventoryFromLocation,
    publishProductToSalesChannels,
    deleteProduct,
    deleteProductVariant,
} from '@/lib/shopify';
import { revalidatePath } from 'next/cache';
import { log } from '@/services/logger';
import { logger } from '@/lib/logger';
import { handleActionError, getErrorMessage } from '@/lib/action-utils';
import { GAMMA_WAREHOUSE_LOCATION_ID, GARAGE_LOCATION_NAME } from '@/lib/constants';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Exported server actions ─────────────────────────────────────────

export async function createInShopify(
    product: Product,
    allVariantsForHandle: Product[],
    fileName: string,
    missingType: 'product' | 'variant'
) {
    logger.info(
        `Attempting to create product/variant for Handle: ${product.handle}, Missing Type: ${missingType}`
    );
    await log('INFO', `Starting creation of ${missingType} for handle: ${product.handle}`);

    // Final pre-creation check to prevent duplicates
    const skusToCreate =
        missingType === 'product' ? allVariantsForHandle.map((p) => p.sku) : [product.sku];

    logger.info(`Performing final check for SKUs: ${skusToCreate.join(', ')}`);
    const existingProducts = await getShopifyProductsBySku(skusToCreate);
    if (existingProducts.length > 0) {
        const foundSkus = existingProducts.map((p) => p.sku).join(', ');
        const errorMessage = `Creation aborted. The following SKU(s) already exist in Shopify: ${foundSkus}. Please run a new audit.`;
        logger.error(errorMessage);
        return { success: false, message: errorMessage };
    }
    logger.info('Final check passed. No existing SKUs found.');

    try {
        let createdProduct;
        const addClearanceTag = fileName.toLowerCase().includes('clearance');

        if (missingType === 'product') {
            logger.info(
                `Phase 1: Creating product for handle ${product.handle} with ${allVariantsForHandle.length} variants.`
            );
            createdProduct = await createProduct(allVariantsForHandle, addClearanceTag);
        } else {
            logger.info(`Adding variant with SKU ${product.sku} to existing product.`);
            createdProduct = await addProductVariant(product);
        }

        if (!createdProduct || !createdProduct.id) {
            throw new Error('Product creation or variant addition failed to return a valid result.');
        }

        const productGid = `gid://shopify/Product/${createdProduct.id}`;

        // --- Phase 2: Post-creation/addition tasks ---

        // 2a. Link variant to image
        if (createdProduct.images && createdProduct.images.length > 0) {
            logger.info('Phase 2: Linking images to variants...');
            const getImageFilename = (url: string) => url.split('/').pop()?.split('?')[0];

            const imageFilenameToIdMap = new Map<string, number>();
            createdProduct.images.forEach((img: any) => {
                const filename = getImageFilename(img.src);
                if (filename) {
                    imageFilenameToIdMap.set(filename, img.id);
                }
            });

            const variantsToLink = missingType === 'product' ? allVariantsForHandle : [product];

            for (const sourceVariant of variantsToLink) {
                const createdVariant = createdProduct.variants.find(
                    (v: any) => v.sku === sourceVariant.sku
                );
                if (!createdVariant) continue;

                let imageIdToAssign: number | null = null;

                if (sourceVariant.mediaUrl) {
                    const sourceFilename = getImageFilename(sourceVariant.mediaUrl);
                    if (sourceFilename && imageFilenameToIdMap.has(sourceFilename)) {
                        imageIdToAssign = imageFilenameToIdMap.get(sourceFilename)!;
                    }
                } else if (sourceVariant.imageId) {
                    imageIdToAssign = sourceVariant.imageId;
                }

                if (imageIdToAssign) {
                    logger.info(
                        ` - Assigning image ID ${imageIdToAssign} to variant ID ${createdVariant.id}...`
                    );
                    await updateProductVariant(createdVariant.id, { image_id: imageIdToAssign });
                } else if (sourceVariant.mediaUrl || sourceVariant.imageId) {
                    logger.warn(` - Could not find a matching image for SKU: ${sourceVariant.sku}`);
                }
            }
        }

        // 2b. Connect inventory & Set levels for each variant
        const locations = await getShopifyLocations();
        const garageLocation = locations.find((l) => l.name === GARAGE_LOCATION_NAME);

        const variantsToProcess =
            missingType === 'product'
                ? createdProduct.variants
                : [createdProduct.variants.find((v: any) => v.sku === product.sku)];

        for (const variant of variantsToProcess) {
            if (!variant) continue;
            const sourceVariant = allVariantsForHandle.find((p) => p.sku === variant.sku);
            if (!sourceVariant) continue;

            const inventoryItemIdGid = `gid://shopify/InventoryItem/${variant.inventory_item_id}`;

            if (sourceVariant.inventory !== null && inventoryItemIdGid) {
                logger.info(
                    `Connecting inventory item ${inventoryItemIdGid} to location ${GAMMA_WAREHOUSE_LOCATION_ID}...`
                );
                await connectInventoryToLocation(inventoryItemIdGid, GAMMA_WAREHOUSE_LOCATION_ID);

                logger.info('Setting inventory level...');
                await inventorySetQuantities(
                    inventoryItemIdGid,
                    sourceVariant.inventory,
                    GAMMA_WAREHOUSE_LOCATION_ID
                );

                if (garageLocation) {
                    logger.info(
                        `Found 'Garage Harry Stanley' (ID: ${garageLocation.id}). Disconnecting inventory...`
                    );
                    await disconnectInventoryFromLocation(inventoryItemIdGid, garageLocation.id);
                }
            }
        }

        // 2d. Publish to all sales channels (only for new products)
        if (missingType === 'product' && productGid) {
            logger.info(`Publishing product ${productGid} to all sales channels...`);
            await sleep(2000);
            await publishProductToSalesChannels(productGid);
        } else {
            logger.warn(
                `Could not publish product with handle ${product.handle} because its GID was not found or it's a new variant.`
            );
        }

        revalidatePath('/');

        await log('SUCCESS', `Successfully created ${missingType} for ${product.handle}`);
        return {
            success: true,
            message: `Successfully created ${missingType} for ${product.handle}`,
            createdProductData: createdProduct,
        };
    } catch (error) {
        const message = getErrorMessage(error);
        logger.error(`Failed to create ${missingType} for SKU ${product.sku}:`, error);
        await log('ERROR', `Failed to create ${missingType} for SKU ${product.sku}: ${message}`);
        return { success: false, message };
    }
}

export async function createMultipleInShopify(
    itemsToCreate: { product: Product; allVariants: Product[]; missingType: 'product' | 'variant' }[],
    fileName: string
): Promise<{ success: boolean; message: string; results: any[] }> {
    let successCount = 0;
    const itemResults: any[] = [];

    const groupedByHandle = itemsToCreate.reduce(
        (acc, item) => {
            const handle = item.product.handle;
            if (!acc[handle]) {
                acc[handle] = {
                    product: item.product,
                    allVariants: [],
                    missingType: 'product',
                };
            }
            acc[handle].allVariants.push(...item.allVariants.filter((v) => v.handle === handle));
            return acc;
        },
        {} as {
            [handle: string]: {
                product: Product;
                allVariants: Product[];
                missingType: 'product' | 'variant';
            };
        }
    );

    // De-duplicate variants within each handle group
    for (const handle in groupedByHandle) {
        const uniqueVariantsMap = new Map<string, Product>();
        groupedByHandle[handle].allVariants.forEach((variant) => {
            uniqueVariantsMap.set(variant.sku, variant);
        });
        groupedByHandle[handle].allVariants = Array.from(uniqueVariantsMap.values());
    }

    const CONCURRENCY_LIMIT = 2;
    const queue = Object.values(groupedByHandle);

    const worker = async () => {
        while (queue.length > 0) {
            const item = queue.shift();
            if (!item) break;

            await sleep(1000);

            const result = await createInShopify(item.product, item.allVariants, fileName, 'product');

            if (result.success) {
                successCount++;
            }
            itemResults.push({ handle: item.product.handle, ...result });
        }
    };

    const workers = Array(Math.min(Object.keys(groupedByHandle).length, CONCURRENCY_LIMIT))
        .fill(null)
        .map(worker);
    await Promise.all(workers);

    if (successCount > 0) {
        revalidatePath('/');
    }

    const totalProductsToCreate = Object.keys(groupedByHandle).length;
    const message = `Attempted to create ${totalProductsToCreate} products. Successfully created ${successCount}.`;
    logger.info(message);
    return { success: true, message, results: itemResults };
}

export async function createMultipleVariantsForProduct(
    variants: Product[]
): Promise<{ success: boolean; message: string; results: any[] }> {
    let successCount = 0;
    const itemResults: any[] = [];

    if (variants.length === 0) {
        return { success: false, message: 'No variants provided to create.', results: [] };
    }

    const handle = variants[0].handle;
    logger.info(`Starting bulk variant creation for handle: ${handle}`);

    const CONCURRENCY_LIMIT = 2;
    const queue = [...variants];

    const worker = async () => {
        while (queue.length > 0) {
            const variant = queue.shift();
            if (!variant) break;

            await sleep(1000);

            const result = await createInShopify(variant, variants, 'N/A', 'variant');
            if (result.success) {
                successCount++;
            }
            itemResults.push({ sku: variant.sku, ...result });
        }
    };

    const workers = Array(Math.min(variants.length, CONCURRENCY_LIMIT)).fill(null).map(worker);
    await Promise.all(workers);

    if (successCount > 0) {
        revalidatePath('/');
    }

    const message = `Attempted to create ${variants.length} variants for handle ${handle}. Successfully created ${successCount}.`;
    logger.info(message);
    return { success: successCount > 0, message, results: itemResults };
}

export async function deleteFromShopify(productId: string) {
    logger.info(`Attempting to delete product with GID: ${productId}`);
    try {
        await deleteProduct(productId);
        revalidatePath('/');
        return { success: true, message: `Successfully deleted product ${productId}` };
    } catch (error) {
        return handleActionError(`Failed to delete product ${productId}`, error);
    }
}

export async function deleteVariantFromShopify(productId: string, variantId: string) {
    logger.info(`Attempting to delete variant ${variantId} from product ${productId}`);
    try {
        const numericProductId = parseInt(productId.split('/').pop() || '0', 10);
        const numericVariantId = parseInt(variantId.split('/').pop() || '0', 10);

        if (!numericProductId || !numericVariantId) {
            throw new Error(
                `Invalid Product or Variant GID. Product: ${productId}, Variant: ${variantId}`
            );
        }

        await deleteProductVariant(numericProductId, numericVariantId);
        revalidatePath('/');
        return { success: true, message: `Successfully deleted variant ${variantId}` };
    } catch (error) {
        return handleActionError(`Failed to delete variant ${variantId}`, error);
    }
}
