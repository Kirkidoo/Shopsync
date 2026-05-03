'use server';

import { logger } from '@/lib/logger';
import { getShopifyGraphQLClient, retryOperation } from './client';
import {
  GET_LOCATIONS_QUERY,
  INVENTORY_BULK_TOGGLE_MUTATION,
  INVENTORY_SET_QUANTITIES_MUTATION,
  GET_COLLECTION_BY_TITLE_QUERY,
  COLLECTION_ADD_PRODUCTS_MUTATION,
  createGraphQLResponseSchema,
  GetLocationsQuerySchema,
  InventoryBulkToggleActivationResponseSchema,
  InventorySetQuantitiesResponseSchema,
  GetCollectionByTitleQuerySchema,
  CollectionAddProductsResponseSchema,
  ShopifyAPIError,
} from './types';

import { env } from '@/lib/env';

export const GAMMA_WAREHOUSE_LOCATION_ID = env.GAMMA_WAREHOUSE_LOCATION_ID;

export async function getShopifyLocations(): Promise<{ id: string; name: string }[]> {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(GetLocationsQuerySchema);

  try {
    const rawResponse = await retryOperation(async () => {
      return await shopifyClient.request(GET_LOCATIONS_QUERY);
    });

    const parsedResponse = ResponseSchema.parse(rawResponse);
    const edges = parsedResponse.data?.locations?.edges || [];
    const locations = edges.map((edge) => ({
      id: edge.node.id,
      name: edge.node.name
    }));

    return locations;
  } catch (error: unknown) {
    logger.error('Error fetching Shopify locations:', error);
    throw new Error('Failed to fetch locations');
  }
}

export async function connectInventoryToLocation(inventoryItemId: string, locationId: string | number) {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(InventoryBulkToggleActivationResponseSchema);

  if (!inventoryItemId.includes('gid://')) {
    inventoryItemId = `gid://shopify/InventoryItem/${inventoryItemId.split('/').pop()}`;
  }

  try {
    await retryOperation(async () => {
      const rawResponse = await shopifyClient.request(INVENTORY_BULK_TOGGLE_MUTATION, {
        variables: {
          inventoryItemId,
          inventoryItemUpdates: [{ locationId: locationId.toString().includes('gid://') ? locationId.toString() : `gid://shopify/Location/${locationId}`, activate: true }]
        }
      });

      const parsedResponse = ResponseSchema.parse(rawResponse);
      const userErrors = parsedResponse.data?.inventoryBulkToggleActivation?.userErrors;

      if (userErrors && userErrors.length > 0) {
        // Ignore "already stocked" error
        if (JSON.stringify(userErrors).toLowerCase().includes('already stocked')) return;
        throw new ShopifyAPIError(userErrors);
      }
    });
  } catch (error: unknown) {
    if (error instanceof ShopifyAPIError) throw error;
    logger.error(`Error connecting inventory:`, error);
    throw new Error(`Failed to connect inventory to location`);
  }
}

export async function disconnectInventoryFromLocation(inventoryItemId: string, locationId: string | number) {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(InventoryBulkToggleActivationResponseSchema);

  if (!inventoryItemId) return;
  if (!inventoryItemId.includes('gid://')) {
    inventoryItemId = `gid://shopify/InventoryItem/${inventoryItemId.split('/').pop()}`;
  }

  try {
    await retryOperation(async () => {
      const rawResponse = await shopifyClient.request(INVENTORY_BULK_TOGGLE_MUTATION, {
        variables: {
          inventoryItemId,
          inventoryItemUpdates: [{ locationId: locationId.toString().includes('gid://') ? locationId.toString() : `gid://shopify/Location/${locationId}`, activate: false }]
        }
      });

      const parsedResponse = ResponseSchema.parse(rawResponse);
      const userErrors = parsedResponse.data?.inventoryBulkToggleActivation?.userErrors;

      if (userErrors && userErrors.length > 0) {
        throw new ShopifyAPIError(userErrors);
      }
    });
  } catch (error: unknown) {
    logger.warn(`Warning: Could not disconnect inventory from location:`, error);
  }
}

export async function inventorySetQuantities(
  inventoryItemId: string,
  quantity: number,
  locationId: string | number
) {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(InventorySetQuantitiesResponseSchema);
  const locationGid = locationId.toString().includes('gid://') ? locationId.toString() : `gid://shopify/Location/${locationId}`;
  const input = {
    name: 'available',
    reason: 'correction',
    ignoreCompareQuantity: true,
    quantities: [{ inventoryItemId, locationId: locationGid, quantity }],
  };

  try {
    const rawResponse = await retryOperation(async () => {
      return await shopifyClient.request(INVENTORY_SET_QUANTITIES_MUTATION, {
        variables: { input },
      });
    });

    const parsedResponse = ResponseSchema.parse(rawResponse);
    const userErrors = parsedResponse.data?.inventorySetQuantities?.userErrors;

    if (userErrors && userErrors.length > 0) {
      throw new ShopifyAPIError(userErrors);
    }
  } catch (error: unknown) {
    if (error instanceof ShopifyAPIError) throw error;
    logger.error('Error updating inventory via GraphQL:', error);
    throw error;
  }
}

export async function getCollectionIdByTitle(title: string): Promise<string | null> {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(GetCollectionByTitleQuerySchema);
  const formattedQuery = `title:"${title}"`;
  try {
    const rawResponse = await shopifyClient.request(GET_COLLECTION_BY_TITLE_QUERY, {
      variables: { query: formattedQuery },
    });
    const parsedResponse = ResponseSchema.parse(rawResponse);
    return parsedResponse.data?.collections?.edges?.[0]?.node?.id || null;
  } catch (error) {
    return null;
  }
}

export async function linkProductToCollection(productGid: string, collectionGid: string) {
  const shopifyClient = getShopifyGraphQLClient();
  const ResponseSchema = createGraphQLResponseSchema(CollectionAddProductsResponseSchema);

  if (!productGid.includes('gid://')) productGid = `gid://shopify/Product/${productGid}`;
  if (!collectionGid.includes('gid://')) collectionGid = `gid://shopify/Collection/${collectionGid}`;

  try {
    await retryOperation(async () => {
      const rawResponse = await shopifyClient.request(COLLECTION_ADD_PRODUCTS_MUTATION, {
        variables: { id: collectionGid, productIds: [productGid] }
      });

      const parsedResponse = ResponseSchema.parse(rawResponse);
      const userErrors = parsedResponse.data?.collectionAddProducts?.userErrors;

      if (userErrors && userErrors.length > 0) {
        throw new ShopifyAPIError(userErrors);
      }
    });
  } catch (error: unknown) {
    logger.warn(`Could not link product to collection:`, error);
  }
}
