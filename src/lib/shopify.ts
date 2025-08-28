'use server';

import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { Product } from '@/lib/types';

// Helper function to introduce a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const GET_PRODUCTS_BY_SKU_QUERY = `
  query getProductsBySku($query: String!) {
    products(first: 250, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          variants(first: 1) {
            edges {
              node {
                sku
                price
              }
            }
          }
        }
      }
    }
  }
`;

export async function getShopifyProductsBySku(skus: string[]): Promise<Product[]> {
    console.log(`Starting to fetch ${skus.length} products from Shopify by SKU.`);
    if (!process.env.SHOPIFY_SHOP_NAME || !process.env.SHOPIFY_API_ACCESS_TOKEN) {
        console.error("Shopify environment variables are not set.");
        throw new Error("Shopify environment variables are not set. Please create a .env.local file.");
    }
    
    const shopify = shopifyApi({
      apiKey: 'dummy',
      apiSecretKey: 'dummy',
      scopes: ['read_products'],
      hostName: 'dummy.ngrok.io',
      apiVersion: LATEST_API_VERSION,
      isEmbeddedApp: false,
      maxRetries: 3,
    });

    const session = new Session({
      shop: process.env.SHOPIFY_SHOP_NAME!,
      accessToken: process.env.SHOPIFY_API_ACCESS_TOKEN!,
      isOnline: false,
      state: 'state',
    });

    const shopifyClient = new shopify.clients.Graphql({ session });

    const products: Product[] = [];
    const skuBatches: string[][] = [];

    // Shopify's search query has a limit. Batch SKUs to avoid hitting it.
    // A reasonable batch size is ~40-50 SKUs.
    for (let i = 0; i < skus.length; i += 40) {
        skuBatches.push(skus.slice(i, i + 40));
    }

    console.log(`Processing ${skuBatches.length} batches of SKUs.`);

    for (const batch of skuBatches) {
        const query = batch.map(sku => `sku:${sku}`).join(' OR ');
        let hasNextPage = true;
        let cursor: string | null = null;
        
        while (hasNextPage) {
            try {
                console.log(`Fetching products for batch with query: ${query}`);
                await sleep(500); // Add a small delay between each request to be safe

                const response: any = await shopifyClient.query({
                    data: {
                        query: GET_PRODUCTS_BY_SKU_QUERY,
                        variables: {
                            query: query,
                            cursor: cursor,
                        }
                    }
                });
                
                if (response.body.errors) {
                  console.error('GraphQL Errors:', response.body.errors);
                  if (JSON.stringify(response.body.errors).includes('Throttled')) {
                     console.log("Throttled by Shopify, waiting 5 seconds before retrying...");
                     await sleep(5000);
                     continue;
                  }
                  throw new Error(`GraphQL Error: ${JSON.stringify(response.body.errors)}`);
                }

                const productEdges = response.body.data.products.edges;
                console.log(`Received ${productEdges.length} products in this page.`);

                for (const edge of productEdges) {
                    const variant = edge.node.variants.edges[0]?.node;
                    if(variant && variant.sku) {
                        products.push({
                            sku: variant.sku,
                            name: edge.node.title,
                            price: parseFloat(variant.price)
                        });
                    }
                }
                
                hasNextPage = response.body.data.products.pageInfo.hasNextPage;
                cursor = response.body.data.products.pageInfo.endCursor;

            } catch (error) {
                console.error("Error during Shopify product fetch loop:", error);
                 if (error instanceof Error && error.message.includes('Throttled')) {
                    console.log("Caught throttled error, waiting 5 seconds before retrying...");
                    await sleep(5000);
                } else {
                   // Don't rethrow, just log and continue with the next batch.
                   console.error("An unexpected error occurred while fetching a batch. Skipping to next.", error);
                   hasNextPage = false; // Stop trying this batch
                }
            }
        }
    }
    
    console.log(`Finished fetching all Shopify products. Total found: ${products.length}`);
    return products;
}
