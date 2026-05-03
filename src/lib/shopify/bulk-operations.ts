'use server';

import { Product } from '@/lib/types';
import { getShopifyGraphQLClient, sleep } from './client';
import { env } from '@/lib/env';
import {
  GET_CURRENT_BULK_OPERATION_QUERY,
  BULK_OPERATION_RUN_QUERY_MUTATION,
  convertWeightToGrams,
  createGraphQLResponseSchema,
  GetCurrentBulkOperationQuerySchema,
  BulkOperationRunQueryResponseSchema,
  ShopifyAPIError,
} from './types';
import { z } from 'zod';

export async function startProductExportBulkOperation(): Promise<{ id: string; status: string }> {
  const shopifyClient = getShopifyGraphQLClient();
  const CurrentOpResponseSchema = createGraphQLResponseSchema(GetCurrentBulkOperationQuerySchema);
  const RunQueryResponseSchema = createGraphQLResponseSchema(BulkOperationRunQueryResponseSchema);

  const rawCurrentOpResponse = await shopifyClient.request(GET_CURRENT_BULK_OPERATION_QUERY);
  const parsedCurrentOp = CurrentOpResponseSchema.parse(rawCurrentOpResponse);
  const currentOperation = parsedCurrentOp.data?.currentBulkOperation;

  if (currentOperation && (currentOperation.status === 'RUNNING' || currentOperation.status === 'CREATED')) {
    return { id: currentOperation.id, status: currentOperation.status };
  }

  const query = `
        query {
            products {
                edges {
                    node {
                        id
                        title
                        handle
                        vendor
                        productType
                        tags
                        bodyHtml
                        templateSuffix
                        variants {
                            edges {
                                node {
                                    id
                                    sku
                                    price
                                    compareAtPrice
                                    inventoryQuantity
                                    inventoryItem {
                                        id
                                        unitCost { amount }
                                        measurement {
                                            weight { value unit }
                                        }
                                        inventoryLevels(first: 5) {
                                            edges {
                                                node {
                                                    id
                                                    location { id }
                                                    quantities(names: ["available"]) {
                                                        name
                                                        quantity
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    image { id }
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

  const rawRunResponse = await shopifyClient.request(BULK_OPERATION_RUN_QUERY_MUTATION, {
    variables: { query },
  });

  const parsedRunResponse = RunQueryResponseSchema.parse(rawRunResponse);
  const bulkOperation = parsedRunResponse.data?.bulkOperationRunQuery?.bulkOperation;
  const userErrors = parsedRunResponse.data?.bulkOperationRunQuery?.userErrors;

  if (userErrors && userErrors.length > 0) {
    throw new ShopifyAPIError(userErrors);
  }

  if (!bulkOperation) {
    throw new Error('Could not start bulk operation.');
  }

  return bulkOperation;
}

export async function checkBulkOperationStatus(
  id: string
): Promise<{ id: string; status: string; resultUrl?: string }> {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(GetCurrentBulkOperationQuerySchema);

  const rawCurrentOpResponse = await shopifyClient.request(GET_CURRENT_BULK_OPERATION_QUERY);
  const parsedCurrentOp = ResponseSchema.parse(rawCurrentOpResponse);
  const operation = parsedCurrentOp.data?.currentBulkOperation;

  if (operation && operation.id !== id && operation.status === 'RUNNING') {
    return { id: id, status: 'RUNNING' };
  }

  if (operation && operation.id === id) {
    return { id: operation.id, status: operation.status, resultUrl: operation.url || undefined };
  }

  const specificOpQuery = `
      query getSpecificBulkOperation($id: ID!) {
        node(id: $id) {
          ... on BulkOperation {
            id
            status
            url
            errorCode
          }
        }
      }
    `;

  const SpecificOpSchema = createGraphQLResponseSchema(z.object({
    node: z.object({
      id: z.string(),
      status: z.string(),
      url: z.string().nullable().optional(),
      errorCode: z.string().nullable().optional(),
    }).nullable().optional()
  }));

  const rawSpecificOpResponse = await shopifyClient.request(specificOpQuery, { variables: { id } });
  const parsedSpecificOp = SpecificOpSchema.parse(rawSpecificOpResponse);
  const specificOperation = parsedSpecificOp.data?.node;

  if (specificOperation) {
    return {
      id: specificOperation.id,
      status: specificOperation.status,
      resultUrl: specificOperation.url || undefined,
    };
  }

  throw new Error(`Could not retrieve status for bulk operation ${id}.`);
}

/**
 * @deprecated Use downloadBulkOperationResultToFile and parseBulkOperationResult instead to avoid memory issues with large files.
 */
export async function getBulkOperationResult(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download bulk operation result from ${url}`);
  }
  return response.text();
}

export async function downloadBulkOperationResultToFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download bulk operation result from ${url}`);
  }
  if (!response.body) {
    throw new Error('Response body is empty');
  }

  const fs = await import('fs');
  const { pipeline } = await import('stream/promises');
  const { Readable } = await import('stream');

  const fileStream = fs.createWriteStream(destPath);

  // @ts-ignore - response.body compatibility
  await pipeline(Readable.fromWeb(response.body), fileStream);
}

import fs from 'fs';
import readline from 'readline';

export async function parseBulkOperationResult(filePath: string, locationId?: number): Promise<Product[]> {
  const products: Product[] = [];
  const parentProducts = new Map<string, any>();
  const locationMap = new Map<string, string[]>();
  const gammaInventoryMap = new Map<string, number>();

  // Pass 1: Build maps
  const fileStream1 = fs.createReadStream(filePath);
  const rl1 = readline.createInterface({ input: fileStream1, crlfDelay: Infinity });

  for await (const line of rl1) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      if (item.id && item.id.includes('gid://shopify/Product/')) {
        parentProducts.set(item.id, item);
      }

      if (item.location && item.location.id && item.__parentId) {
        if (!locationMap.has(item.__parentId)) {
          locationMap.set(item.__parentId, []);
        }
        locationMap.get(item.__parentId)?.push(item.location.id);

        const GAMMA_LOCATION_ID = locationId?.toString() || env.GAMMA_WAREHOUSE_LOCATION_ID.toString();
        if (item.location.id.endsWith(`Location/${GAMMA_LOCATION_ID}`)) {
          let quantity = 0;
          if (item.quantities) {
            const available = item.quantities.find((q: { name: string; quantity: number }) => q.name === 'available');
            if (available) {
              quantity = available.quantity;
            }
          } else if (typeof item.inventoryQuantity === 'number') {
            quantity = item.inventoryQuantity;
          }
          gammaInventoryMap.set(item.__parentId, quantity);
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Pass 2: Hydrate products
  const fileStream2 = fs.createReadStream(filePath);
  const rl2 = readline.createInterface({ input: fileStream2, crlfDelay: Infinity });

  for await (const line of rl2) {
    if (!line.trim()) continue;
    try {
      const shopifyProduct = JSON.parse(line);

      if (shopifyProduct.id && shopifyProduct.id.includes('gid://shopify/ProductVariant')) {
        const variantId = shopifyProduct.id;
        const sku = shopifyProduct.sku;
        const parentId = shopifyProduct.__parentId;
        const parentProduct = parentProducts.get(parentId);

        if (parentProduct && sku) {
          let locs = locationMap.get(variantId) || [];
          const inventoryItemId = shopifyProduct.inventoryItem?.id;

          if (locs.length === 0 && inventoryItemId) {
            locs = locationMap.get(inventoryItemId) || [];
          }

          let finalInventory = 0;
          if (inventoryItemId && gammaInventoryMap.has(inventoryItemId)) {
            finalInventory = gammaInventoryMap.get(inventoryItemId)!;
          }

          let hasGammaEntry = false;
          if (inventoryItemId && gammaInventoryMap.has(inventoryItemId)) {
            hasGammaEntry = true;
          }

          if (!hasGammaEntry) continue;

          products.push({
            id: parentProduct.id,
            variantId: variantId,
            barcode: shopifyProduct.barcode || null,
            inventoryItemId: inventoryItemId,
            handle: parentProduct.handle,
            sku: sku,
            name: parentProduct.title,
            price: parseFloat(shopifyProduct.price),
            inventory: finalInventory,
            descriptionHtml: parentProduct.bodyHtml,
            productType: parentProduct.productType,
            vendor: parentProduct.vendor,
            tags: (parentProduct.tags || []).join(', '),
            compareAtPrice: shopifyProduct.compareAtPrice ? parseFloat(shopifyProduct.compareAtPrice) : null,
            costPerItem: shopifyProduct.inventoryItem?.unitCost?.amount
              ? parseFloat(shopifyProduct.inventoryItem.unitCost.amount)
              : null,
            weight: shopifyProduct.inventoryItem?.measurement?.weight?.value
              ? convertWeightToGrams(
                parseFloat(shopifyProduct.inventoryItem.measurement.weight.value),
                shopifyProduct.inventoryItem.measurement.weight.unit
              )
              : null,
            mediaUrl: null,
            imageId: shopifyProduct.image?.id || null,
            category: null,
            option1Name: null,
            option1Value: null,
            option2Name: null,
            option2Value: null,
            option3Name: null,
            option3Value: null,
            templateSuffix: parentProduct.templateSuffix,
            locationIds: locs,
          });
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
  return products;
}
