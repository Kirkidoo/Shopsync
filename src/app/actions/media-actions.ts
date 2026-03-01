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
import { handleActionError, throwActionError, getErrorMessage } from '@/lib/action-utils';
import { logger } from '@/lib/logger';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Exported server actions ─────────────────────────────────────────

export async function getProductWithImages(
    productId: string
): Promise<{ success: boolean; message: string; data?: { variants: Product[]; images: ShopifyProductImage[] } }> {
    try {
        if (!productId) {
            throw new Error(`Invalid Product GID: ${productId}`);
        }
        const productData = await getFullProduct(productId);

        if (!productData) {
            throw new Error(`Product not found: ${productId}`);
        }

        const variants = (productData.variants?.edges || []).map((edge: any) => {
            const v = edge.node;
            return {
                id: productData.id,
                variantId: v.id,
                sku: v.sku,
                name: productData.title,
                price: parseFloat(v.price),
                option1Name: productData.options?.[0]?.name || null,
                option1Value: v.selectedOptions?.find((o: any) => o.name === 'Option1')?.value || v.option1,
                option2Name: productData.options?.[1]?.name || null,
                option2Value: v.selectedOptions?.find((o: any) => o.name === 'Option2')?.value || v.option2,
                option3Name: productData.options?.[2]?.name || null,
                option3Value: v.selectedOptions?.find((o: any) => o.name === 'Option3')?.value || v.option3,
                imageId: v.image?.id || null,
            };
        });

        const images = (productData.images?.edges || []).map((edge: any) => {
            const img = edge.node;
            return {
                id: img.id,
                product_id: productData.id,
                src: img.url,
                variant_ids: [], // Not easily available in a single flat list
            };
        });

        return { success: true, message: 'Product fetched successfully', data: { variants, images } };
    } catch (error) {
        return handleActionError(`Failed to get product with images for ID ${productId}`, error);
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
        handleActionError(`Failed to get product by handle ${handle}`, error);
        return null;
    }
}

export async function getProductImageCounts(
    productIds: string[]
): Promise<Record<string, number>> {
    try {
        if (productIds.length === 0) {
            return {};
        }

        const counts = await getShopifyProductImageCounts(productIds);
        return counts;
    } catch (error) {
        throwActionError(`Failed to get product image counts for IDs ${productIds.join(', ')}`, error);
        throw error;
    }
}

export async function addImageFromUrl(
    productId: string,
    imageUrl: string
): Promise<{ success: boolean; message: string; image?: ShopifyProductImage }> {
    try {
        const newImage = await addProductImage(productId, imageUrl);
        return { success: true, message: 'Image added successfully.', image: newImage };
    } catch (error) {
        return handleActionError(`Failed to add image for product ${productId}`, error);
    }
}

export async function assignImageToVariant(
    productId: string,
    variantId: string,
    imageId: string | null
): Promise<{ success: boolean; message: string }> {
    try {
        await updateProductVariant(productId, variantId, { image_id: imageId });
        return { success: true, message: 'Image assigned successfully.' };
    } catch (error) {
        return handleActionError(`Failed to assign image ${imageId} to variant ${variantId}`, error);
    }
}

export async function deleteImage(
    productId: string,
    imageId: string
): Promise<{ success: boolean; message: string }> {
    try {
        await deleteProductImage(productId, imageId);
        return { success: true, message: 'Image deleted successfully.' };
    } catch (error) {
        return handleActionError(`Failed to delete image ${imageId} from product ${productId}`, error);
    }
}

export async function deleteUnlinkedImages(
    productId: string
): Promise<{ success: boolean; message: string; deletedCount: number }> {
    logger.info(`Starting to delete unlinked images for product GID: ${productId}`);
    try {
        const result = await getProductWithImages(productId);
        if (!result.success || !result.data) {
            throw new Error(result.message || "Could not fetch product images");
        }
        const { images, variants } = result.data;

        const linkedImageIds = new Set(variants.map((v) => v.imageId).filter((id): id is string => id !== null));

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
        const message = getErrorMessage(error);
        logger.error(`Failed to delete unlinked images for product ${productId}:`, error);
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
        if (result.success) {
            totalSuccessCount++;
            totalDeletedCount += result.deletedCount;
        }
        await sleep(500);
    }

    const message = `Bulk operation complete. Processed ${productIds.length} products and deleted a total of ${totalDeletedCount} unlinked images.`;
    logger.info(message);
    return { success: totalSuccessCount > 0, message, results };
}
