import { Product } from '@/lib/types';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { logger } from '@/lib/logger';

/**
 * Shared JSONL parsing logic.
 *
 * The Shopify Bulk Operation JSONL file contains three node types interleaved:
 *   1. Product nodes (parent)
 *   2. ProductVariant nodes (child of a Product)
 *   3. InventoryLevel nodes (child of a ProductVariant)
 *
 * Two passes are required:
 *   Pass 1 – Build an inventory map (variantGid → quantity at target location)
 *            and (optionally) collect every SKU in the file.
 *   Pass 2 – Hydrate Product objects by joining variant + parent + inventory data.
 */

// ── Pass-1 helpers ──────────────────────────────────────────────────

interface Pass1Result {
    inventoryMap: Map<string, number>;
    allSkusInShopify: Set<string>;
}

async function buildInventoryMap(
    filePath: string,
    targetLocationSuffix: string,
    collectAllSkus: boolean
): Promise<Pass1Result> {
    const inventoryMap = new Map<string, number>();
    const allSkusInShopify = new Set<string>();

    const stream = createReadStream(filePath);
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const obj = JSON.parse(line);

            // InventoryLevel node
            if (obj.location?.id && obj.__parentId) {
                if (obj.location.id.endsWith(targetLocationSuffix)) {
                    let quantity = 0;
                    if (obj.quantities) {
                        const available = obj.quantities.find((q: any) => q.name === 'available');
                        if (available) quantity = available.quantity;
                    } else if (typeof obj.inventoryQuantity === 'number') {
                        quantity = obj.inventoryQuantity;
                    }
                    inventoryMap.set(obj.__parentId, quantity);
                }
            }

            // Collect every SKU (optional, for cross-location awareness)
            if (collectAllSkus && (obj.sku !== undefined || obj.price !== undefined) && obj.sku) {
                allSkusInShopify.add(obj.sku.toLowerCase());
            }
        } catch {
            // Ignore parse errors in pass 1
        }
    }

    return { inventoryMap, allSkusInShopify };
}

// ── Pass-2 helpers ──────────────────────────────────────────────────

function variantToProduct(
    obj: any,
    parentId: string,
    parent: any,
    inventory: number
): Product {
    return {
        id: parentId,
        variantId: obj.id,
        inventoryItemId: obj.inventoryItem?.id || '',
        handle: parent.handle,
        sku: obj.sku || '',
        name: parent.title,
        price: parseFloat(obj.price || '0'),
        inventory,
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
        option1Value:
            obj.selectedOptions?.find((o: any) => o.name === 'Option1')?.value || obj.option1,
        option2Name: null,
        option2Value:
            obj.selectedOptions?.find((o: any) => o.name === 'Option2')?.value || obj.option2,
        option3Name: null,
        option3Value:
            obj.selectedOptions?.find((o: any) => o.name === 'Option3')?.value || obj.option3,
        imageId: null,
        templateSuffix: parent.templateSuffix,
        locationIds: [],
    } as Product;
}

function resolveTargetLocationSuffix(locationId?: number): string {
    const id =
        locationId?.toString() ||
        process.env.GAMMA_WAREHOUSE_LOCATION_ID ||
        '93998154045';
    return `Location/${id}`;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Async generator that streams Product objects from a Shopify JSONL file,
 * filtered to variants stocked at the given location.
 */
export async function* parseJsonlGenerator(
    filePath: string,
    locationId?: number
): AsyncGenerator<Product> {
    const suffix = resolveTargetLocationSuffix(locationId);
    const { inventoryMap } = await buildInventoryMap(filePath, suffix, false);

    const stream = createReadStream(filePath);
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    const parentProducts = new Map<string, any>();

    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const obj = JSON.parse(line);

            if (obj.id?.includes('gid://shopify/Product/') && !obj.__parentId) {
                parentProducts.set(obj.id, {
                    title: obj.title,
                    handle: obj.handle,
                    bodyHtml: obj.bodyHtml,
                    vendor: obj.vendor,
                    productType: obj.productType,
                    tags: obj.tags ? obj.tags.join(', ') : '',
                    templateSuffix: obj.templateSuffix,
                });
            } else if (obj.sku !== undefined || obj.price !== undefined) {
                const parentId = obj.__parentId;
                const parent = parentProducts.get(parentId);
                if (!parent) continue;

                const variantId = obj.id;
                if (!variantId || !inventoryMap.has(variantId)) continue;

                yield variantToProduct(obj, parentId, parent, inventoryMap.get(variantId)!);
            }
        } catch (e) {
            logger.error('Error parsing JSONL line:', e);
        }
    }
}

/**
 * Parses a Shopify JSONL file and returns:
 *   - `products` – variants stocked at the given location
 *   - `allSkusInShopify` – every SKU present in the file (any location)
 */
export async function parseJsonlWithAllSkus(
    filePath: string,
    locationId?: number
): Promise<{ products: Product[]; allSkusInShopify: Set<string> }> {
    const suffix = resolveTargetLocationSuffix(locationId);
    const { inventoryMap, allSkusInShopify } = await buildInventoryMap(filePath, suffix, true);

    const stream = createReadStream(filePath);
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    const parentProducts = new Map<string, any>();
    const products: Product[] = [];

    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const obj = JSON.parse(line);

            if (obj.id?.includes('gid://shopify/Product/') && !obj.__parentId) {
                parentProducts.set(obj.id, {
                    title: obj.title,
                    handle: obj.handle,
                    bodyHtml: obj.bodyHtml,
                    vendor: obj.vendor,
                    productType: obj.productType,
                    tags: obj.tags ? obj.tags.join(', ') : '',
                    templateSuffix: obj.templateSuffix,
                });
            } else if (obj.sku !== undefined || obj.price !== undefined) {
                const parentId = obj.__parentId;
                const parent = parentProducts.get(parentId);
                if (!parent) continue;

                const variantId = obj.id;
                if (!variantId || !inventoryMap.has(variantId)) continue;

                products.push(variantToProduct(obj, parentId, parent, inventoryMap.get(variantId)!));
            }
        } catch (e) {
            logger.error('Error parsing JSONL line:', e);
        }
    }

    return { products, allSkusInShopify };
}
