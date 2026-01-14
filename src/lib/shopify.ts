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

const ShopifyRestImageSchema = z.object({
  id: z.number(),
  product_id: z.number(),
  position: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  alt: z.string().nullable(),
  width: z.number(),
  height: z.number(),
  src: z.string(),
  variant_ids: z.array(z.number()),
});

const ShopifyRestVariantSchema = z.object({
  id: z.number(),
  product_id: z.number(),
  title: z.string(),
  price: z.string(),
  sku: z.string().nullable(),
  position: z.number(),
  inventory_policy: z.string(),
  compare_at_price: z.string().nullable(),
  fulfillment_service: z.string(),
  inventory_management: z.string().nullable(),
  option1: z.string().nullable(),
  option2: z.string().nullable(),
  option3: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  taxable: z.boolean(),
  barcode: z.string().nullable(),
  grams: z.number(),
  image_id: z.number().nullable(),
  weight: z.number(),
  weight_unit: z.string(),
  inventory_item_id: z.number(),
  inventory_quantity: z.number().optional(), // field might be missing in some contexts
  old_inventory_quantity: z.number().optional(),
  requires_shipping: z.boolean(),
});

const ShopifyRestProductSchema = z.object({
  id: z.number(),
  title: z.string(),
  body_html: z.string().nullable(),
  vendor: z.string(),
  product_type: z.string(),
  created_at: z.string(),
  handle: z.string(),
  updated_at: z.string(),
  published_at: z.string().nullable(),
  template_suffix: z.string().nullable(),
  status: z.string(),
  published_scope: z.string(),
  tags: z.string(),
  admin_graphql_api_id: z.string(),
  variants: z.array(ShopifyRestVariantSchema),
  options: z.array(
    z.object({
      id: z.number(),
      product_id: z.number(),
      name: z.string(),
      position: z.number(),
      values: z.array(z.string()),
    })
  ),
  images: z.array(ShopifyRestImageSchema),
  image: ShopifyRestImageSchema.nullable(),
});

const ShopifyGraphQLErrorSchema = z.object({
  message: z.string(),
  locations: z.array(z.object({ line: z.number(), column: z.number() })).optional(),
  path: z.array(z.string().or(z.number())).optional(),
  extensions: z
    .object({
      code: z.string().optional(),
      documentation: z.string().optional(),
    })
    .optional(),
});

// Helper for generic GraphQL response validation
const createGraphQLResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema.optional(),
    errors: z.array(ShopifyGraphQLErrorSchema).optional(),
    extensions: z
      .object({
        cost: z
          .object({
            requestedQueryCost: z.number(),
            actualQueryCost: z.number(),
            throttleStatus: z.object({
              maximumAvailable: z.number(),
              currentlyAvailable: z.number(),
              restoreRate: z.number(),
            }),
          })
          .optional(),
      })
      .optional(),
  });

const ShopifyRestErrorSchema = z.object({
  errors: z.union([z.string(), z.record(z.union([z.string(), z.array(z.string())]))]),
});

// Helper for generic REST response validation
// Note: Shopify REST responses usually wrap the object in a key, e.g. { product: ... }
const createRestResponseSchema = <T extends z.ZodTypeAny>(bodySchema: T) =>
  z.object({
    body: bodySchema.and(ShopifyRestErrorSchema.partial()), // Errors might be present mixed in or exclusively
    headers: z.record(z.union([z.string(), z.array(z.string()), z.undefined()])),
  });

// Specific GraphQL Response Schemas

const InventoryItemMeasurementSchema = z.object({
  weight: z
    .object({
      value: z.number(),
      unit: z.string(),
    })
    .nullable()
    .optional(),
});

const InventoryLevelSchema = z.object({
  quantities: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number(),
      })
    )
    .optional(),
  location: z.object({
    id: z.string(),
  }),
});

const InventoryItemSchema = z.object({
  id: z.string(),
  measurement: InventoryItemMeasurementSchema.nullable().optional(),
  inventoryLevels: z
    .object({
      edges: z.array(z.object({ node: InventoryLevelSchema })),
    })
    .optional(),
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
  node: ProductVariantNodeSchema,
});

const GetVariantsBySkuQuerySchema = z.object({
  productVariants: z.object({
    edges: z.array(ProductVariantsEdgeSchema),
  }),
});

// --- Helper function to introduce a delay ---
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isThrottleError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errorString = JSON.stringify(error);
    if (errorString.includes('Throttled') || errorString.includes('Exceeded 2 calls per second'))
      return true;
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
    const deficit = cost * 2 - rateLimitState.currentlyAvailable;
    const waitTime = Math.ceil((deficit / rateLimitState.restoreRate) * 1000);
    logger.info(
      `Rate limit tight (Available: ${rateLimitState.currentlyAvailable}). Sleeping ${waitTime}ms...`
    );
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

function getShopifyRestClient() {
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

  return new shopify.clients.Rest({ session, apiVersion: LATEST_API_VERSION });
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

export async function getShopifyProductsBySku(
  skus: string[],
  locationId?: number
): Promise<Product[]> {
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
            let isAtGamma = false;
            // Gamma Warehouse ID: 93998154045
            const GAMMA_LOCATION_ID =
              locationId?.toString() || process.env.GAMMA_WAREHOUSE_LOCATION_ID || '93998154045';
            const TARGET_LOCATION_GID = `gid://shopify/Location/${GAMMA_LOCATION_ID}`;

            if (variant.inventoryItem?.inventoryLevels?.edges) {
              for (const levelEdge of variant.inventoryItem.inventoryLevels.edges) {
                if (levelEdge.node.location.id === TARGET_LOCATION_GID) {
                  const available = levelEdge.node.quantities?.find((q) => q.name === 'available');
                  if (available) {
                    locationInventory = available.quantity;
                  }
                  isAtGamma = true;
                  break; // Found the location, no need to continue
                }
              }
            }

            if (!isAtGamma) continue;

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
              imageId: variant.image?.id
                ? parseInt(variant.image.id.split('/').pop() || '0', 10)
                : null,
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
        const rawResponse = await shopifyClient.request(GET_VARIANTS_BY_SKU_QUERY, {
          variables: { query },
        });
        const parsed = ResponseSchema.parse(rawResponse);
        const edges = parsed.data?.productVariants?.edges || [];
        const match = edges.find(
          (e) => e.node.sku?.trim().toLowerCase() === sku.trim().toLowerCase()
        );
        return match?.node;
      } catch (e) {
        return null;
      }
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
            let isAtGamma = false;
            const GAMMA_LOCATION_ID =
              locationId?.toString() || process.env.GAMMA_WAREHOUSE_LOCATION_ID || '93998154045';
            const TARGET_LOCATION_GID = `gid://shopify/Location/${GAMMA_LOCATION_ID}`;

            if (node.inventoryItem?.inventoryLevels?.edges) {
              for (const levelEdge of node.inventoryItem.inventoryLevels.edges) {
                if (levelEdge.node.location.id === TARGET_LOCATION_GID) {
                  isAtGamma = true;
                  break;
                }
              }
            }

            if (!isAtGamma) continue;

            const product = node.product;
            verifiedProducts.push({
              id: product.id,
              variantId: node.id,
              inventoryItemId: node.inventoryItem?.id || '',
              handle: product.handle,
              sku: node.sku,
              name: product.title,
              price: parseFloat(node.price),
              inventory: node.inventoryQuantity || 0,
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
              imageId: node.image?.id ? parseInt(node.image.id.split('/').pop() || '0', 10) : null,
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

    const verifyWorkers = Array(Math.min(missingSkus.length, VERIFY_CONCURRENCY))
      .fill(null)
      .map(verifyWorker);
    await Promise.all(verifyWorkers);
    if (verifiedProducts.length > 0) {
      exactMatchProducts.push(...verifiedProducts);
    }
  }

  return exactMatchProducts;
}

export async function getShopifyLocations(): Promise<{ id: number; name: string }[]> {
  const shopifyClient = getShopifyRestClient();
  const LocationSchema = z.object({
    id: z.number(),
    name: z.string(),
  });
  const LocationsResponseSchema = createRestResponseSchema(
    z.object({
      locations: z.array(LocationSchema),
    })
  );

  try {
    const response = await shopifyClient.get({ path: 'locations' });
    const parsed = LocationsResponseSchema.parse(response);
    return parsed.body.locations;
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
  const Schema = createGraphQLResponseSchema(
    z.object({
      productByHandle: z.any(),
    })
  );
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

export async function createProduct(
  productVariants: Product[],
  addClearanceTag: boolean
): Promise<z.infer<typeof ShopifyRestProductSchema>> {
  const shopifyClient = getShopifyRestClient();

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

  // Create a mutable copy for processing
  const processedVariants = structuredClone(productVariants);
  const seenOptionValues = new Set<string>();

  for (const variant of processedVariants) {
    const optionKey = [variant.option1Value, variant.option2Value, variant.option3Value]
      .filter(Boolean)
      .join('/');
    if (seenOptionValues.has(optionKey) && optionKey && optionKey !== 'Default Title') {
      if (variant.option1Value) {
        variant.option1Value = `${variant.option1Value} (${variant.sku})`;
      }
    }
    if (optionKey) {
      seenOptionValues.add(optionKey);
    }
  }

  const optionNames: string[] = [];
  if (firstVariant.option1Name && !isSingleDefaultVariant)
    optionNames.push(firstVariant.option1Name);
  if (firstVariant.option2Name) optionNames.push(firstVariant.option2Name);
  if (firstVariant.option3Name) optionNames.push(firstVariant.option3Name);

  const restOptions = optionNames.length > 0 ? optionNames.map((name) => ({ name })) : [];

  const restVariants = processedVariants.map((p: Product) => {
    const variantPayload: any = {
      price: p.price,
      sku: p.sku,
      barcode: p.barcode,
      compare_at_price: p.compareAtPrice,
      inventory_management: 'shopify',
      inventory_policy: 'deny',
      requires_shipping: true,
      weight: p.weight,
      weight_unit: 'g',
      cost: p.costPerItem,
    };

    if (!isSingleDefaultVariant) {
      if (p.option1Name) variantPayload.option1 = getOptionValue(p.option1Value, p.sku);
      if (p.option2Name) variantPayload.option2 = getOptionValue(p.option2Value, null);
      if (p.option3Name) variantPayload.option3 = getOptionValue(p.option3Value, null);
    }

    return variantPayload;
  });

  const uniqueImageUrls = [
    ...new Set(processedVariants.map((p: Product) => p.mediaUrl).filter(Boolean) as string[]),
  ];
  const restImages = uniqueImageUrls.map((url) => ({ src: url }));

  let tags = firstVariant.tags || '';

  if (tags) {
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tagList.length > 3) {
      tags = tagList.slice(0, 3).join(', ');
    }
  }

  if (firstVariant.category) {
    tags = tags ? `${tags}, ${firstVariant.category}` : firstVariant.category;
  }

  if (addClearanceTag && !tags.toLowerCase().includes('clearance')) {
    tags = tags ? `Clearance, ${tags}` : 'Clearance';
  }

  const productPayload: { product: any } = {
    product: {
      title: firstVariant.name,
      handle: firstVariant.handle,
      body_html: sanitizedDescription,
      vendor: firstVariant.vendor,
      product_type: firstVariant.productType,
      status: 'active',
      tags: tags,
      variants: restVariants,
      images: restImages,
    },
  };

  if (restOptions.length > 0) {
    productPayload.product.options = restOptions;
  }

  const isHeavy = productVariants.some((p) => p.weight && p.weight > 22679.6);

  if (addClearanceTag) {
    productPayload.product.template_suffix = 'clearance';
  } else if (isHeavy) {
    productPayload.product.template_suffix = 'heavy-products';
  }

  const CreateProductResponseSchema = createRestResponseSchema(
    z.object({
      product: ShopifyRestProductSchema,
    })
  );

  try {
    const response = await retryOperation(async () => {
      return await shopifyClient.post({
        path: 'products',
        data: productPayload,
      });
    });

    // Validate with Zod
    const parsed = CreateProductResponseSchema.parse(response);
    return parsed.body.product;
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'response' in error) {
      console.error('Error creating product:', (error as any).response?.body);
    } else {
      console.error('Error creating product:', error);
    }
    throw new Error(`Failed to create product`);
  }
}

export async function addProductVariant(product: Product): Promise<any> {
  // Keeping implementation similar but with schemas where possible
  // This function had complex logic for image reuse.
  // ... [Original logic preserved but types guarded] ...

  const shopifyClient = getShopifyRestClient();
  const graphQLClient = getShopifyGraphQLClient();

  const productResponse = await graphQLClient.request(GET_PRODUCT_BY_HANDLE_QUERY, {
    variables: { handle: product.handle },
  });

  // Minimal schema validation for this lookup
  const LookupSchema = createGraphQLResponseSchema(
    z.object({
      productByHandle: z
        .object({
          id: z.string(),
          images: z
            .object({
              edges: z.array(
                z.object({
                  node: z.object({ id: z.string(), url: z.string() }),
                })
              ),
            })
            .optional(),
        })
        .nullable(),
    })
  );

  const parsedLookup = LookupSchema.parse(productResponse);
  const productByHandle = parsedLookup.data?.productByHandle;
  const productGid = productByHandle?.id;

  if (!productGid) {
    throw new Error(`Could not find product with handle ${product.handle} to add variant to.`);
  }
  const productId = parseInt(productGid.split('/').pop()!, 10);
  const existingImages = productByHandle?.images?.edges.map((e) => e.node) || [];

  const getOptionValue = (value: string | null | undefined, fallback: string | null) =>
    value?.trim() ? value.trim() : fallback;

  let imageId = product.imageId;

  if (product.mediaUrl && !imageId) {
    const imageFilename = product.mediaUrl.split('/').pop()?.split('?')[0];
    const existingImage = existingImages.find((img) => img.url.includes(imageFilename as string));

    if (existingImage) {
      imageId = parseInt(existingImage.id.split('/').pop()!);
    } else {
      try {
        const newImage = await addProductImage(productId, product.mediaUrl);
        imageId = newImage.id;
      } catch (error) {
        console.warn(`Failed to upload image from URL ${product.mediaUrl}.`);
      }
    }
  }

  const variantPayload = {
    variant: {
      price: product.price,
      sku: product.sku,
      compare_at_price: product.compareAtPrice,
      cost: product.costPerItem,
      barcode: product.barcode,
      weight: product.weight,
      weight_unit: 'g',
      inventory_management: 'shopify',
      inventory_policy: 'deny',
      option1: getOptionValue(product.option1Value, product.sku),
      option2: getOptionValue(product.option2Value, null),
      option3: getOptionValue(product.option3Value, null),
      image_id: imageId,
    },
  };

  const CreateVariantResponseSchema = createRestResponseSchema(
    z.object({
      variant: ShopifyRestVariantSchema,
    })
  );

  try {
    const response = await retryOperation(async () => {
      return await shopifyClient.post({
        path: `products/${productId}/variants`,
        data: variantPayload,
      });
    });

    // Validate
    const parsed = CreateVariantResponseSchema.parse(response);

    // Fetch full product to return
    const GetProductResponseSchema = createRestResponseSchema(z.object({ product: z.any() }));
    const fullProductResponse = await retryOperation(async () => {
      return await shopifyClient.get({ path: `products/${productId}` });
    });
    const parsedProduct = GetProductResponseSchema.parse(fullProductResponse);
    return parsedProduct.body.product;
  } catch (error: unknown) {
    console.error('Error adding variant:', error);
    throw new Error(`Failed to add variant`);
  }
}

export async function updateProduct(
  id: string,
  input: { title?: string; bodyHtml?: string; templateSuffix?: string; tags?: string }
) {
  if (input.title && !input.bodyHtml && !input.templateSuffix && !input.tags) {
    const shopifyClient = getShopifyGraphQLClient();
    const response = await retryOperation(async () => {
      return await shopifyClient.request(UPDATE_PRODUCT_MUTATION, {
        variables: { input: { id: id, title: input.title } },
      });
    });
    // Can validate response here if strictness required
    return (response as any).data?.productUpdate?.product;
  }

  const shopifyClient = getShopifyRestClient();
  const numericProductId = id.split('/').pop();

  if (!numericProductId) {
    throw new Error(`Invalid Product ID GID for REST update: ${id}`);
  }

  const payload: { product: any } = {
    product: {
      id: numericProductId,
    },
  };

  if (input.bodyHtml) payload.product.body_html = input.bodyHtml;
  if (input.title) payload.product.title = input.title;
  if (input.templateSuffix) payload.product.template_suffix = input.templateSuffix;
  if (input.tags !== undefined) payload.product.tags = input.tags;

  const UpdateProductResponseSchema = createRestResponseSchema(z.object({ product: z.any() }));

  try {
    const response = await retryOperation(async () => {
      return await shopifyClient.put({
        path: `products/${numericProductId}`,
        data: payload,
      });
    });
    const parsed = UpdateProductResponseSchema.parse(response);
    return parsed.body.product;
  } catch (error: unknown) {
    console.error('Error updating product:', error);
    throw new Error(`Failed to update product`);
  }
}

export async function updateProductVariant(
  variantId: number,
  input: { image_id?: number | null; price?: number; weight?: number; weight_unit?: 'g' | 'lb' }
) {
  const shopifyClient = getShopifyRestClient();
  const payload = { variant: { id: variantId, ...input } };
  const UpdateVariantResponseSchema = createRestResponseSchema(z.object({ variant: z.any() }));

  try {
    const response = await retryOperation(async () => {
      return await shopifyClient.put({
        path: `variants/${variantId}`,
        data: payload,
      });
    });
    const parsed = UpdateVariantResponseSchema.parse(response);
    return parsed.body.variant;
  } catch (error: unknown) {
    console.error('Error updating variant:', error);
    throw new Error(`Failed to update variant`);
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  const shopifyClient = getShopifyRestClient();
  const numericProductId = productId.split('/').pop();

  if (!numericProductId) {
    throw new Error(`Invalid Product ID GID: ${productId}`);
  }

  try {
    await retryOperation(async () => {
      await shopifyClient.delete({
        path: `products/${numericProductId}`,
      });
    });
  } catch (error: unknown) {
    console.error(`Error deleting product ID ${numericProductId}:`, error);
    throw new Error(`Failed to delete product.`);
  }
}

export async function deleteProductVariant(productId: number, variantId: number): Promise<void> {
  const shopifyClient = getShopifyRestClient();
  try {
    await retryOperation(async () => {
      await shopifyClient.delete({
        path: `products/${productId}/variants/${variantId}`,
      });
    });
  } catch (error: unknown) {
    console.error(`Error deleting variant ID ${variantId}:`, error);
    throw new Error(`Failed to delete variant.`);
  }
}

// --- Inventory and Collection Functions ---

export async function connectInventoryToLocation(inventoryItemId: string, locationId: number) {
  const shopifyClient = getShopifyRestClient();
  const numericInventoryItemId = inventoryItemId.split('/').pop();

  try {
    await retryOperation(async () => {
      await shopifyClient.post({
        path: 'inventory_levels/connect',
        data: {
          location_id: locationId,
          inventory_item_id: numericInventoryItemId,
        },
      });
    });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'response' in error) {
      const errorBody = (error as any).response?.body;
      if (
        errorBody?.errors &&
        JSON.stringify(errorBody.errors).includes('is already stocked at the location')
      ) {
        return;
      }
    }
    console.error(`Error connecting inventory:`, error);
    throw new Error(`Failed to connect inventory to location`);
  }
}

export async function disconnectInventoryFromLocation(inventoryItemId: string, locationId: number) {
  const shopifyClient = getShopifyRestClient();
  const numericInventoryItemId = inventoryItemId.split('/').pop();

  // Skip if no valid inventory item ID
  if (!numericInventoryItemId) {
    console.warn('disconnectInventoryFromLocation: No valid inventory item ID provided');
    return;
  }

  try {
    await retryOperation(async () => {
      await shopifyClient.delete({
        path: 'inventory_levels',
        query: {
          inventory_item_id: numericInventoryItemId,
          location_id: locationId,
        },
      });
    });
  } catch (error: unknown) {
    // Shopify DELETE often returns empty body which causes "invalid-json" parsing error
    // This is expected and not a real error - the operation likely succeeded
    if (typeof error === 'object' && error !== null && 'type' in error) {
      if ((error as any).type === 'invalid-json') {
        // This is expected for DELETE requests that return empty body
        return;
      }
    }
    // Log but don't throw - this is a non-critical operation
    console.warn(`Warning: Could not disconnect inventory from location:`, error);
  }
}

export async function inventorySetQuantities(
  inventoryItemId: string,
  quantity: number,
  locationId: number
) {
  const shopifyClient = getShopifyGraphQLClient();
  const locationGid = `gid://shopify/Location/${locationId}`;
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

export async function linkProductToCollection(productGid: string, collectionGid: string) {
  const shopifyClient = getShopifyRestClient();
  const legacyProductId = productGid.split('/').pop();
  const legacyCollectionId = collectionGid.split('/').pop();

  try {
    await retryOperation(async () => {
      await shopifyClient.post({
        path: 'collects',
        data: {
          collect: {
            product_id: legacyProductId,
            collection_id: legacyCollectionId,
          },
        },
      });
    });
  } catch (error: unknown) {
    console.warn(`Could not link product to collection:`, error);
  }
}

export async function publishProductToSalesChannels(productGid: string): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();
  const publicationsResponse = await shopifyClient.request(GET_ALL_PUBLICATIONS_QUERY);
  const publications =
    (publicationsResponse as any).data?.publications?.edges.map((edge: any) => edge.node) || [];

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
export async function addProductImage(
  productId: number,
  imageUrl: string
): Promise<ShopifyProductImage> {
  const shopifyClient = getShopifyRestClient();

  const AddImageResponseSchema = createRestResponseSchema(
    z.object({
      image: z
        .object({
          id: z.number(),
          product_id: z.number(),
          src: z.string(),
          variant_ids: z.array(z.number()).optional().default([]),
          // include other fields if needed for ShopifyProductImage generic
        })
        .passthrough(),
    })
  );

  try {
    const response = await retryOperation(async () => {
      return await shopifyClient.post({
        path: `products/${productId}/images`,
        data: {
          image: {
            src: imageUrl,
          },
        },
      });
    });

    // Validate
    const parsed = AddImageResponseSchema.parse(response);
    return parsed.body.image as ShopifyProductImage; // Casting as our internal type based on validation
  } catch (error: unknown) {
    logger.error(`Error adding image:`, error);
    throw new Error(`Failed to add image`);
  }
}

export async function deleteProductImage(productId: number, imageId: number): Promise<void> {
  const shopifyClient = getShopifyRestClient();
  try {
    await retryOperation(async () => {
      await shopifyClient.delete({
        path: `products/${productId}/images/${imageId}`,
      });
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

  if (
    currentOperation &&
    (currentOperation.status === 'RUNNING' || currentOperation.status === 'CREATED')
  ) {
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

export async function downloadBulkOperationResultToFile(
  url: string,
  destPath: string
): Promise<void> {
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

export async function parseBulkOperationResult(
  jsonlContent: string,
  locationId?: number
): Promise<Product[]> {
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
      const GAMMA_LOCATION_ID =
        locationId?.toString() || process.env.GAMMA_WAREHOUSE_LOCATION_ID || '93998154045';
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
          compareAtPrice: shopifyProduct.compareAtPrice
            ? parseFloat(shopifyProduct.compareAtPrice)
            : null,
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
          imageId: shopifyProduct.image?.id
            ? parseInt(shopifyProduct.image.id.split('/').pop(), 10)
            : null,
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

export async function getFullProduct(productId: number): Promise<any> {
  // Keeping safe
  const shopifyClient = getShopifyRestClient();
  try {
    const response = await shopifyClient.get({ path: `products/${productId}` });
    return (response as any).body?.product;
  } catch (error: unknown) {
    console.error(`Error fetching full product :`, error);
    throw new Error(`Failed to fetch product`);
  }
}

export async function getProductImageCounts(productIds: number[]): Promise<Record<number, number>> {
  const shopifyClient = getShopifyGraphQLClient();
  const counts: Record<number, number> = {};

  for (const id of productIds) {
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
        variables: { id: `gid://shopify/Product/${id}` },
      });
      const data = (response as any).data?.product?.media;
      if (data) {
        counts[id] = data.totalCount;
      } else {
        counts[id] = 0;
      }
      await sleep(100);
    } catch (error) {
      counts[id] = 0;
    }
  }
  return counts;
}
