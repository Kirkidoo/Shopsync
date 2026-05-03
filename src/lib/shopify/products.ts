'use server';

import { z } from 'zod';
import { Product, ShopifyProductImage } from '@/lib/types';
import { logger } from '@/lib/logger';
import { getShopifyGraphQLClient, retryOperation, sleep, isThrottleError } from './client';
import { env } from '@/lib/env';
import {
  createGraphQLResponseSchema,
  GetVariantsBySkuQuerySchema,
  GetUpdatedProductsQuerySchema,
  GET_VARIANTS_BY_SKU_QUERY,
  GET_PRODUCT_BY_HANDLE_QUERY,
  UPDATE_PRODUCT_MUTATION,
  GET_UPDATED_PRODUCTS_QUERY,
  ADD_TAGS_MUTATION,
  REMOVE_TAGS_MUTATION,
  PRODUCT_SET_MUTATION,
  PRODUCT_VARIANT_CREATE_MUTATION,
  UPDATE_PRODUCT_VARIANT_MUTATION,
  PRODUCT_DELETE_MUTATION,
  PRODUCT_VARIANT_DELETE_MUTATION,
  PRODUCT_CREATE_MEDIA_MUTATION,
  PRODUCT_DELETE_MEDIA_MUTATION,
  GET_FULL_PRODUCT_QUERY,
  GET_ALL_PUBLICATIONS_QUERY,
  PUBLISHABLE_PUBLISH_MUTATION,
  convertWeightToGrams,
  ShopifyAPIError,
  ShopifyFullProduct,
  ProductSetResponseSchema,
  ProductUpdateResponseSchema,
  ProductVariantCreateResponseSchema,
  ProductVariantsBulkUpdateResponseSchema,
  ProductDeleteResponseSchema,
  ProductVariantDeleteResponseSchema,
  ProductCreateMediaResponseSchema,
  ProductDeleteMediaResponseSchema,
  PublishablePublishResponseSchema,
  TagsAddResponseSchema,
  TagsRemoveResponseSchema,
  GetProductByHandleQuerySchema,
  GetAllPublicationsQuerySchema,
  GetFullProductQuerySchema,
} from './types';

export async function getShopifyProductsBySku(skus: string[], locationId?: number): Promise<Product[]> {
  const shopifyClient = getShopifyGraphQLClient();
  const allProducts: Product[] = [];

  const ResponseSchema = createGraphQLResponseSchema(GetVariantsBySkuQuerySchema);

  const skuBatches: string[][] = [];
  for (let i = 0; i < skus.length; i += 10) {
    skuBatches.push(skus.slice(i, i + 10));
  }

  const processBatch = async (batch: string[]) => {
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
            let isAtLocation = false;
            let locationInventory = 0;
            const GAMMA_LOCATION_ID = locationId?.toString() || env.GAMMA_WAREHOUSE_LOCATION_ID.toString();
            const TARGET_LOCATION_GID = `gid://shopify/Location/${GAMMA_LOCATION_ID}`;

            if (variant.inventoryItem?.inventoryLevels?.edges) {
              for (const levelEdge of variant.inventoryItem.inventoryLevels.edges) {
                if (levelEdge.node.location.id === TARGET_LOCATION_GID) {
                  isAtLocation = true;
                  const available = levelEdge.node.quantities?.find(q => q.name === 'available');
                  if (available) {
                    locationInventory = available.quantity;
                  }
                  break;
                }
              }
            }

            if (!isAtLocation) continue;

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

  const exactMatchProducts = allProducts.filter((p) =>
    requestedSkuSetLower.has(p.sku.trim().toLowerCase())
  );

  const foundSkusLower = new Set(exactMatchProducts.map((p) => p.sku.trim().toLowerCase()));
  const missingSkus = Array.from(new Set(skus)).filter(
    (sku) => !foundSkusLower.has(sku.trim().toLowerCase())
  );

  if (missingSkus.length > 0) {
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
            let isAtLocation = false;
            let locationInventory = 0;
            const GAMMA_LOCATION_ID = locationId?.toString() || env.GAMMA_WAREHOUSE_LOCATION_ID.toString();
            const TARGET_LOCATION_GID = `gid://shopify/Location/${GAMMA_LOCATION_ID}`;

            if (node.inventoryItem?.inventoryLevels?.edges) {
              for (const levelEdge of node.inventoryItem.inventoryLevels.edges) {
                if (levelEdge.node.location.id === TARGET_LOCATION_GID) {
                  isAtLocation = true;
                  const available = levelEdge.node.quantities?.find((q) => q.name === 'available');
                  if (available) {
                    locationInventory = available.quantity;
                  }
                  break;
                }
              }
            }

            if (!isAtLocation) continue;

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
              locationIds: [],
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

export async function getShopifyProductsByTag(tag: string, locationId?: number): Promise<Product[]> {
  const shopifyClient = getShopifyGraphQLClient();
  const allProducts: Product[] = [];

  const ResponseSchema = createGraphQLResponseSchema(GetVariantsBySkuQuerySchema);

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
          if (seenSkus.has(variant.sku.toLowerCase())) continue;
          seenSkus.add(variant.sku.toLowerCase());

          let isAtLocation = false;
          let locationInventory = 0;
          const TARGET_LOCATION_ID = locationId?.toString() || env.GAMMA_WAREHOUSE_LOCATION_ID.toString();
          const TARGET_LOCATION_GID = `gid://shopify/Location/${TARGET_LOCATION_ID}`;

          if (variant.inventoryItem?.inventoryLevels?.edges) {
            for (const levelEdge of variant.inventoryItem.inventoryLevels.edges) {
              if (levelEdge.node.location.id === TARGET_LOCATION_GID) {
                isAtLocation = true;
                const available = levelEdge.node.quantities?.find(q => q.name === 'available');
                if (available) {
                  locationInventory = available.quantity;
                }
                break;
              }
            }
          }

          if (!isAtLocation) continue;

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
      cursor = parsedResponse.data?.productVariants?.pageInfo?.hasNextPage ? (parsedResponse.data?.productVariants?.pageInfo?.endCursor || null) : null;
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
      const rawResponse = await retryOperation(async () => {
        return await shopifyClient.request(GET_UPDATED_PRODUCTS_QUERY, {
          variables: { query, cursor },
        });
      });

      const parsedResponse = ResponseSchema.parse(rawResponse);
      const productEdges = parsedResponse.data?.products?.edges || [];

      for (const edge of productEdges) {
        const productNode = edge.node;
        const variantEdges = productNode.variants?.edges || [];

        for (const variantEdge of variantEdges) {
          const variant = variantEdge.node;

          let isAtLocation = false;
          let locationInventory = 0;
          const TARGET_LOCATION_ID = locationId?.toString() || env.GAMMA_WAREHOUSE_LOCATION_ID.toString();
          const TARGET_LOCATION_GID = `gid://shopify/Location/${TARGET_LOCATION_ID}`;

          if (variant.inventoryItem?.inventoryLevels?.edges) {
            for (const levelEdge of variant.inventoryItem.inventoryLevels.edges) {
              if (levelEdge.node.location.id === TARGET_LOCATION_GID) {
                isAtLocation = true;
                const available = levelEdge.node.quantities?.find(q => q.name === 'available');
                if (available) {
                  locationInventory = available.quantity;
                }
                break;
              }
            }
          }

          if (!isAtLocation) continue;

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
                (edge) => edge.node.location.id
              ) || [],
          });
        }
      }

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

export async function getProductByHandle(handle: string): Promise<ShopifyFullProduct | null> {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(GetProductByHandleQuerySchema);
  try {
    const rawResponse = await shopifyClient.request(GET_PRODUCT_BY_HANDLE_QUERY, {
      variables: { handle },
    });
    const parsedResponse = ResponseSchema.parse(rawResponse);
    return (parsedResponse.data?.productByHandle as ShopifyFullProduct) ?? null;
  } catch (error) {
    logger.error(`Error fetching product by handle "${handle}":`, error);
    return null;
  }
}

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
    const variantInput: Record<string, any> = {
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

  const productSetInput: Record<string, any> = {
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
    const ResponseSchema = createGraphQLResponseSchema(ProductSetResponseSchema);
    const rawResponse = await retryOperation(async () => {
      return await shopifyClient.request(PRODUCT_SET_MUTATION, {
        variables: { synchronous: true, input: productSetInput },
      });
    });

    const parsedResponse = ResponseSchema.parse(rawResponse);
    const userErrors = parsedResponse.data?.productSet?.userErrors;

    if (userErrors && userErrors.length > 0) {
      throw new ShopifyAPIError(userErrors);
    }

    const createdGqlProduct = parsedResponse.data?.productSet?.product;

    if (!createdGqlProduct) {
      throw new Error('Product created but no data returned from Shopify');
    }

    return {
      id: createdGqlProduct.id,
      variants: createdGqlProduct.variants.edges.map((edge) => ({
        id: edge.node.id,
        sku: edge.node.sku,
        inventory_item_id: edge.node.inventoryItem?.id || null
      })),
      images: createdGqlProduct.images.edges.map((edge) => ({
        id: edge.node.id,
        src: edge.node.url
      }))
    };
  } catch (error: unknown) {
    if (error instanceof ShopifyAPIError) throw error;
    logger.error('Error creating product:', error);
    throw new Error(`Failed to create product`);
  }
}

export async function addProductVariant(product: Product): Promise<ShopifyFullProduct | null> {
  const graphQLClient = getShopifyGraphQLClient();
  const GetProductSchema = createGraphQLResponseSchema(GetProductByHandleQuerySchema);

  const productResponse = await graphQLClient.request(GET_PRODUCT_BY_HANDLE_QUERY, {
    variables: { handle: product.handle },
  });

  const parsedProduct = GetProductSchema.parse(productResponse);
  const productByHandle = parsedProduct.data?.productByHandle;
  const productGid = productByHandle?.id;

  if (!productGid) {
    throw new Error(`Could not find product with handle ${product.handle} to add variant to.`);
  }

  const existingImages = productByHandle?.images?.edges.map((e) => e.node) || [];

  const getOptionValue = (value: string | null | undefined, fallback: string | null) =>
    value?.trim() ? value.trim() : fallback;

  let imageIdGid = product.imageId ? `gid://shopify/MediaImage/${product.imageId}` : null;

  if (product.mediaUrl && !imageIdGid) {
    const imageFilename = product.mediaUrl.split('/').pop()?.split('?')[0];
    const existingImage = existingImages.find((img) =>
      img.url.includes(imageFilename as string)
    );

    if (existingImage) {
      imageIdGid = existingImage.id;
    } else {
      try {
        const newImage = await addProductImage(productGid, product.mediaUrl);
        imageIdGid = `gid://shopify/MediaImage/${newImage.id}`;
      } catch (error) {
        logger.warn(`Failed to upload image from URL ${product.mediaUrl}.`);
      }
    }
  }

  const variantInput: Record<string, any> = {
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
    const ResponseSchema = createGraphQLResponseSchema(ProductVariantCreateResponseSchema);
    const rawResponse = await retryOperation(async () => {
      return await graphQLClient.request(PRODUCT_VARIANT_CREATE_MUTATION, {
        variables: { input: variantInput },
      });
    });

    const parsedResponse = ResponseSchema.parse(rawResponse);
    const userErrors = parsedResponse.data?.productVariantCreate?.userErrors;

    if (userErrors && userErrors.length > 0) {
      throw new ShopifyAPIError(userErrors);
    }

    return await getFullProduct(productGid);
  } catch (error: unknown) {
    if (error instanceof ShopifyAPIError) throw error;
    logger.error('Error adding variant:', error);
    throw new Error(`Failed to add variant`);
  }
}

export async function updateProduct(
  id: string,
  input: { title?: string; bodyHtml?: string; templateSuffix?: string; tags?: string }
) {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(ProductUpdateResponseSchema);

  if (!id.includes('gid://shopify/Product/')) {
    id = `gid://shopify/Product/${id}`;
  }

  const payload: Record<string, any> = { id };

  if (input.bodyHtml !== undefined) payload.bodyHtml = input.bodyHtml;
  if (input.title !== undefined) payload.title = input.title;
  if (input.templateSuffix !== undefined) payload.templateSuffix = input.templateSuffix;
  if (input.tags !== undefined) payload.tags = input.tags;

  try {
    const rawResponse = await retryOperation(async () => {
      return await shopifyClient.request(UPDATE_PRODUCT_MUTATION, {
        variables: { input: payload },
      });
    });

    const parsedResponse = ResponseSchema.parse(rawResponse);
    const userErrors = parsedResponse.data?.productUpdate?.userErrors;

    if (userErrors && userErrors.length > 0) {
      throw new ShopifyAPIError(userErrors);
    }
    return parsedResponse.data?.productUpdate?.product;
  } catch (error: unknown) {
    if (error instanceof ShopifyAPIError) throw error;
    logger.error('Error updating product:', error);
    throw new Error(`Failed to update product`);
  }
}

export async function updateProductVariant(
  productId: string,
  variantId: string | number,
  input: { image_id?: string | null; price?: number; compare_at_price?: number | null; weight?: number; weight_unit?: 'g' | 'lb' }
) {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(ProductVariantsBulkUpdateResponseSchema);

  const payload: Record<string, any> = {
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
    const rawResponse = await retryOperation(async () => {
      return await shopifyClient.request(UPDATE_PRODUCT_VARIANT_MUTATION, {
        variables: {
          productId: productId.includes('gid://') ? productId : `gid://shopify/Product/${productId}`,
          variants: [payload]
        },
      });
    });

    const parsedResponse = ResponseSchema.parse(rawResponse);
    const userErrors = parsedResponse.data?.productVariantsBulkUpdate?.userErrors;

    if (userErrors && userErrors.length > 0) {
      throw new ShopifyAPIError(userErrors);
    }

    return parsedResponse.data?.productVariantsBulkUpdate?.productVariants?.[0];
  } catch (error: unknown) {
    if (error instanceof ShopifyAPIError) throw error;
    logger.error('Error updating variant:', error);
    throw new Error(`Failed to update variant`);
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(ProductDeleteResponseSchema);

  if (!productId.includes('gid://shopify/Product/')) {
    productId = `gid://shopify/Product/${productId}`;
  }

  try {
    await retryOperation(async () => {
      const rawResponse = await shopifyClient.request(PRODUCT_DELETE_MUTATION, {
        variables: { input: { id: productId } }
      });

      const parsedResponse = ResponseSchema.parse(rawResponse);
      const userErrors = parsedResponse.data?.productDelete?.userErrors;

      if (userErrors && userErrors.length > 0) {
        throw new ShopifyAPIError(userErrors);
      }
    });
  } catch (error: unknown) {
    if (error instanceof ShopifyAPIError) throw error;
    logger.error(`Error deleting product ID ${productId}:`, error);
    throw new Error(`Failed to delete product.`);
  }
}

export async function deleteProductVariant(productId: string, variantId: string): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(ProductVariantDeleteResponseSchema);

  try {
    await retryOperation(async () => {
      const rawResponse = await shopifyClient.request(PRODUCT_VARIANT_DELETE_MUTATION, {
        variables: { id: variantId.includes('gid://') ? variantId : `gid://shopify/ProductVariant/${variantId}` }
      });

      const parsedResponse = ResponseSchema.parse(rawResponse);
      const userErrors = parsedResponse.data?.productVariantDelete?.userErrors;

      if (userErrors && userErrors.length > 0) {
        throw new ShopifyAPIError(userErrors);
      }
    });
  } catch (error: unknown) {
    if (error instanceof ShopifyAPIError) throw error;
    logger.error(`Error deleting variant ID ${variantId}:`, error);
    throw new Error(`Failed to delete variant.`);
  }
}

export async function publishProductToSalesChannels(productGid: string): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(GetAllPublicationsQuerySchema);
  const rawPublicationsResponse = await shopifyClient.request(GET_ALL_PUBLICATIONS_QUERY);
  const parsedPublications = ResponseSchema.parse(rawPublicationsResponse);
  const publications = parsedPublications.data?.publications?.edges.map((edge) => edge.node) || [];

  if (publications.length === 0) return;

  const publicationInputs = publications.map((pub) => ({ publicationId: pub.id }));

  try {
    const PublishSchema = createGraphQLResponseSchema(PublishablePublishResponseSchema);
    await retryOperation(async () => {
      const rawResponse = await shopifyClient.request(PUBLISHABLE_PUBLISH_MUTATION, {
        variables: { id: productGid, input: publicationInputs },
      });

      const parsedResponse = PublishSchema.parse(rawResponse);
      const userErrors = parsedResponse.data?.publishablePublish?.userErrors;
      if (userErrors && userErrors.length > 0) {
        throw new ShopifyAPIError(userErrors);
      }
    });
  } catch (error) {
    logger.error(`Error during publishProductToSalesChannels:`, error);
  }
}

export async function addProductTags(productId: string, tags: string[]): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(TagsAddResponseSchema);
  try {
    await retryOperation(async () => {
      const rawResponse = await shopifyClient.request(ADD_TAGS_MUTATION, {
        variables: { id: productId, tags },
      });
      const parsedResponse = ResponseSchema.parse(rawResponse);
      const userErrors = parsedResponse.data?.tagsAdd?.userErrors;
      if (userErrors && userErrors.length > 0) {
        throw new ShopifyAPIError(userErrors);
      }
    });
  } catch (error: unknown) {
    throw error;
  }
}

export async function removeProductTags(productId: string, tags: string[]): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(TagsRemoveResponseSchema);
  try {
    await retryOperation(async () => {
      const rawResponse = await shopifyClient.request(REMOVE_TAGS_MUTATION, {
        variables: { id: productId, tags },
      });
      const parsedResponse = ResponseSchema.parse(rawResponse);
      const userErrors = parsedResponse.data?.tagsRemove?.userErrors;
      if (userErrors && userErrors.length > 0) {
        throw new ShopifyAPIError(userErrors);
      }
    });
  } catch (error: unknown) {
    throw error;
  }
}

export async function addProductImage(
  productId: string | number,
  imageUrl: string
): Promise<ShopifyProductImage> {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(ProductCreateMediaResponseSchema);
  const productGid = productId.toString().includes('gid://') ? productId.toString() : `gid://shopify/Product/${productId}`;

  try {
    const rawResponse = await retryOperation(async () => {
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

    const parsedResponse = ResponseSchema.parse(rawResponse);
    const userErrors = parsedResponse.data?.productCreateMedia?.userErrors;
    if (userErrors && userErrors.length > 0) {
      throw new ShopifyAPIError(userErrors);
    }

    const createdMedia = parsedResponse.data?.productCreateMedia?.media?.[0];

    return {
      id: createdMedia?.id || '0',
      product_id: productGid,
      src: createdMedia?.image?.url || imageUrl,
      variant_ids: []
    };
  } catch (error: unknown) {
    if (error instanceof ShopifyAPIError) throw error;
    logger.error(`Error adding image:`, error);
    throw new Error(`Failed to add image`);
  }
}

export async function deleteProductImage(productId: string, imageId: string): Promise<void> {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(ProductDeleteMediaResponseSchema);
  try {
    await retryOperation(async () => {
      const rawResponse = await shopifyClient.request(PRODUCT_DELETE_MEDIA_MUTATION, {
        variables: {
          mediaIds: [imageId.includes('gid://') ? imageId : `gid://shopify/MediaImage/${imageId}`],
          productId: productId.includes('gid://') ? productId : `gid://shopify/Product/${productId}`
        }
      });

      const parsedResponse = ResponseSchema.parse(rawResponse);
      const userErrors = parsedResponse.data?.productDeleteMedia?.userErrors;

      if (userErrors && userErrors.length > 0) {
        if (userErrors.some((e) => e.message.includes('not found') || e.message.includes('invalid'))) {
          const rawFallbackResponse = await shopifyClient.request(PRODUCT_DELETE_MEDIA_MUTATION, {
            variables: {
              mediaIds: [`gid://shopify/Media/${imageId}`],
              productId: `gid://shopify/Product/${productId}`
            }
          });
          const parsedFallback = ResponseSchema.parse(rawFallbackResponse);
          const fallbackErrors = parsedFallback.data?.productDeleteMedia?.userErrors;
          if (fallbackErrors && fallbackErrors.length > 0) {
            throw new ShopifyAPIError(fallbackErrors);
          }
          return;
        }
        throw new ShopifyAPIError(userErrors);
      }
    });
  } catch (error: unknown) {
    if (error instanceof ShopifyAPIError) throw error;
    logger.error(`Error deleting image:`, error);
    throw new Error(`Failed to delete image`);
  }
}

export async function getFullProduct(productId: string | number): Promise<ShopifyFullProduct | null> {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(GetFullProductQuerySchema);
  try {
    const rawResponse = await retryOperation(async () => {
      return await shopifyClient.request(GET_FULL_PRODUCT_QUERY, {
        variables: { id: productId.toString().includes('gid://') ? productId.toString() : `gid://shopify/Product/${productId}` }
      });
    });
    const parsedResponse = ResponseSchema.parse(rawResponse);
    return parsedResponse.data?.product ?? null;
  } catch (error: unknown) {
    logger.error(`Error fetching full product :`, error);
    throw new Error(`Failed to fetch product`);
  }
}

export async function getProductImageCounts(productIds: (string | number)[]): Promise<Record<string, number>> {
  const shopifyClient = getShopifyGraphQLClient();
  const counts: Record<string, number> = {};

  const ImageCountSchema = createGraphQLResponseSchema(z.object({
    product: z.object({
      media: z.object({
        totalCount: z.number()
      })
    }).nullable()
  }));

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
      const rawResponse = await shopifyClient.request(query, {
        variables: { id: productGid },
      });
      const parsedResponse = ImageCountSchema.parse(rawResponse);
      const data = parsedResponse.data?.product?.media;
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
