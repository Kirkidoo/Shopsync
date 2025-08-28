import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import 'dotenv/config';
import { Product } from '@/lib/types';

const shopify = shopifyApi({
  apiKey: 'dummy', // Not actually used for private apps but required by the library
  apiSecretKey: 'dummy', // Not actually used for private apps but required by the library
  scopes: ['read_products'],
  hostName: 'dummy.ngrok.io', // Not actually used for private apps but required by the library
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
});

const GET_ALL_PRODUCTS_QUERY = `
  query getAllProducts($cursor: String) {
    products(first: 250, after: $cursor) {
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

export async function getAllShopifyProducts(): Promise<Product[]> {
    if (!process.env.SHOPIFY_SHOP_NAME || !process.env.SHOPIFY_API_ACCESS_TOKEN) {
        throw new Error("Shopify environment variables are not set. Please create a .env.local file.");
    }

    const session = new Session({
      shop: process.env.SHOPIFY_SHOP_NAME!,
      accessToken: process.env.SHOPIFY_API_ACCESS_TOKEN!,
      isOnline: false,
      state: 'state',
    });

    const shopifyClient = new shopify.clients.Graphql({ session });

    const products: Product[] = [];
    let hasNextPage = true;
    let cursor = null;

    while(hasNextPage) {
        const response: any = await shopifyClient.query({
            data: {
                query: GET_ALL_PRODUCTS_QUERY,
                variables: {
                    cursor: cursor
                }
            }
        });

        const productEdges = response.body.data.products.edges;

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
    }
    
    return products;
}