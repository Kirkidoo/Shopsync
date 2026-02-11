'use server';

import { Product, ShopifyProductImage } from '@/lib/types';
import {
    updateProductVariant,
    getFullProduct,
    addProductImage,
    deleteProductImage,
    getProductImageCounts as getShopifyProductImageCounts,
    getProductByHandle,
} from '@/lib/shopify';
import { logger } from '@/lib/logger';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Exported server actions ─────────────────────────────────────────

export async function getProductWithImages(
    productId: string
): Promise<{ variants: Product[]; images: ShopifyProductImage[] }> {
    try {
        const numericProductId = parseInt(productId.split('/').pop() || '0', 10);
        if (!numericProductId) {
            throw new Error(`Invalid Product GID: ${productId}`);
        }
        const productData = await getFullProduct(numericProductId);

        const variants = productData.variants.map((v: any) => ({
            id: `gid://shopify/Product/${productData.id}`,
            variantId: `gid://shopify/ProductVariant/${v.id}`,
            sku: v.sku,
            name: productData.title,
            price: parseFloat(v.price),
            option1Name: productData.options[0]?.name || null,
            option1Value: v.option1,
            option2Name: productData.options[1]?.name || null,
            option2Value: v.option2,
            option3Name: productData.options[2]?.name || null,
            option3Value: v.option3,
            imageId: v.image_id,
        }));

        const images = productData.images.map((img: any) => ({
            id: img.id,
            productId: img.product_id,
            src: img.src,
            variant_ids: img.variant_ids,
        }));

        return { variants, images };
    } catch (error) {
        logger.error(`Failed to get product with images for ID ${productId}:`, error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        throw new Error(message);
    }
}

export async function getProductByHandleServer(handle: string): Promise<Product | null> {
    try {
        const product = await getProductByHandle(handle);
        if (!product) return null;

        return {
            id: product.id,
            handle: product.handle,
        } as Product;
    } catch (error) {
        logger.error(`Failed to get product by handle ${handle}:`, error);
        return null;
    }
}

export async function getProductImageCounts(
    productIds: string[]
): Promise<Record<string, number>> {
    try {
        const numericProductIds = productIds.map((gid) => {
            const id = gid.split('/').pop();
            if (!id || isNaN(parseInt(id, 10))) {
                throw new Error(`Invalid Product GID for image count: ${gid}`);
            }
            return parseInt(id, 10);
        });

        if (numericProductIds.length === 0) {
            return {};
        }

        const counts = await getShopifyProductImageCounts(numericProductIds);

        const gidCounts: Record<string, number> = {};
        for (const [numericId, count] of Object.entries(counts)) {
            gidCounts[`gid://shopify/Product/${numericId}`] = count;
        }

        return gidCounts;
    } catch (error) {
        logger.error(`Failed to get product image counts for IDs ${productIds.join(', ')}:`, error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        throw new Error(message);
    }
}

export async function addImageFromUrl(
    productId: string,
    imageUrl: string
): Promise<{ success: boolean; message: string; image?: ShopifyProductImage }> {
    try {
        await sleep(600);
        const numericProductId = parseInt(productId.split('/').pop() || '0', 10);
        if (!numericProductId) {
            throw new Error(`Invalid Product GID: ${productId}`);
        }
        const newImage = await addProductImage(numericProductId, imageUrl);
        return { success: true, message: 'Image added successfully.', image: newImage };
    } catch (error) {
        logger.error(`Failed to add image for product ${productId}:`, error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return { success: false, message };
    }
}

export async function assignImageToVariant(
    variantId: string,
    imageId: number | null
): Promise<{ success: boolean; message: string }> {
    try {
        await sleep(600);
        const numericVariantId = parseInt(variantId.split('/').pop() || '0', 10);
        if (!numericVariantId) {
            throw new Error(`Invalid Variant GID: ${variantId}`);
        }
        await updateProductVariant(numericVariantId, { image_id: imageId });
        return { success: true, message: 'Image assigned successfully.' };
    } catch (error) {
        logger.error(`Failed to assign image ${imageId} to variant ${variantId}:`, error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return { success: false, message };
    }
}

export async function deleteImage(
    productId: string,
    imageId: number
): Promise<{ success: boolean; message: string }> {
    try {
        await sleep(600);
        const numericProductId = parseInt(productId.split('/').pop() || '0', 10);
        if (!numericProductId) {
            throw new Error(`Invalid Product GID: ${productId}`);
        }
        await deleteProductImage(numericProductId, imageId);
        return { success: true, message: 'Image deleted successfully.' };
    } catch (error) {
        logger.error(`Failed to delete image ${imageId} from product ${productId}:`, error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return { success: false, message };
    }
}

export async function deleteUnlinkedImages(
    productId: string
): Promise<{ success: boolean; message: string; deletedCount: number }> {
    logger.info(`Starting to delete unlinked images for product GID: ${productId}`);
    try {
        const { images, variants } = await getProductWithImages(productId);
        const linkedImageIds = new Set(variants.map((v) => v.imageId).filter((id) => id !== null));

        const unlinkedImages = images.filter((image) => !linkedImageIds.has(image.id));

        if (unlinkedImages.length === 0) {
            return { success: true, message: 'No unlinked images found to delete.', deletedCount: 0 };
        }

        logger.info(`Found ${unlinkedImages.length} unlinked images to delete.`);
        let deletedCount = 0;

        for (const image of unlinkedImages) {
            const result = await deleteImage(productId, image.id);
            if (result.success) {
                deletedCount++;
            } else {
                logger.warn(`Failed to delete image ID ${image.id}: ${result.message}`);
            }
            await sleep(600);
        }

        const message = `Successfully deleted ${deletedCount} of ${unlinkedImages.length} unlinked images.`;
        logger.info(message);
        return { success: true, message, deletedCount };
    } catch (error) {
        logger.error(`Failed to delete unlinked images for product ${productId}:`, error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return { success: false, message, deletedCount: 0 };
    }
}

export async function deleteUnlinkedImagesForMultipleProducts(
    productIds: string[]
): Promise<{
    success: boolean;
    message: string;
    results: { productId: string; success: boolean; deletedCount: number; message: string }[];
}> {
    logger.info(`Starting bulk deletion of unlinked images for ${productIds.length} products.`);
    const results = [];
    let totalSuccessCount = 0;
    let totalDeletedCount = 0;

    for (const productId of productIds) {
        const result = await deleteUnlinkedImages(productId);
        results.push({ productId, ...result });
        if (result.success && result.deletedCount > 0) {
            totalSuccessCount++;
            totalDeletedCount += result.deletedCount;
        }
        await sleep(500);
    }

    const message = `Bulk operation complete. Processed ${productIds.length} products and deleted a total of ${totalDeletedCount} unlinked images.`;
    logger.info(message);
    return { success: totalSuccessCount > 0, message, results };
}
