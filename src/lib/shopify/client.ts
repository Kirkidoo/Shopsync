import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { logger } from '@/lib/logger';
import { getRateLimitState, setRateLimitState } from '@/lib/db';

// --- Helper function to introduce a delay ---
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isThrottleError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errorString = JSON.stringify(error);
    if (errorString.includes('Throttled') || errorString.includes('Exceeded 2 calls per second')) return true;
    if ('response' in error && typeof (error as { response?: { statusCode?: number } }).response?.statusCode === 'number') {
      if ((error as { response: { statusCode: number } }).response.statusCode === 429) return true;
    }
    if (error instanceof Error && error.message.includes('Throttled')) return true;
  }
  return false;
}

import { env } from '@/lib/env';

const SHOP_NAME = env.SHOPIFY_SHOP_NAME;

// Helper for generic rate limit state if DB is empty
const DEFAULT_RATE_LIMIT = {
  currentlyAvailable: 20000,
  restoreRate: 100,
};

export interface ShopifyRateLimitExtensions {
  cost?: {
    throttleStatus?: {
      currentlyAvailable: number;
      restoreRate: number;
      maximumAvailable: number;
    }
  }
}

export async function updateRateLimitState(extensions: ShopifyRateLimitExtensions | unknown) {
  const ext = extensions as ShopifyRateLimitExtensions;
  if (ext?.cost?.throttleStatus) {
    const newState = {
      currentlyAvailable: ext.cost.throttleStatus.currentlyAvailable,
      restoreRate: ext.cost.throttleStatus.restoreRate,
    };
    setRateLimitState(SHOP_NAME, newState);
  }
}

export async function checkRateLimit(cost = 100) {
  const state = getRateLimitState(SHOP_NAME) || DEFAULT_RATE_LIMIT;
  
  if (state.currentlyAvailable < cost * 2) {
    const deficit = (cost * 2) - state.currentlyAvailable;
    const waitTime = Math.ceil((deficit / state.restoreRate) * 1000);
    logger.info(`Rate limit tight for ${SHOP_NAME} (Available: ${state.currentlyAvailable}). Sleeping ${waitTime}ms...`);
    await sleep(waitTime);
  }
}

export async function retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 8): Promise<T> {
  let retries = 0;
  while (true) {
    try {
      // Proactive rate limiting
      await checkRateLimit();

      const result = await operation();

      // Update rate limit state from result if available (GraphQL)
      if (result && typeof result === 'object' && 'extensions' in result) {
        await updateRateLimitState((result as { extensions: unknown }).extensions);
      }

      return result;
    } catch (error: unknown) {
      if (isThrottleError(error) && retries < maxRetries) {
        const delay = 1000 * Math.pow(2, retries);
        logger.info(
          `Rate limited for ${SHOP_NAME}. Retrying in ${delay}ms... (Attempt ${retries + 1}/${maxRetries})`
        );
        await sleep(delay);
        retries++;

        // Reset local assumption of safety on error in DB
        const currentState = getRateLimitState(SHOP_NAME) || DEFAULT_RATE_LIMIT;
        setRateLimitState(SHOP_NAME, { ...currentState, currentlyAvailable: 0 });
      } else {
        throw error;
      }
    }
  }
}

export function getShopifyGraphQLClient() {

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
    id: 'offline_' + env.SHOPIFY_SHOP_NAME,
    shop: env.SHOPIFY_SHOP_NAME,
    accessToken: env.SHOPIFY_API_ACCESS_TOKEN,
    isOnline: false,
    state: 'state',
  });

  return new shopify.clients.Graphql({ session });
}
