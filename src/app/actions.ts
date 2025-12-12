'use server';

import {
  Product,
  AuditResult,
  DuplicateSku,
  MismatchDetail,
  ShopifyProductImage,
} from '@/lib/types';
import {
  getShopifyProductsBySku,
  updateProduct,
  updateProductVariant,
  inventorySetQuantities,
  createProduct,
  addProductVariant,
  connectInventoryToLocation,
  linkProductToCollection,
  getCollectionIdByTitle,
  getShopifyLocations,
  disconnectInventoryFromLocation,
  publishProductToSalesChannels,
  deleteProduct,
  deleteProductVariant,
  startProductExportBulkOperation as startShopifyBulkOp,
  checkBulkOperationStatus as checkShopifyBulkOpStatus,
  getBulkOperationResult,
  parseBulkOperationResult,
  getFullProduct,
  addProductImage,
  deleteProductImage,
  getProductImageCounts as getShopifyProductImageCounts,
  getProductByHandle,
  addProductTags,
  removeProductTags,
} from '@/lib/shopify';
import { revalidatePath } from 'next/cache';
import fsPromises from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import * as ftpService from '@/services/ftp';
import * as csvService from '@/services/csv';
import * as auditService from '@/services/audit';
import { log, getLogs, clearLogs } from '@/services/logger';
import { logger } from '@/lib/logger';




const GAMMA_WAREhouse_LOCATION_ID = process.env.GAMMA_WAREHOUSE_LOCATION_ID
  ? parseInt(process.env.GAMMA_WAREHOUSE_LOCATION_ID, 10)
  : 93998154045;
const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE_PATH = path.join(CACHE_DIR, 'shopify-bulk-export.jsonl');
const CACHE_INFO_PATH = path.join(CACHE_DIR, 'cache-info.json');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureCacheDirExists() {
  try {
    await fsPromises.access(CACHE_DIR);
  } catch {
    await fsPromises.mkdir(CACHE_DIR, { recursive: true });
  }
}

export async function connectToFtp(data: FormData) {
  return await ftpService.connectToFtp(data);
}

export async function listCsvFiles(data: FormData) {
  return await ftpService.listCsvFiles(data);
}

export async function getFtpCredentials() {
  return {
    host: process.env.FTP_HOST || '',
    username: process.env.FTP_USER || '',
    password: process.env.FTP_PASSWORD || '',
  };
}

export async function getAvailableLocations() {
  return await getShopifyLocations();
}

export async function runAudit(
  csvFileName: string,
  ftpData: FormData,
  locationId?: number // Optional for now to maintain backward compatibility during migration
): Promise<{ report: AuditResult[]; summary: any; duplicates: DuplicateSku[] } | null> {
  return await auditService.runAudit(csvFileName, ftpData, locationId);
}

export async function checkBulkCacheStatus(): Promise<{ lastModified: string | null }> {
  try {
    await fsPromises.access(CACHE_INFO_PATH);
    const info = JSON.parse(await fsPromises.readFile(CACHE_INFO_PATH, 'utf-8'));
    return { lastModified: info.lastModified };
  } catch (error) {
    return { lastModified: null };
  }
}

// --- BULK AUDIT - REFACTORED ACTIONS ---

export async function getCsvProducts(
  csvFileName: string,
  ftpData: FormData
): Promise<Product[] | null> {
  return await csvService.getCsvProducts(csvFileName, ftpData);
}

import { downloadBulkOperationResultToFile } from '@/lib/shopify';

// --- Helper: JSONL Generator ---
// --- Helper: JSONL Generator ---
async function* parseJsonlGenerator(filePath: string, locationId?: number): AsyncGenerator<Product> {
  const GAMMA_LOCATION_ID = locationId?.toString() || process.env.GAMMA_WAREHOUSE_LOCATION_ID || '93998154045';
  const TARGET_LOCATION_URL_SUFFIX = `Location/${GAMMA_LOCATION_ID}`;

  // Pass 1: Build Inventory Map
  // Map of InventoryItemId -> Quantity at Target Location
  // Only store if the item exists at the location.
  const inventoryMap = new Map<string, number>();

  const stream1 = createReadStream(filePath);
  const rl1 = createInterface({
    input: stream1,
    crlfDelay: Infinity,
  });

  for await (const line of rl1) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      // Check for InventoryLevel nodes
      // Structure: { __parentId: "gid://.../InventoryItem/...", location: { id: "gid://.../Location/..." }, quantities: [...] }
      if (obj.location && obj.location.id && obj.__parentId) {
        if (obj.location.id.endsWith(TARGET_LOCATION_URL_SUFFIX)) {
          let quantity = 0;
          if (obj.quantities) {
            const available = obj.quantities.find((q: any) => q.name === 'available');
            if (available) {
              quantity = available.quantity;
            }
          } else if (typeof obj.inventoryQuantity === 'number') {
            quantity = obj.inventoryQuantity;
          }
          inventoryMap.set(obj.__parentId, quantity);
        }
      }
    } catch (e) {
      // Ignore errors in pass 1
    }
  }

  // Pass 2: Yield Products
  const stream2 = createReadStream(filePath);
  const rl2 = createInterface({
    input: stream2,
    crlfDelay: Infinity,
  });

  const parentProducts = new Map<string, any>();

  for await (const line of rl2) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);

      // For "Product" node (Parent):
      if (obj.id && obj.id.includes('gid://shopify/Product/') && !obj.__parentId) {
        parentProducts.set(obj.id, {
          title: obj.title,
          handle: obj.handle,
          bodyHtml: obj.bodyHtml,
          vendor: obj.vendor,
          productType: obj.productType,
          tags: obj.tags ? obj.tags.join(', ') : '',
          templateSuffix: obj.templateSuffix,
        });
      }
      // For Variant node:
      else if (obj.sku !== undefined || obj.price !== undefined) {
        const parentId = obj.__parentId;
        const parent = parentProducts.get(parentId);
        const inventoryItemId = obj.inventoryItem?.id;

        // FILTER: Check if this variant is stocked at the target location
        // If inventoryItemId is NOT in inventoryMap, it means this variant has NO inventory record at the target location.
        // Thus, it should be excluded.
        let finalInventory = 0;
        let isAtLocation = false;

        if (inventoryItemId && inventoryMap.has(inventoryItemId)) {
          finalInventory = inventoryMap.get(inventoryItemId)!;
          isAtLocation = true;
        }

        if (!isAtLocation) continue;

        if (parent) {
          yield {
            id: parentId,
            variantId: obj.id,
            inventoryItemId: inventoryItemId || '',
            handle: parent.handle,
            sku: obj.sku || '',
            name: parent.title,
            price: parseFloat(obj.price || '0'),
            inventory: finalInventory,
            descriptionHtml: parent.bodyHtml,
            productType: parent.productType,
            vendor: parent.vendor,
            tags: parent.tags,
            compareAtPrice: obj.compareAtPrice ? parseFloat(obj.compareAtPrice) : null,
            costPerItem: null,
            barcode: obj.barcode,
            weight: obj.inventoryItem?.measurement?.weight?.value || 0,
            mediaUrl: null,
            category: null,
            option1Name: null,
            option1Value: obj.selectedOptions?.find((o: any) => o.name === 'Option1')?.value || obj.option1,
            option2Name: null,
            option2Value: obj.selectedOptions?.find((o: any) => o.name === 'Option2')?.value || obj.option2,
            option3Name: null,
            option3Value: obj.selectedOptions?.find((o: any) => o.name === 'Option3')?.value || obj.option3,
            imageId: null,
            templateSuffix: parent.templateSuffix,
            locationIds: [], // We filtered, so implied it's at this location. We don't need full list for audit purposes right now.
          } as Product;
        }
      }

    } catch (e) {
      logger.error('Error parsing JSONL line:', e);
    }
  }
}

export async function getShopifyProductsFromCache(): Promise<Product[] | null> {
  try {
    await fsPromises.access(CACHE_FILE_PATH);
    const products: Product[] = [];
    for await (const product of parseJsonlGenerator(CACHE_FILE_PATH)) {
      products.push(product);
    }
    return products;
  } catch (error) {
    logger.error('Failed to read or parse cache file.', error);
    return null;
  }
}

export async function startBulkOperation(): Promise<{
  id: string;
  status: string;
  resultUrl?: string;
}> {
  return await startShopifyBulkOp();
}

export async function checkBulkOperationStatus(
  id: string
): Promise<{ id: string; status: string; resultUrl?: string }> {
  return await checkShopifyBulkOpStatus(id);
}

export async function getBulkOperationResultAndParse(url: string, locationId?: number): Promise<Product[] | null> {
  await ensureCacheDirExists();
  try {
    await downloadBulkOperationResultToFile(url, CACHE_FILE_PATH);
    await fsPromises.writeFile(CACHE_INFO_PATH, JSON.stringify({ lastModified: new Date().toISOString() }));

    // Convert to array for compatibility (Step 1)
    const products: Product[] = [];
    for await (const product of parseJsonlGenerator(CACHE_FILE_PATH, locationId)) {
      products.push(product);
    }
    return products;
  } catch (error) {
    logger.error('Failed to download or parse bulk result', error);
    return null;
  }
}

export async function runBulkAuditComparison(
  csvProducts: Product[],
  shopifyProducts: Product[],
  csvFileName: string,
  locationId?: number
): Promise<{ report: AuditResult[]; summary: any; duplicates: DuplicateSku[] }> {
  // Pass locationId if we need it for post-processing, though parsing should have handled it mostly.
  return await auditService.runBulkAuditComparison(csvProducts, shopifyProducts, csvFileName);
}

// --- FIX ACTIONS ---

async function _fixSingleMismatch(
  fixType: MismatchDetail['field'],
  csvProduct: Product,
  shopifyProduct: Product,
  targetValue?: string | number | null // New parameter
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
            GAMMA_WAREhouse_LOCATION_ID
          );
        }
        break;

      case 'missing_clearance_tag':
        await addProductTags(fixPayload.id, ['Clearance']);
        break;
      case 'missing_oversize_tag':
        await addProductTags(fixPayload.id, ['oversize']);
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
          // Fallback if no targetValue passed (shouldn't happen with new logic, but safe default)
          newSuffix = 'clearance';
        }
        await updateProduct(fixPayload.id, { templateSuffix: newSuffix });
        break;

      case 'clearance_price_mismatch':
        // Fix: Remove 'Clearance' tag and reset template to default
        await removeProductTags(fixPayload.id, ['Clearance', 'clearance']);
        await updateProduct(fixPayload.id, { templateSuffix: '' });
        break;
      case 'duplicate_in_shopify':
      case 'duplicate_handle':
        // This is a warning, cannot be fixed programmatically. Handled client-side.
        return {
          success: true,
          message: `SKU ${csvProduct.sku} is a warning, no server action taken.`,
        };
    }
    await log('SUCCESS', `Successfully fixed ${fixType} for ${csvProduct.sku}`);
    return { success: true, message: `Successfully fixed ${fixType} for ${csvProduct.sku}` };
  } catch (error) {
    logger.error(`Failed to fix ${fixType} for SKU ${csvProduct.sku}:`, error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    await log('ERROR', `Failed to fix ${fixType} for SKU ${csvProduct.sku}: ${message}`);
    return { success: false, message };
  }
}

export async function fixMultipleMismatches(
  items: AuditResult[],
  targetFields?: MismatchDetail['field'][]
): Promise<{ success: boolean; message: string; results: any[] }> {
  let fixCount = 0;
  const allResults: any[] = [];

  // Filter items to only include those with the target mismatch field if specified
  const itemsToProcess =
    targetFields && targetFields.length > 0
      ? items
        .map((item) => ({
          ...item,
          mismatches: item.mismatches.filter((m) => targetFields.includes(m.field)),
        }))
        .filter((item) => item.mismatches.length > 0)
      : items;

  // Group items by product ID to process fixes for the same product together
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

      await sleep(1000); // Rate limit protection

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
            _fixSingleMismatch(mismatch.field, csvProduct, shopifyProduct, mismatch.csvValue).then((result) => ({
              sku: item.sku,
              field: mismatch.field,
              ...result,
            }))
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

      await sleep(500); // Rate limit protection

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

      // 1. Get first 3 tags from CSV + Category + Custom Tag (Deduplicated)
      const tagSet = new Set<string>();

      if (csvProduct.tags) {
        csvProduct.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 3)
          .forEach(t => tagSet.add(t));
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
        logger.error(`Failed to update tags for ${item.sku}:`, error);
        const message = error instanceof Error ? error.message : 'Unknown error';
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
      // Phase 1: Create Product
      logger.info(
        `Phase 1: Creating product for handle ${product.handle} with ${allVariantsForHandle.length} variants.`
      );
      createdProduct = await createProduct(allVariantsForHandle, addClearanceTag);
    } else {
      // 'variant'
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
      // Shopify may alter image URLs (e.g., by adding version query params).
      // A more robust way to match is by the image filename.
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

        // If the variant from the CSV has an image URL, try to match it by filename.
        if (sourceVariant.mediaUrl) {
          const sourceFilename = getImageFilename(sourceVariant.mediaUrl);
          if (sourceFilename && imageFilenameToIdMap.has(sourceFilename)) {
            imageIdToAssign = imageFilenameToIdMap.get(sourceFilename)!;
          }
        }
        // If the user assigned an imageId directly (for missing variants)
        else if (sourceVariant.imageId) {
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
    const garageLocation = locations.find((l) => l.name === 'Garage Harry Stanley');

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
          `Connecting inventory item ${inventoryItemIdGid} to location ${GAMMA_WAREhouse_LOCATION_ID}...`
        );
        await connectInventoryToLocation(inventoryItemIdGid, GAMMA_WAREhouse_LOCATION_ID);

        logger.info('Setting inventory level...');
        await inventorySetQuantities(
          inventoryItemIdGid,
          sourceVariant.inventory,
          GAMMA_WAREhouse_LOCATION_ID
        );

        if (garageLocation) {
          logger.info(
            `Found 'Garage Harry Stanley' (ID: ${garageLocation.id}). Disconnecting inventory...`
          );
          await disconnectInventoryFromLocation(inventoryItemIdGid, garageLocation.id);
        }
      }
    }

    // 2c. Link product to collection if category is specified (only for new products)
    // REMOVED: Category is now added as a tag, not linked to a collection.
    /*
    if (missingType === 'product' && product.category && productGid) {
      console.log(`Linking product to collection: '${product.category}'...`);
      const collectionId = await getCollectionIdByTitle(product.category);
      if (collectionId) {
        await linkProductToCollection(productGid, collectionId);
      } else {
        console.warn(
          `Could not find collection with title '${product.category}'. Skipping linking.`
        );
      }
    }
    */

    // 2d. Publish to all sales channels (only for new products)
    if (missingType === 'product' && productGid) {
      logger.info(`Publishing product ${productGid} to all sales channels...`);
      await sleep(2000); // Add a 2-second wait to ensure the product is ready
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
    logger.error(`Failed to create ${missingType} for SKU ${product.sku}:`, error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
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

  // Group items by handle, since we create one product per handle.
  const groupedByHandle = itemsToCreate.reduce(
    (acc, item) => {
      const handle = item.product.handle;
      if (!acc[handle]) {
        acc[handle] = {
          product: item.product,
          allVariants: [],
          missingType: 'product', // Bulk create is always for new products
        };
      }
      // Correctly accumulate all variants for the handle
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

      await sleep(1000); // Rate limit protection

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

      await sleep(1000); // Rate limit protection

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
    logger.error(`Failed to delete product ${productId}:`, error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, message };
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
    logger.error(`Failed to delete variant ${variantId}:`, error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, message };
  }
}

// --- MEDIA ACTIONS ---

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
      name: productData.title, // Parent product title
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
      // Map other fields if necessary for the client
    } as Product;
  } catch (error) {
    logger.error(`Failed to get product by handle ${handle}:`, error);
    return null;
  }
}

export async function getProductImageCounts(productIds: string[]): Promise<Record<string, number>> {
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

    // Remap keys back to GIDs
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
    await sleep(600); // Add delay to prevent rate limiting
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
    await sleep(600); // Add delay to prevent rate limiting
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
    await sleep(600); // Add delay to prevent rate limiting
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

    console.log(`Found ${unlinkedImages.length} unlinked images to delete.`);
    let deletedCount = 0;

    for (const image of unlinkedImages) {
      const result = await deleteImage(productId, image.id);
      if (result.success) {
        deletedCount++;
      } else {
        console.warn(`Failed to delete image ID ${image.id}: ${result.message}`);
      }
      await sleep(600); // Add delay between each deletion to avoid rate limiting
    }

    const message = `Successfully deleted ${deletedCount} of ${unlinkedImages.length} unlinked images.`;
    console.log(message);
    return { success: true, message, deletedCount };
  } catch (error) {
    console.error(`Failed to delete unlinked images for product ${productId}:`, error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, message, deletedCount: 0 };
  }
}

export async function deleteUnlinkedImagesForMultipleProducts(productIds: string[]): Promise<{
  success: boolean;
  message: string;
  results: { productId: string; success: boolean; deletedCount: number; message: string }[];
}> {
  console.log(`Starting bulk deletion of unlinked images for ${productIds.length} products.`);
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
    await sleep(500); // Add delay to avoid rate limiting
  }

  const message = `Bulk operation complete. Processed ${productIds.length} products and deleted a total of ${totalDeletedCount} unlinked images.`;
  console.log(message);
  return { success: totalSuccessCount > 0, message, results };
}
// --- LOGGING ACTIONS ---

export async function fetchActivityLogs() {
  return await getLogs();
}

export async function clearActivityLogs() {
  return await clearLogs();
}


