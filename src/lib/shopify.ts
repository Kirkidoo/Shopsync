'use server';

import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { Product, ShopifyProductImage } from '@/lib/types';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const GAMMA_WAREHOUSE_LOCATION_ID = process.env.GAMMA_WAREHOUSE_LOCATION_ID
  ? parseInt(process.env.GAMMA_WAREHOUSE_LOCATION_ID, 10)
  : 93998154045;

// --- Zod Schemas ---



const ShopifyGraphQLErrorSchema = z.object({
  message: z.string(),
  locations: z.array(z.object({ line: z.number(), column: z.number() })).optional(),
  path: z.array(z.string().or(z.number())).optional(),
  extensions: z.object({
    code: z.string().optional(),
    documentation: z.string().optional(),
  }).optional(),
});

// Helper for generic GraphQL response validation
const createGraphQLResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
  data: dataSchema.optional(),
  errors: z.array(ShopifyGraphQLErrorSchema).optional(),
  extensions: z.object({
    cost: z.object({
      requestedQueryCost: z.number(),
      actualQueryCost: z.number(),
      throttleStatus: z.object({
        maximumAvailable: z.number(),
        currentlyAvailable: z.number(),
        restoreRate: z.number(),
      }),
    }).optional(),
  }).optional(),
});



// Specific GraphQL Response Schemas

const InventoryItemMeasurementSchema = z.object({
  weight: z.object({
    value: z.number(),
    unit: z.string(),
  }).nullable().optional(),
});

const InventoryLevelSchema = z.object({
  quantities: z.array(z.object({
    name: z.string(),
    quantity: z.number()
  })).optional(),
  location: z.object({
    id: z.string(),
  }),
});

const InventoryItemSchema = z.object({
  id: z.string(),
  measurement: InventoryItemMeasurementSchema.nullable().optional(),
  inventoryLevels: z.object({
    edges: z.array(z.object({ node: InventoryLevelSchema }))
  }).optional(),
});

const ProductVariantNodeSchema = z.object({
  id: z.string(),
  sku: z.string().nullable(), // SKU can be null
  price: z.string(),
  compareAtPrice: z.string().nullable().optional(),
  inventoryQuantity: z.number().optional(), // Available in some contexts
  inventoryItem: InventoryItemSchema.nullable().optional(),
  image: z.object({ id: z.string() }).nullable().optional(),
  product: z.object({
    id: z.string(),
    title: z.string(),
    handle: z.string(),
    bodyHtml: z.string().nullable().optional(),
    templateSuffix: z.string().nullable().optional(),
    tags: z.array(z.string()),
    featuredImage: z.object({ url: z.string() }).nullable().optional(),
  }),
});

const ProductVariantsEdgeSchema = z.object({
  node: ProductVariantNodeSchema
});

const GetVariantsBySkuQuerySchema = z.object({
  productVariants: z.object({
    edges: z.array(ProductVariantsEdgeSchema)
  })
});

const GetUpdatedProductsQuerySchema = z.object({
  products: z.object({
    edges: z.array(z.object({
      node: z.object({
        id: z.string(),
        title: z.string(),
        handle: z.string(),
        bodyHtml: z.string().nullable().optional(),
        vendor: z.string().nullable().optional(),
        productType: z.string().nullable().optional(),
        tags: z.array(z.string()),
        templateSuffix: z.string().nullable().optional(),
        featuredImage: z.object({ url: z.string() }).nullable().optional(),
        variants: z.object({
          edges: z.array(z.object({
            node: z.object({
              id: z.string(),
              sku: z.string().nullable(),
              price: z.string(),
              compareAtPrice: z.string().nullable().optional(),
              inventoryItem: InventoryItemSchema.nullable().optional(),
              image: z.object({ id: z.string() }).nullable().optional(),
            })
          }))
        })
      })
    })),
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullable().optional(),
    })
  })
});

// --- Helper function to introduce a delay ---
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isThrottleError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errorString = JSON.stringify(error);
    if (errorString.includes('Throttled') || errorString.includes('Exceeded 2 calls per second')) return true;
    if ('response' in error && (error as any).response?.statusCode === 429) return true;
    if (error instanceof Error && error.message.includes('Throttled')) return true;
  }
  return false;
}

// Global rate limiter state
let rateLimitState = {
  currentlyAvailable: 20000, // Default to user-reported high limit
  restoreRate: 100,
};

function updateRateLimitState(extensions: any) {
  if (extensions?.cost?.throttleStatus) {
    rateLimitState = {
      currentlyAvailable: extensions.cost.throttleStatus.currentlyAvailable,
      restoreRate: extensions.cost.throttleStatus.restoreRate,
    };
  }
}

async function checkRateLimit(cost = 100) {
  if (rateLimitState.currentlyAvailable < cost * 2) {
    const deficit = (cost * 2) - rateLimitState.currentlyAvailable;
    const waitTime = Math.ceil((deficit / rateLimitState.restoreRate) * 1000);
    logger.info(`Rate limit tight (Available: ${rateLimitState.currentlyAvailable}). Sleeping ${waitTime}ms...`);
    await sleep(waitTime);
  }
}

async function retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 8): Promise<T> {
  let retries = 0;
  while (true) {
    try {
      // Proactive rate limiting
      await checkRateLimit();

      const result = await operation();

      // Update rate limit state from result if available (GraphQL)
      // Note: REST client doesn't explicitly return extensions in the same way usually, need to check headers if possible (omitted for now due to library abstraction)
      if (result && typeof result === 'object' && 'extensions' in result) {
        updateRateLimitState((result as any).extensions);
      }

      return result;
    } catch (error: unknown) {
      if (isThrottleError(error) && retries < maxRetries) {
        const delay = 1000 * Math.pow(2, retries);
        // Retaining this log as it is operational info, not just debug
        logger.info(
          `Rate limited. Retrying in ${delay}ms... (Attempt ${retries + 1}/${maxRetries})`
        );
        await sleep(delay);
        retries++;

        // Reset local assumption of safety on error
        rateLimitState.currentlyAvailable = 0;
      } else {
        throw error;
      }
    }
  }
}



// --- GraphQL Queries & Mutations ---

const GET_VARIANTS_BY_SKU_QUERY = `
  query getVariantsBySku($query: String!) {
    productVariants(first: 250, query: $query) {
      edges {
        node {
          id
          sku
          price
          compareAtPrice
          inventoryQuantity
          inventoryItem {
            id
            measurement {
              weight {
                value
                unit
              }
            }
            inventoryLevels(first: 50) {
              edges {
                node {
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                  location {
                    id
                  }
                }
              }
            }
          }
          image {
            id
          }
          product {
            id
            title
            handle
            bodyHtml
            templateSuffix
            tags
            featuredImage {
              url
            }
          }
        }
      }
    }
  }
`;

const GET_PRODUCT_BY_HANDLE_QUERY = `
  query getProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      handle
      images(first: 100) {
        edges {
            node {
                id
                url
            }
        }
      }
    }
  }
`;

const GET_COLLECTION_BY_TITLE_QUERY = `
  query getCollectionByTitle($query: String!) {
    collections(first: 1, query: $query) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

const GET_ALL_PUBLICATIONS_QUERY = `
  query getPublications {
    publications(first: 50) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

const PUBLISHABLE_PUBLISH_MUTATION = `
  mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      publishable {
        ... on Product {
          availablePublicationsCount {
            count
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_PRODUCT_MUTATION = `
    mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
            product {
                id
            }
            userErrors {
                field
                message
            }
        }
    }
`;

const GET_UPDATED_PRODUCTS_QUERY = `
  query getUpdatedProducts($query: String!, $cursor: String) {
    products(first: 5, query: $query, after: $cursor) {
      edges {
        node {
          id
          title
          handle
          bodyHtml
          vendor
          productType
          tags
          templateSuffix
          featuredImage {
            url
          }
          variants(first: 20) {
            edges {
              node {
                id
                sku
                price
                compareAtPrice
                inventoryItem {
                  id
                  measurement {
                    weight {
                      value
                      unit
                    }
                  }
                  inventoryLevels(first: 5) {
                    edges {
                      node {
                        quantities(names: ["available"]) {
                          name
                          quantity
                        }
                        location {
                          id
                        }
                      }
                    }
                  }
                }
                image {
                  id
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const BULK_OPERATION_RUN_QUERY_MUTATION = `
  mutation bulkOperationRunQuery($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GET_CURRENT_BULK_OPERATION_QUERY = `
  query {
    currentBulkOperation {
      id
      status
      errorCode
      createdAt
      completedAt
      objectCount
      fileSize
      url
    }
  }
`;

const ADD_TAGS_MUTATION = `
  mutation tagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const REMOVE_TAGS_MUTATION = `
  mutation tagsRemove($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const INVENTORY_SET_QUANTITIES_MUTATION = `
    mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
            inventoryAdjustmentGroup {
                id
            }
            userErrors {
                field
                message
                code
            }
        }
    }
`;

// --- Client Initialization ---

function getShopifyGraphQLClient() {
  if (!process.env.SHOPIFY_SHOP_NAME || !process.env.SHOPIFY_API_ACCESS_TOKEN) {
    logger.error('Shopify environment variables are not set.');
    throw new Error('Shopify environment variables are not set. Please create a .env.local file.');
  }

  const shopify = shopifyApi({
    apiKey: 'dummy',
    apiSecretKey: 'dummy',
    scopes: [
      'read_products',
      'write_products',
      'read_inventory',
      'write_inventory',
      'read_locations',
    ],
    hostName: 'dummy.ngrok.io',
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: false,
    maxRetries: 3,
    future: {
      lineItemBilling: true,
    },
  });

  const session = new Session({
    id: 'offline_' + process.env.SHOPIFY_SHOP_NAME,
    shop: process.env.SHOPIFY_SHOP_NAME!,
    accessToken: process.env.SHOPIFY_API_ACCESS_TOKEN!,
    isOnline: false,
    state: 'state',
  });

  return new shopify.clients.Graphql({ session });
}



// --- Data Fetching Functions ---

const convertWeightToGrams = (
  weight: number | null | undefined,
  unit: string | null | undefined
): number | null => {
  if (weight === null || weight === undefined) return null;
  const upperUnit = unit?.toUpperCase();
  if (upperUnit === 'G' || upperUnit === 'GRAMS') return weight;
  if (upperUnit === 'KG' || upperUnit === 'KILOGRAMS') return weight * 1000;
  if (upperUnit === 'LB' || upperUnit === 'POUNDS') return weight * 453.592;
  if (upperUnit === 'OZ' || upperUnit === 'OUNCES') return weight * 28.3495;
  return weight; // Default to returning the value if unit is unknown or missing
};

export async function getShopifyProductsBySku(skus: string[], locationId?: number): Promise<Product[]> {
  const shopifyClient = getShopifyGraphQLClient();
  const allProducts: Product[] = [];

  // Use Zod schema for response parsing
  const ResponseSchema = createGraphQLResponseSchema(GetVariantsBySkuQuerySchema);

  const skuBatches: string[][] = [];
  for (let i = 0; i < skus.length; i += 10) {
    skuBatches.push(skus.slice(i, i + 10));
  }

  const processBatch = async (batch: string[]) => {
    // Escape quotes in SKUs to prevent query syntax errors
    const query = batch.map((sku) => `sku:"${sku.replace(/"/g, '\\"')}"`).join(' OR ');

    let retries = 0;
    let success = false;
    const batchProducts: Product[] = [];

    while (retries < 5 && !success) {
      try {
        if (retries > 0) {
          await sleep(1000 * Math.pow(2, retries));
        } else {
          await sleep(200);
        }

        const rawResponse = await shopifyClient.request(GET_VARIANTS_BY_SKU_QUERY, {
          variables: { query },
        });

        // Validate response with Zod
        const parsedResponse = ResponseSchema.parse(rawResponse);

        if (parsedResponse.errors) {
          const errorString = JSON.stringify(parsedResponse.errors);
          if (errorString.includes('Throttled')) {
            logger.info(`Throttled by Shopify on batch, backing off... (Attempt ${retries + 1})`);
            retries++;
            continue;
          }
          throw new Error(`Non-recoverable GraphQL error: ${errorString}`);
        }

        const variantEdges = parsedResponse.data?.productVariants?.edges || [];

        for (const edge of variantEdges) {
          const variant = edge.node;
          const product = variant.product;

          if (variant && variant.sku && product) {
            let locationInventory = 0;
            // Gamma Warehouse ID: 93998154045
            const GAMMA_LOCATION_ID = locationId?.toString() || process.env.GAMMA_WAREHOUSE_LOCATION_ID || '93998154045';
            const TARGET_LOCATION_GID = `gid://shopify/Location/${GAMMA_LOCATION_ID}`;

            if (variant.inventoryItem?.inventoryLevels?.edges) {
              for (const levelEdge of variant.inventoryItem.inventoryLevels.edges) {
                if (levelEdge.node.location.id === TARGET_LOCATION_GID) {
                  const available = levelEdge.node.quantities?.find(q => q.name === 'available');
                  if (available) {
                    locationInventory = available.quantity;
                  }
                  break; // Found the location, no need to continue
                }
              }
            }

            batchProducts.push({
              id: product.id,
              variantId: variant.id,
              inventoryItemId: variant.inventoryItem?.id || '',
              handle: product.handle,
              sku: variant.sku,
              name: product.title,
              price: parseFloat(variant.price),
              inventory: locationInventory,
              descriptionHtml: product.bodyHtml || null,
              productType: null,
              vendor: null,
              tags: product.tags.join(', '),
              compareAtPrice: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
              costPerItem: null,
              barcode: null,
              weight: convertWeightToGrams(
                variant.inventoryItem?.measurement?.weight?.value,
                variant.inventoryItem?.measurement?.weight?.unit
              ),
              mediaUrl: product.featuredImage?.url || null,
              imageId: variant.image?.id || null,
              category: null,
              option1Name: null,
              option1Value: null,
              option2Name: null,
              option2Value: null,
              option3Name: null,
              option3Value: null,
              templateSuffix: product.templateSuffix || null,
              locationIds:
                variant.inventoryItem?.inventoryLevels?.edges?.map(
                  (edge) => edge.node.location.id
                ) || [],
            });
          }
        }
        success = true;
      } catch (error: unknown) {
        if (isThrottleError(error)) {
          logger.info(`Caught throttled error, backing off... (Attempt ${retries + 1})`);
          retries++;
        } else {
          logger.error('An unexpected error occurred while fetching a batch. Aborting.', error);
          throw error;
        }
      }
    }
    if (!success) {
      throw new Error(`Failed to fetch batch after ${retries} retries. Aborting audit.`);
    }
    return batchProducts;
  };

  const CONCURRENCY_LIMIT = 20;
  const queue = [...skuBatches];

  const worker = async () => {
    while (queue.length > 0) {
      const batch = queue.shift();
      if (batch) {
        const results = await processBatch(batch);
        allProducts.push(...results);
      }
    }
  };

  const workers = Array(Math.min(skuBatches.length, CONCURRENCY_LIMIT)).fill(null).map(worker);
  await Promise.all(workers);

  const requestedSkuSetLower = new Set(
    Array.from(new Set(skus)).map((s) => s.trim().toLowerCase())
  );

  // Re-filtering for exact matches logic preserved
  const exactMatchProducts = allProducts.filter((p) =>
    requestedSkuSetLower.has(p.sku.trim().toLowerCase())
  );

  // Verification logic (simplifying but keeping essential fallback)
  const foundSkusLower = new Set(exactMatchProducts.map((p) => p.sku.trim().toLowerCase()));
  const missingSkus = Array.from(new Set(skus)).filter(
    (sku) => !foundSkusLower.has(sku.trim().toLowerCase())
  );

  if (missingSkus.length > 0) {
    // Simplified verification without verbose logs
    const verifySku = async (sku: string) => {
      try {
        const query = `sku:"${sku.replace(/"/g, '\\"')}"`;
        const rawResponse = await shopifyClient.request(GET_VARIANTS_BY_SKU_QUERY, { variables: { query } });
        const parsed = ResponseSchema.parse(rawResponse);
        const edges = parsed.data?.productVariants?.edges || [];
        const match = edges.find(
          (e) => e.node.sku?.trim().toLowerCase() === sku.trim().toLowerCase()
        );
        return match?.node;
      } catch (e) { return null; }
    };

    const VERIFY_CONCURRENCY = 10;
    const verifyQueue = [...missingSkus];
    const verifiedProducts: Product[] = [];

    const verifyWorker = async () => {
      while (verifyQueue.length > 0) {
        const sku = verifyQueue.shift();
        if (sku) {
          await sleep(250);
          const node = await verifySku(sku);
          if (node && node.product && node.sku) {
            let locationInventory = 0;
            const GAMMA_LOCATION_ID = locationId?.toString() || process.env.GAMMA_WAREHOUSE_LOCATION_ID || '93998154045';
            const TARGET_LOCATION_GID = `gid://shopify/Location/${GAMMA_LOCATION_ID}`;

            if (node.inventoryItem?.inventoryLevels?.edges) {
              for (const levelEdge of node.inventoryItem.inventoryLevels.edges) {
                if (levelEdge.node.location.id === TARGET_LOCATION_GID) {
                  const available = levelEdge.node.quantities?.find((q: any) => q.name === 'available');
                  if (available) {
                    locationInventory = available.quantity;
                  }
                  break;
                }
              }
            }

            const product = node.product;
            verifiedProducts.push({
              id: product.id,
              variantId: node.id,
              inventoryItemId: node.inventoryItem?.id || '',
              handle: product.handle,
              sku: node.sku,
              name: product.title,
              price: parseFloat(node.price),
              inventory: locationInventory,
              descriptionHtml: product.bodyHtml || null,
              productType: null,
              vendor: null,
              tags: product.tags.join(', '),
              compareAtPrice: node.compareAtPrice ? parseFloat(node.compareAtPrice) : null,
              costPerItem: null,
              barcode: null,
              weight: convertWeightToGrams(
                node.inventoryItem?.measurement?.weight?.value,
                node.inventoryItem?.measurement?.weight?.unit
              ),
              mediaUrl: product.featuredImage?.url || null,
              imageId: node.image?.id || null,
              category: null,
              option1Name: null,
              option1Value: null,
              option2Name: null,
              option2Value: null,
              option3Name: null,
              option3Value: null,
              templateSuffix: product.templateSuffix || null,
              locationIds: [], // omit location fetch for verification to save calls
            });
          }
        }
      }
    };

    const verifyWorkers = Array(Math.min(missingSkus.length, VERIFY_CONCURRENCY)).fill(null).map(verifyWorker);
    await Promise.all(verifyWorkers);
    if (verifiedProducts.length > 0) {
      exactMatchProducts.push(...verifiedProducts);
    }
  }

  return exactMatchProducts;
}

/**
 * Fetches Shopify products that have a specific tag.
 * Used for stale clearance detection to find products with "Clearance" tag.
 */
export async function getShopifyProductsByTag(tag: string, locationId?: number): Promise<Product[]> {
  const shopifyClient = getShopifyGraphQLClient();
  const allProducts: Product[] = [];

  // Use Zod schema for response parsing
  const ResponseSchema = createGraphQLResponseSchema(GetVariantsBySkuQuerySchema);

  // Query for products with the specific tag
  const query = `tag:"${tag.replace(/"/g, '\\"')}"`;

  let retries = 0;
  let success = false;
  let cursor: string | null = null;
  const seenSkus = new Set<string>();

  while (!success || cursor) {
    try {
      if (retries > 0) {
        await sleep(1000 * Math.pow(2, retries));
      } else {
        await sleep(200);
      }

      // Use pagination to get all products with this tag
      const paginatedQuery = cursor
        ? `query getVariantsByTag($query: String!, $after: String) {
            productVariants(first: 250, query: $query, after: $after) {
              edges {
                node {
                  id
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                  inventoryItem {
                    id
                    measurement {
                      weight {
                        value
                        unit
                      }
                    }
                    inventoryLevels(first: 50) {
                      edges {
                        node {
                          quantities(names: ["available"]) {
                            name
                            quantity
                          }
                          location {
                            id
                          }
                        }
                      }
                    }
                  }
                  image {
                    id
                  }
                  product {
                    id
                    title
                    handle
                    bodyHtml
                    templateSuffix
                    tags
                    featuredImage {
                      url
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }`
        : GET_VARIANTS_BY_SKU_QUERY;

      const rawResponse = await shopifyClient.request(cursor ? paginatedQuery : GET_VARIANTS_BY_SKU_QUERY, {
        variables: cursor ? { query, after: cursor } : { query },
      });

      // Parse response with extended schema for pagination
      const parsedResponse = ResponseSchema.parse(rawResponse);

      if (parsedResponse.errors) {
        const errorString = JSON.stringify(parsedResponse.errors);
        if (errorString.includes('Throttled')) {
          logger.info(`Throttled by Shopify on tag query, backing off... (Attempt ${retries + 1})`);
          retries++;
          continue;
        }
        throw new Error(`Non-recoverable GraphQL error: ${errorString}`);
      }

      const variantEdges = parsedResponse.data?.productVariants?.edges || [];

      for (const edge of variantEdges) {
        const variant = edge.node;
        const product = variant.product;

        if (variant && variant.sku && product) {
          // Skip if we've already seen this SKU
          if (seenSkus.has(variant.sku.toLowerCase())) continue;
          seenSkus.add(variant.sku.toLowerCase());

          let locationInventory = 0;
          // let isAtLocation = false; // No longer needed as we include 0 inventory
          const TARGET_LOCATION_ID = locationId?.toString() || process.env.GAMMA_WAREHOUSE_LOCATION_ID || '93998154045';
          const TARGET_LOCATION_GID = `gid://shopify/Location/${TARGET_LOCATION_ID}`;

          if (variant.inventoryItem?.inventoryLevels?.edges) {
            for (const levelEdge of variant.inventoryItem.inventoryLevels.edges) {
              if (levelEdge.node.location.id === TARGET_LOCATION_GID) {
                const available = levelEdge.node.quantities?.find(q => q.name === 'available');
                if (available) {
                  locationInventory = available.quantity;
                }
                // isAtLocation = true; // No longer needed
                break;
              }
            }
          }

          // if (!isAtLocation) continue; // Removed to include variants with 0 inventory at location

          allProducts.push({
            id: product.id,
            variantId: variant.id,
            inventoryItemId: variant.inventoryItem?.id || '',
            handle: product.handle,
            sku: variant.sku,
            name: product.title,
            price: parseFloat(variant.price),
            inventory: locationInventory,
            descriptionHtml: product.bodyHtml || null,
            productType: null,
            vendor: null,
            tags: product.tags.join(', '),
            compareAtPrice: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
            costPerItem: null,
            barcode: null,
            weight: convertWeightToGrams(
              variant.inventoryItem?.measurement?.weight?.value,
              variant.inventoryItem?.measurement?.weight?.unit
            ),
            mediaUrl: product.featuredImage?.url || null,
            imageId: variant.image?.id || null,
            category: null,
            option1Name: null,
            option1Value: null,
            option2Name: null,
            option2Value: null,
            option3Name: null,
            option3Value: null,
            templateSuffix: product.templateSuffix || null,
            locationIds:
              variant.inventoryItem?.inventoryLevels?.edges?.map(
                (edge) => edge.node.location.id
              ) || [],
          });
        }
      }

      success = true;

      // Check for pagination (this is a simplified version - the base query doesn't have pageInfo)
      // For now, just process one page since tag queries typically return fewer results
      cursor = null;
    } catch (error: unknown) {
      if (isThrottleError(error)) {
        logger.info(`Caught throttled error, backing off... (Attempt ${retries + 1})`);
        retries++;
      } else {
        logger.error('An unexpected error occurred while fetching products by tag. Aborting.', error);
        throw error;
      }
    }
  }

  logger.info(`Found ${allProducts.length} products with tag "${tag}" at selected location`);
  return allProducts;
}

/**
 * Fetches Shopify products updated since the given lastSyncDate.
 */
export async function syncUpdatedProducts(
  lastSyncDate: string,
  locationId?: number,
  abortThreshold: number = 2000
): Promise<Product[]> {
  const shopifyClient = getShopifyGraphQLClient();
  const allProducts: Product[] = [];
  const query = `updated_at:>='${lastSyncDate}'`;
  let cursor: string | null = null;
  let hasNextPage = true;

  logger.info(`Starting incremental sync for products updated since ${lastSyncDate} (Threshold: ${abortThreshold})`);

  while (hasNextPage) {
    try {
      const ResponseSchema = createGraphQLResponseSchema(GetUpdatedProductsQuerySchema);
      const response = await retryOperation(async () => {
        return await shopifyClient.request(GET_UPDATED_PRODUCTS_QUERY, {
          variables: { query, cursor },
        });
      });

      const parsedResponse = ResponseSchema.parse(response);
      const productEdges = parsedResponse.data?.products?.edges || [];

      for (const edge of productEdges) {
        const productNode = edge.node;
        const variantEdges = productNode.variants?.edges || [];

        for (const variantEdge of variantEdges) {
          const variant = variantEdge.node;

          let locationInventory = 0;
          const TARGET_LOCATION_ID = locationId?.toString() || process.env.GAMMA_WAREHOUSE_LOCATION_ID || '93998154045';
          const TARGET_LOCATION_GID = `gid://shopify/Location/${TARGET_LOCATION_ID}`;

          if (variant.inventoryItem?.inventoryLevels?.edges) {
            for (const levelEdge of variant.inventoryItem.inventoryLevels.edges) {
              if (levelEdge.node.location.id === TARGET_LOCATION_GID) {
                const available = levelEdge.node.quantities?.find((q: any) => q.name === 'available');
                if (available) {
                  locationInventory = available.quantity;
                }
                break;
              }
            }
          }

          allProducts.push({
            id: productNode.id,
            variantId: variant.id,
            inventoryItemId: variant.inventoryItem?.id || '',
            handle: productNode.handle,
            sku: variant.sku || '',
            name: productNode.title,
            price: parseFloat(variant.price),
            inventory: locationInventory,
            descriptionHtml: productNode.bodyHtml || null,
            productType: productNode.productType || null,
            vendor: productNode.vendor || null,
            tags: productNode.tags.join(', '),
            compareAtPrice: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
            costPerItem: null,
            barcode: null,
            weight: convertWeightToGrams(
              variant.inventoryItem?.measurement?.weight?.value,
              variant.inventoryItem?.measurement?.weight?.unit
            ),
            mediaUrl: productNode.featuredImage?.url || null,
            imageId: variant.image?.id || null,
            category: null,
            option1Name: null,
            option1Value: null,
            option2Name: null,
            option2Value: null,
            option3Name: null,
            option3Value: null,
            templateSuffix: productNode.templateSuffix || null,
            locationIds:
              variant.inventoryItem?.inventoryLevels?.edges?.map(
                (edge: any) => edge.node.location.id
              ) || [],
          });
        }
      }

      // Circuit Breaker Check
      if (allProducts.length > abortThreshold) {
        logger.warn(`Incremental sync aborted: ${allProducts.length} updates encountered, exceeding threshold of ${abortThreshold}.`);
        throw new Error('TOO_MANY_UPDATES');
      }

      hasNextPage = parsedResponse.data?.products?.pageInfo.hasNextPage || false;
      cursor = parsedResponse.data?.products?.pageInfo.endCursor || null;

    } catch (error) {
      if (error instanceof Error && error.message === 'TOO_MANY_UPDATES') {
        throw error;
      }
      logger.error('Error during incremental sync:', error);
      throw error;
    }
  }

  logger.info(`Incremental sync completed. Found ${allProducts.length} updated variants at target location.`);
  return allProducts;
}

const GET_LOCATIONS_QUERY = `
  query getLocations {
    locations(first: 250) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

export async function getShopifyLocations(): Promise<{ id: string; name: string }[]> {
  const shopifyClient = getShopifyGraphQLClient();

  try {
    const response = await retryOperation(async () => {
      return await shopifyClient.request(GET_LOCATIONS_QUERY);
    });

    const edges = (response as any).data?.locations?.edges || [];
    const locations = edges.map((edge: any) => ({
      id: edge.node.id,
      name: edge.node.name
    }));

    return locations;
  } catch (error: unknown) {
    logger.error('Error fetching Shopify locations:', error);
    throw new Error('Failed to fetch locations');
  }
}

export async function getProductByHandle(handle: string): Promise<any> {
  // Returning any here as the UI might expect raw GQL shape, but ideally we return typed object.
  // Keeping logic similar but using Zod validation
  const shopifyClient = getShopifyGraphQLClient();
  // Simplified schema for what's needed
  const Schema = createGraphQLResponseSchema(z.object({
    productByHandle: z.any()
  }));
  try {
    const response = await shopifyClient.request(GET_PRODUCT_BY_HANDLE_QUERY, {
      variables: { handle },
    });
    const parsed = Schema.parse(response);
    return parsed.data?.productByHandle;
  } catch (error) {
    logger.error(`Error fetching product by handle "${handle}":`, error);
    return null;
  }
}

// --- Data Mutation Functions ---

const PRODUCT_SET_MUTATION = `
  mutation productSet($synchronous: Boolean!, $input: ProductSetInput!) {
    productSet(synchronous: $synchronous, input: $input) {
      product {
        id
        title
        handle
        vendor
        productType
        tags
        bodyHtml
        templateSuffix
        status
        variants(first: 250) {
          edges {
            node {
              id
              sku
              inventoryItem {
                id
              }
            }
          }
        }
        images(first: 250) {
          edges {
            node {
              id
              url
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function createProduct(
  productVariants: Product[],
  addClearanceTag: boolean
) {
  const shopifyClient = getShopifyGraphQLClient();
  const firstVariant = productVariants[0];

  const sanitizedDescription = firstVariant.descriptionHtml
    ? firstVariant.descriptionHtml.replace(/<h1/gi, '<h2').replace(/<\/h1>/gi, '</h2>')
    : '';

  const isSingleDefaultVariant =
    productVariants.length === 1 &&
    firstVariant.option1Name === 'Title' &&
    firstVariant.option1Value === 'Default Title';

  const getOptionValue = (value: string | null | undefined, fallback: string | null) =>
    value?.trim() ? value.trim() : fallback;

  const processedVariants = structuredClone(productVariants);
  const seenOptionValues = new Set<string>();

  for (const variant of processedVariants) {
    const optionKey = [variant.option1Value, variant.option2Value, variant.option3Value].filter(Boolean).join('/');
    if (seenOptionValues.has(optionKey) && optionKey && optionKey !== 'Default Title') {
      if (variant.option1Value) variant.option1Value = `${variant.option1Value} (${variant.sku})`;
    }
    if (optionKey) seenOptionValues.add(optionKey);
  }

  const optionNames: string[] = [];
  if (isSingleDefaultVariant) {
    optionNames.push('Title');
  } else {
    if (firstVariant.option1Name) optionNames.push(firstVariant.option1Name);
    if (firstVariant.option2Name) optionNames.push(firstVariant.option2Name);
    if (firstVariant.option3Name) optionNames.push(firstVariant.option3Name);
  }

  const gqlOptions = optionNames.length > 0
    ? optionNames.map(name => {
      // Collect all unique string values for this option across all variants
      const values = new Set<string>();
      if (isSingleDefaultVariant) {
        values.add('Default Title');
      } else {
        for (const p of processedVariants) {
          if (name === firstVariant.option1Name) values.add(getOptionValue(p.option1Value, p.sku || 'Default')!);
          if (name === firstVariant.option2Name) values.add(getOptionValue(p.option2Value, 'Default')!);
          if (name === firstVariant.option3Name) values.add(getOptionValue(p.option3Value, 'Default')!);
        }
      }
      return { name, values: Array.from(values).map(v => ({ name: v })) };
    })
    : undefined;

  const gqlVariants = processedVariants.map((p: Product) => {
    const variantInput: any = {
      price: p.price.toString(),
      sku: p.sku,
      barcode: p.barcode,
      compareAtPrice: p.compareAtPrice?.toString(),
      inventoryItem: {
        tracked: true,
        measurement: {
          weight: {
            value: p.weight || 0,
            unit: 'GRAMS'
          }
        }
      }
    };

    if (p.costPerItem) {
      variantInput.inventoryItem.cost = p.costPerItem.toString();
    }

    const optionValues = [];
    if (isSingleDefaultVariant) {
      optionValues.push({ optionName: 'Title', name: 'Default Title' });
    } else {
      if (firstVariant.option1Name) optionValues.push({ optionName: firstVariant.option1Name, name: getOptionValue(p.option1Value, p.sku || 'Default') });
      if (firstVariant.option2Name) optionValues.push({ optionName: firstVariant.option2Name, name: getOptionValue(p.option2Value, 'Default') });
      if (firstVariant.option3Name) optionValues.push({ optionName: firstVariant.option3Name, name: getOptionValue(p.option3Value, 'Default') });
    }
    variantInput.optionValues = optionValues;

    return variantInput;
  });

  // Media
  const uniqueImageUrls = [...new Set(processedVariants.map((p: Product) => p.mediaUrl).filter(Boolean) as string[])];
  const gqlFiles = uniqueImageUrls.map((url) => ({
    originalSource: url,
    contentType: "IMAGE"
  }));

  let tags = firstVariant.tags || '';
  if (tags) {
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 3) tags = tagList.slice(0, 3).join(', ');
  }
  if (firstVariant.category) tags = tags ? `${tags}, ${firstVariant.category}` : firstVariant.category;
  if (addClearanceTag && !tags.toLowerCase().includes('clearance')) tags = tags ? `Clearance, ${tags}` : 'Clearance';

  const isHeavy = productVariants.some((p) => p.weight && p.weight > 22679.6);
  let templateSuffix: string | undefined = undefined;
  if (addClearanceTag) templateSuffix = 'clearance';
  else if (isHeavy) templateSuffix = 'heavy-products';

  const productSetInput: any = {
    title: firstVariant.name,
    handle: firstVariant.handle,
    descriptionHtml: sanitizedDescription,
    vendor: firstVariant.vendor,
    productType: firstVariant.productType,
    status: 'ACTIVE',
    tags: tags ? tags.split(',').map(t => t.trim()) : [],
    variants: gqlVariants,
  };

  if (gqlOptions) productSetInput.productOptions = gqlOptions;
  if (gqlFiles.length > 0) productSetInput.files = gqlFiles;
  if (templateSuffix) productSetInput.templateSuffix = templateSuffix;

  try {
    const response = await retryOperation(async () => {
      // productSet requires synchronous: true to ensure product+variants are ready
      return await shopifyClient.request(PRODUCT_SET_MUTATION, {
        variables: { synchronous: true, input: productSetInput },
      });
    });

    const userErrors = (response as any).data?.productSet?.userErrors;
    if (userErrors && userErrors.length > 0) {
      throw new Error(`GraphQL productSet userErrors: ${JSON.stringify(userErrors)}`);
    }

    const createdGqlProduct = (response as any).data?.productSet?.product;

    // Transform back to expected REST shape.
    return {
      id: createdGqlProduct.id,
      variants: createdGqlProduct.variants.edges.map((edge: any) => ({
        id: edge.node.id,
        sku: edge.node.sku,
        inventory_item_id: edge.node.inventoryItem?.id || null
      })),
      images: createdGqlProduct.images.edges.map((edge: any) => ({
        id: edge.node.id,
        src: edge.node.url
      }))
    } as any;
  } catch (error: unknown) {
    console.error('Error creating product:', error);
    throw new Error(`Failed to create product`);
  }
}

const PRODUCT_VARIANT_CREATE_MUTATION = `
  mutation productVariantCreate($input: ProductVariantInput!) {
    productVariantCreate(input: $input) {
      productVariant {
        id
        sku
        price
        compareAtPrice
        inventoryItem {
          id
        }
        product {
          id
          title
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function addProductVariant(product: Product): Promise<any> {
  const graphQLClient = getShopifyGraphQLClient();

  // Find product by handle to get GID and existing options
  const productResponse = await graphQLClient.request(GET_PRODUCT_BY_HANDLE_QUERY, {
    variables: { handle: product.handle },
  });

  const productByHandle = (productResponse as any).data?.productByHandle;
  const productGid = productByHandle?.id;

  if (!productGid) {
    throw new Error(`Could not find product with handle ${product.handle} to add variant to.`);
  }

  // No numeric ID needed anymore
  const existingImages = productByHandle?.images?.edges.map((e: any) => e.node) || [];

  const getOptionValue = (value: string | null | undefined, fallback: string | null) =>
    value?.trim() ? value.trim() : fallback;

  let imageIdGid = product.imageId ? `gid://shopify/MediaImage/${product.imageId}` : null;

  if (product.mediaUrl && !imageIdGid) {
    const imageFilename = product.mediaUrl.split('/').pop()?.split('?')[0];
    const existingImage = existingImages.find((img: any) =>
      img.url.includes(imageFilename as string)
    );

    if (existingImage) {
      // Ensure we have a MedaImage GID
      imageIdGid = existingImage.id;
    } else {
      try {
        const newImage = await addProductImage(productGid, product.mediaUrl);
        imageIdGid = `gid://shopify/MediaImage/${newImage.id}`;
      } catch (error) {
        console.warn(`Failed to upload image from URL ${product.mediaUrl}.`);
      }
    }
  }

  const variantInput: any = {
    productId: productGid,
    price: product.price.toString(),
    sku: product.sku,
    barcode: product.barcode,
    compareAtPrice: product.compareAtPrice?.toString(),
    mediaId: imageIdGid,
    inventoryItem: {
      tracked: true,
      measurement: {
        weight: {
          value: product.weight || 0,
          unit: 'GRAMS'
        }
      }
    }
  };

  if (product.costPerItem) {
    variantInput.inventoryItem.cost = product.costPerItem.toString();
  }

  const option1 = getOptionValue(product.option1Value, product.sku);
  const option2 = getOptionValue(product.option2Value, null);
  const option3 = getOptionValue(product.option3Value, null);

  const positionalOptions = [option1, option2, option3].filter(Boolean) as string[];
  if (positionalOptions.length > 0) {
    variantInput.options = positionalOptions;
  }

  try {
    const response = await retryOperation(async () => {
      return await graphQLClient.request(PRODUCT_VARIANT_CREATE_MUTATION, {
        variables: { input: variantInput },
      });
    });

    const userErrors = (response as any).data?.productVariantCreate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      throw new Error(`GraphQL productVariantCreate userErrors: ${JSON.stringify(userErrors)}`);
    }

    // Since product-actions.ts needs a full product returned:
    return await getFullProduct(productGid);
  } catch (error: unknown) {
    console.error('Error adding variant:', error);
    throw new Error(`Failed to add variant`);
  }
}

export async function updateProduct(
  id: string,
  input: { title?: string; bodyHtml?: string; templateSuffix?: string; tags?: string }
) {
  const shopifyClient = getShopifyGraphQLClient();

  // Ensure id is a GID if not already
  if (!id.includes('gid://shopify/Product/')) {
    id = `gid://shopify/Product/${id}`;
  }

  const payload: any = { id };

  if (input.bodyHtml !== undefined) payload.bodyHtml = input.bodyHtml;
  if (input.title !== undefined) payload.title = input.title;
  if (input.templateSuffix !== undefined) payload.templateSuffix = input.templateSuffix;
  if (input.tags !== undefined) payload.tags = input.tags;

  try {
    const response = await retryOperation(async () => {
      return await shopifyClient.request(UPDATE_PRODUCT_MUTATION, {
        variables: { input: payload },
      });
    });
    const userErrors = (response as any).data?.productUpdate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      throw new Error(`GraphQL productUpdate userErrors: ${JSON.stringify(userErrors)}`);
    }
    return (response as any).data?.productUpdate?.product;
  } catch (error: unknown) {
    console.error('Error updating product:', error);
    throw new Error(`Failed to update product`);
  }
}

const UPDATE_PRODUCT_VARIANT_MUTATION = `
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function updateProductVariant(
  productId: string,
  variantId: string | number,
  input: { image_id?: string | null; price?: number; compare_at_price?: number | null; weight?: number; weight_unit?: 'g' | 'lb' }
) {
  const shopifyClient = getShopifyGraphQLClient();

  const payload: any = {
    id: variantId.toString().includes('gid://') ? variantId.toString() : `gid://shopify/ProductVariant/${variantId}`
  };

  if (input.image_id !== undefined) payload.mediaId = input.image_id;
  if (input.price !== undefined) payload.price = input.price;
  if (input.compare_at_price !== undefined) payload.compareAtPrice = input.compare_at_price !== null ? input.compare_at_price : null;

  if (input.weight !== undefined) {
    payload.inventoryItem = {
      measurement: {
        weight: {
          value: input.weight,
          unit: input.weight_unit === 'lb' ? 'POUNDS' : 'GRAMS'
        }
      }
    };
  }

  try {
    const response = await retryOperation(async () => {
      return await shopifyClient.request(UPDATE_PRODUCT_VARIANT_MUTATION, {
        variables: {
          productId: productId.includes('gid://') ? productId : `gid://shopify/Product/${productId}`,
          variants: [payload]
        },
      });
    });

    const userErrors = (response as any).data?.productVariantsBulkUpdate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      throw new Error(`GraphQL productVariantsBulkUpdate userErrors: ${JSON.stringify(userErrors)}`);
    }

    return (response as any).data?.productVariantsBulkUpdate?.productVariants?.[0];
  } catch (error: unknown) {
    console.error('Error updating variant:', error);
    throw new Error(`Failed to update variant`);
  }
}

const PRODUCT_DELETE_MUTATION = `
  mutation productDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors {
        field
        message
      }
    }
  }
`;

export async function deleteProduct(productId: string): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();

  if (!productId.includes('gid://shopify/Product/')) {
    productId = `gid://shopify/Product/${productId}`;
  }

  try {
    await retryOperation(async () => {
      const response = await shopifyClient.request(PRODUCT_DELETE_MUTATION, {
        variables: { input: { id: productId } }
      });
      const userErrors = (response as any).data?.productDelete?.userErrors;
      if (userErrors && userErrors.length > 0) {
        throw new Error(`GraphQL productDelete userErrors: ${JSON.stringify(userErrors)}`);
      }
    });
  } catch (error: unknown) {
    console.error(`Error deleting product ID ${productId}:`, error);
    throw new Error(`Failed to delete product.`);
  }
}

const PRODUCT_VARIANT_DELETE_MUTATION = `
  mutation productVariantDelete($id: ID!) {
     productVariantDelete(id: $id) {
        deletedProductVariantId
        userErrors {
           field
           message
        }
     }
  }
`;

export async function deleteProductVariant(productId: string, variantId: string): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();
  try {
    await retryOperation(async () => {
      const response = await shopifyClient.request(PRODUCT_VARIANT_DELETE_MUTATION, {
        variables: { id: variantId.includes('gid://') ? variantId : `gid://shopify/ProductVariant/${variantId}` }
      });
      const userErrors = (response as any).data?.productVariantDelete?.userErrors;
      if (userErrors && userErrors.length > 0) {
        throw new Error(`GraphQL productVariantDelete userErrors: ${JSON.stringify(userErrors)}`);
      }
    });
  } catch (error: unknown) {
    console.error(`Error deleting variant ID ${variantId}:`, error);
    throw new Error(`Failed to delete variant.`);
  }
}

// --- Inventory and Collection Functions ---

const INVENTORY_BULK_TOGGLE_MUTATION = `
  mutation inventoryBulkToggleActivation($inventoryItemId: ID!, $inventoryItemUpdates: [InventoryBulkToggleActivationInput!]!) {
    inventoryBulkToggleActivation(inventoryItemId: $inventoryItemId, inventoryItemUpdates: $inventoryItemUpdates) {
      userErrors {
        field
        message
      }
    }
  }
`;

export async function connectInventoryToLocation(inventoryItemId: string, locationId: string | number) {
  const shopifyClient = getShopifyGraphQLClient();

  if (!inventoryItemId.includes('gid://')) {
    inventoryItemId = `gid://shopify/InventoryItem/${inventoryItemId.split('/').pop()}`;
  }

  try {
    await retryOperation(async () => {
      const response = await shopifyClient.request(INVENTORY_BULK_TOGGLE_MUTATION, {
        variables: {
          inventoryItemId,
          inventoryItemUpdates: [{ locationId: locationId.toString().includes('gid://') ? locationId.toString() : `gid://shopify/Location/${locationId}`, activate: true }]
        }
      });
      const userErrors = (response as any).data?.inventoryBulkToggleActivation?.userErrors;
      if (userErrors && userErrors.length > 0) {
        // Ignore "already stocked" error
        if (JSON.stringify(userErrors).toLowerCase().includes('already stocked')) return;
        throw new Error(JSON.stringify(userErrors));
      }
    });
  } catch (error: unknown) {
    console.error(`Error connecting inventory:`, error);
    throw new Error(`Failed to connect inventory to location`);
  }
}

export async function disconnectInventoryFromLocation(inventoryItemId: string, locationId: string | number) {
  const shopifyClient = getShopifyGraphQLClient();

  if (!inventoryItemId) return;
  if (!inventoryItemId.includes('gid://')) {
    inventoryItemId = `gid://shopify/InventoryItem/${inventoryItemId.split('/').pop()}`;
  }

  try {
    await retryOperation(async () => {
      const response = await shopifyClient.request(INVENTORY_BULK_TOGGLE_MUTATION, {
        variables: {
          inventoryItemId,
          inventoryItemUpdates: [{ locationId: locationId.toString().includes('gid://') ? locationId.toString() : `gid://shopify/Location/${locationId}`, activate: false }]
        }
      });
      const userErrors = (response as any).data?.inventoryBulkToggleActivation?.userErrors;
      if (userErrors && userErrors.length > 0) {
        throw new Error(JSON.stringify(userErrors));
      }
    });
  } catch (error: unknown) {
    console.warn(`Warning: Could not disconnect inventory from location:`, error);
  }
}

export async function inventorySetQuantities(
  inventoryItemId: string,
  quantity: number,
  locationId: string | number
) {
  const shopifyClient = getShopifyGraphQLClient();
  const locationGid = locationId.toString().includes('gid://') ? locationId.toString() : `gid://shopify/Location/${locationId}`;
  const input = {
    name: 'available',
    reason: 'correction',
    ignoreCompareQuantity: true,
    quantities: [{ inventoryItemId, locationId: locationGid, quantity }],
  };

  try {
    const response = await retryOperation(async () => {
      return await shopifyClient.request(INVENTORY_SET_QUANTITIES_MUTATION, {
        variables: { input },
      });
    });
    // Logic for error checking...
  } catch (error: unknown) {
    console.error('Error updating inventory via GraphQL:', error);
    throw error;
  }
}

export async function getCollectionIdByTitle(title: string): Promise<string | null> {
  const shopifyClient = getShopifyGraphQLClient();
  const formattedQuery = `title:"${title}"`;
  try {
    const response = await shopifyClient.request(GET_COLLECTION_BY_TITLE_QUERY, {
      variables: { query: formattedQuery },
    });
    // ... safely parse ...
    return (response as any).data?.collections?.edges?.[0]?.node?.id || null;
  } catch (error) {
    return null;
  }
}

const COLLECTION_ADD_PRODUCTS_MUTATION = `
  mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
    collectionAddProducts(id: $id, productIds: $productIds) {
      userErrors {
        field
        message
      }
    }
  }
`;

export async function linkProductToCollection(productGid: string, collectionGid: string) {
  const shopifyClient = getShopifyGraphQLClient();

  if (!productGid.includes('gid://')) productGid = `gid://shopify/Product/${productGid}`;
  if (!collectionGid.includes('gid://')) collectionGid = `gid://shopify/Collection/${collectionGid}`;

  try {
    await retryOperation(async () => {
      const response = await shopifyClient.request(COLLECTION_ADD_PRODUCTS_MUTATION, {
        variables: { id: collectionGid, productIds: [productGid] }
      });
      const userErrors = (response as any).data?.collectionAddProducts?.userErrors;
      if (userErrors && userErrors.length > 0) {
        throw new Error(JSON.stringify(userErrors));
      }
    });
  } catch (error: unknown) {
    console.warn(`Could not link product to collection:`, error);
  }
}

export async function publishProductToSalesChannels(productGid: string): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();
  const publicationsResponse = await shopifyClient.request(GET_ALL_PUBLICATIONS_QUERY);
  const publications = (publicationsResponse as any).data?.publications?.edges.map((edge: any) => edge.node) || [];

  if (publications.length === 0) return;

  const publicationInputs = publications.map((pub: { id: string }) => ({ publicationId: pub.id }));

  try {
    await retryOperation(async () => {
      return await shopifyClient.request(PUBLISHABLE_PUBLISH_MUTATION, {
        variables: { id: productGid, input: publicationInputs },
      });
    });
  } catch (error) {
    logger.error(`Error during publishProductToSalesChannels:`, error);
  }
}

export async function addProductTags(productId: string, tags: string[]): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();
  try {
    await retryOperation(async () => {
      return await shopifyClient.request(ADD_TAGS_MUTATION, {
        variables: { id: productId, tags },
      });
    });
  } catch (error: unknown) {
    throw error;
  }
}

export async function removeProductTags(productId: string, tags: string[]): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();
  try {
    await retryOperation(async () => {
      return await shopifyClient.request(REMOVE_TAGS_MUTATION, {
        variables: { id: productId, tags },
      });
    });
  } catch (error: unknown) {
    throw error;
  }
}

// --- MEDIA FUNCTIONS ---
const PRODUCT_CREATE_MEDIA_MUTATION = `
  mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
    productCreateMedia(media: $media, productId: $productId) {
      media {
        id
        ... on MediaImage {
          image {
            url
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function addProductImage(
  productId: string | number,
  imageUrl: string
): Promise<ShopifyProductImage> {
  const shopifyClient = getShopifyGraphQLClient();
  const productGid = productId.toString().includes('gid://') ? productId.toString() : `gid://shopify/Product/${productId}`;

  try {
    const response = await retryOperation(async () => {
      return await shopifyClient.request(PRODUCT_CREATE_MEDIA_MUTATION, {
        variables: {
          productId: productGid,
          media: [
            {
              mediaContentType: "IMAGE",
              originalSource: imageUrl
            }
          ]
        }
      });
    });

    const userErrors = (response as any).data?.productCreateMedia?.userErrors;
    if (userErrors && userErrors.length > 0) {
      throw new Error(`GraphQL productCreateMedia userErrors: ${JSON.stringify(userErrors)}`);
    }

    const createdMedia = (response as any).data?.productCreateMedia?.media?.[0];

    // Return REST-like shape for ShopifyProductImage compatibility
    return {
      id: createdMedia?.id || '0',
      product_id: productGid,
      src: createdMedia?.image?.url || imageUrl,
      variant_ids: []
    } as any;
  } catch (error: unknown) {
    logger.error(`Error adding image:`, error);
    throw new Error(`Failed to add image`);
  }
}

const PRODUCT_DELETE_MEDIA_MUTATION = `
  mutation productDeleteMedia($mediaIds: [ID!]!, $productId: ID!) {
    productDeleteMedia(mediaIds: $mediaIds, productId: $productId) {
      deletedMediaIds
      userErrors {
        field
        message
      }
    }
  }
`;

export async function deleteProductImage(productId: string, imageId: string): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();
  try {
    await retryOperation(async () => {
      // Typically REST image IDs map to MediaImage IDs directly.
      const response = await shopifyClient.request(PRODUCT_DELETE_MEDIA_MUTATION, {
        variables: {
          mediaIds: [imageId.includes('gid://') ? imageId : `gid://shopify/MediaImage/${imageId}`],
          productId: productId.includes('gid://') ? productId : `gid://shopify/Product/${productId}`
        }
      });

      const userErrors = (response as any).data?.productDeleteMedia?.userErrors;
      if (userErrors && userErrors.length > 0) {
        // Fallback: try deleting as generic Media if MediaImage fails
        // This handles cases where the media is a Video/Model3d and not specifically MediaImage
        if (userErrors.some((e: any) => e.message.includes('not found') || e.message.includes('invalid'))) {
          const fallbackResponse = await shopifyClient.request(PRODUCT_DELETE_MEDIA_MUTATION, {
            variables: {
              mediaIds: [`gid://shopify/Media/${imageId}`],
              productId: `gid://shopify/Product/${productId}`
            }
          });
          const fallbackErrors = (fallbackResponse as any).data?.productDeleteMedia?.userErrors;
          if (fallbackErrors && fallbackErrors.length > 0) {
            throw new Error(JSON.stringify(fallbackErrors));
          }
          return;
        }
        throw new Error(JSON.stringify(userErrors));
      }
    });
  } catch (error: unknown) {
    logger.error(`Error deleting image:`, error);
    throw new Error(`Failed to delete image`);
  }
}

// --- BULK OPERATIONS ---

export async function startProductExportBulkOperation(): Promise<{ id: string; status: string }> {
  const shopifyClient = getShopifyGraphQLClient();

  const currentOpResponse = await shopifyClient.request(GET_CURRENT_BULK_OPERATION_QUERY);
  const currentOperation = (currentOpResponse as any).data?.currentBulkOperation;

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

  const response = await shopifyClient.request(BULK_OPERATION_RUN_QUERY_MUTATION, {
    variables: { query },
  });

  const bulkOperation = (response as any).data?.bulkOperationRunQuery?.bulkOperation;
  if (!bulkOperation) {
    throw new Error('Could not start bulk operation.');
  }

  return bulkOperation;
}

export async function checkBulkOperationStatus(
  id: string
): Promise<{ id: string; status: string; resultUrl?: string }> {
  const shopifyClient = getShopifyGraphQLClient();
  const currentOpResponse = await shopifyClient.request(GET_CURRENT_BULK_OPERATION_QUERY);
  const operation = (currentOpResponse as any).data?.currentBulkOperation;

  if (operation && operation.id !== id && operation.status === 'RUNNING') {
    return { id: id, status: 'RUNNING' };
  }

  if (operation && operation.id === id) {
    return { id: operation.id, status: operation.status, resultUrl: operation.url };
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
  const specificOpResponse = await shopifyClient.request(specificOpQuery, { variables: { id } });
  const specificOperation = (specificOpResponse as any).data?.node;

  if (specificOperation) {
    return {
      id: specificOperation.id,
      status: specificOperation.status,
      resultUrl: specificOperation.url,
    };
  }

  throw new Error(`Could not retrieve status for bulk operation ${id}.`);
}

export async function getBulkOperationResult(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download bulk operation result from ${url}`);
  }
  return response.text();
}

export async function downloadBulkOperationResultToFile(url: string, destPath: string): Promise<void> {
  // Sentinel Security Fix: Validate URL to prevent SSRF
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Security Error: Only HTTPS URLs are allowed.');
  }

  // Shopify bulk operations are stored on Google Cloud Storage
  // Reference: https://shopify.dev/docs/api/usage/bulk-operations/queries
  // We allow storage.googleapis.com and its subdomains (like shopify-staged-uploads)
  if (!parsedUrl.hostname.endsWith('storage.googleapis.com')) {
    throw new Error('Security Error: URL host is not allowed.');
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download bulk operation result from ${url}`);
  }
  if (!response.body) {
    throw new Error('Response body is empty');
  }

  // Node.js specific: ReadableStream to WritableStream
  // Next.js (Node runtime) fetch returns a web standard ReadableStream.
  // We need to convert or pipe it to fs.

  const fs = await import('fs');
  const { pipeline } = await import('stream/promises');
  const { Readable } = await import('stream');

  const fileStream = fs.createWriteStream(destPath);

  // @ts-ignore - response.body compatibility
  await pipeline(Readable.fromWeb(response.body), fileStream);
}


export async function parseBulkOperationResult(jsonlContent: string, locationId?: number): Promise<Product[]> {
  const lines = jsonlContent.split('\n').filter((line) => line.trim() !== '');
  const products: Product[] = [];
  const parentProducts = new Map<string, any>();
  const locationMap = new Map<string, string[]>();
  const gammaInventoryMap = new Map<string, number>();

  for (const line of lines) {
    const item = JSON.parse(line);
    if (item.id && item.id.includes('gid://shopify/Product/')) {
      parentProducts.set(item.id, item);
    }

    // InventoryLevel Handling
    if (item.location && item.location.id && item.__parentId) {
      // 1. Map locations as before
      if (!locationMap.has(item.__parentId)) {
        locationMap.set(item.__parentId, []);
      }
      locationMap.get(item.__parentId)?.push(item.location.id);

      // 2. Capture Gamma Warehouse Quantity
      // Check if this location is the Target Location
      const GAMMA_LOCATION_ID = locationId?.toString() || process.env.GAMMA_WAREHOUSE_LOCATION_ID || '93998154045';
      if (item.location.id.endsWith(`Location/${GAMMA_LOCATION_ID}`)) {
        let quantity = 0;
        if (item.quantities) {
          const available = item.quantities.find((q: any) => q.name === 'available');
          if (available) {
            quantity = available.quantity;
          }
        } else if (typeof item.inventoryQuantity === 'number') {
          // Fallback for older API versions or if schema implies direct field
          quantity = item.inventoryQuantity;
        }
        gammaInventoryMap.set(item.__parentId, quantity);
      }
    }
  }

  for (const line of lines) {
    const shopifyProduct = JSON.parse(line);

    if (shopifyProduct.id && shopifyProduct.id.includes('gid://shopify/ProductVariant')) {
      const variantId = shopifyProduct.id;
      const sku = shopifyProduct.sku;
      const parentId = shopifyProduct.__parentId;
      const parentProduct = parentProducts.get(parentId);

      if (parentProduct && sku) {
        let locs = locationMap.get(variantId) || [];
        // Map keys are likely inventoryItem IDs if that's the parent of inventoryLevel
        const inventoryItemId = shopifyProduct.inventoryItem?.id;

        if (locs.length === 0 && inventoryItemId) {
          locs = locationMap.get(inventoryItemId) || [];
        }

        // Determine Inventory Quantity for Gamma Warehouse
        let finalInventory = 0;
        if (inventoryItemId && gammaInventoryMap.has(inventoryItemId)) {
          finalInventory = gammaInventoryMap.get(inventoryItemId)!;
        }

        // Filter out non-Gamma products
        // We check if the variant has an entry in gammaInventoryMap (meaning it exists at that location)
        // OR if we strictly want usage at Gamma.
        // Based on logic in getShopifyProductsBySku, we skipped if no inventory level at Gamma.
        // gammaInventoryMap is populated ONLY if the location ID matches Gamma.
        // So checking if gammaInventoryMap has the key is sufficient?
        // Wait, gammaInventoryMap keys are `__parentId` (line 1565).
        // Let's look at how gammaInventoryMap is populated.
        // Line 1565: gammaInventoryMap.set(item.__parentId, quantity);
        // `item` here is an inventoryLevel. `__parentId` is the InventoryItem ID.

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
          inventory: finalInventory, // Updated to use Gamma specific inventory
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
  }
  return products;
}

const GET_FULL_PRODUCT_QUERY = `
  query getFullProduct($id: ID!) {
    product(id: $id) {
       id
       title
       handle
       vendor
       productType
       tags
       bodyHtml
       templateSuffix
       status
       variants(first: 250) {
         edges {
           node {
              id
              sku
              price
              compareAtPrice
              inventoryQuantity
              inventoryItem {
                  id
                  measurement {
                      weight { value unit }
                  }
              }
           }
         }
       }
       images(first: 250) {
         edges {
           node {
             id
             url
           }
         }
       }
    }
  }
`;

export async function getFullProduct(productId: string | number): Promise<any> {
  const shopifyClient = getShopifyGraphQLClient();
  try {
    const response = await retryOperation(async () => {
      return await shopifyClient.request(GET_FULL_PRODUCT_QUERY, {
        variables: { id: productId.toString().includes('gid://') ? productId.toString() : `gid://shopify/Product/${productId}` }
      });
    });
    return (response as any).data?.product;
  } catch (error: unknown) {
    console.error(`Error fetching full product :`, error);
    throw new Error(`Failed to fetch product`);
  }
}

export async function getProductImageCounts(productIds: (string | number)[]): Promise<Record<string, number>> {
  const shopifyClient = getShopifyGraphQLClient();
  const counts: Record<string, number> = {};

  for (const id of productIds) {
    const productGid = id.toString().includes('gid://') ? id.toString() : `gid://shopify/Product/${id}`;
    const query = `
            query getProductImageCount($id: ID!) {
                product(id: $id) {
                    media(first: 0) {
                        totalCount
                    }
                }
            }
        `;
    try {
      const response = await shopifyClient.request(query, {
        variables: { id: productGid },
      });
      const data = (response as any).data?.product?.media;
      if (data) {
        counts[id.toString()] = data.totalCount;
      } else {
        counts[id.toString()] = 0;
      }
      await sleep(100);
    } catch (error) {
      counts[id.toString()] = 0;
    }
  }
  return counts;
}
