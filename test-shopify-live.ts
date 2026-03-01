
require('dotenv').config({ path: '.env.local' });
// Since this is in the root, it should use src/lib/shopify but that won't work easily with require if it's TS
// I'll use a dynamic import or just run it via ts-node / tsx if available
// Actually, I'll just write it as a TS file and run it with npx tsx
import { getShopifyProductsBySku } from './src/lib/shopify';

async function test() {
    const sku = '33-48500';
    console.log(`Fetching live data for SKU: ${sku}...`);
    try {
        const products = await getShopifyProductsBySku([sku]);
        console.log(`Found ${products.length} matching products in Shopify.`);
        if (products.length > 0) {
            console.log(JSON.stringify(products[0], null, 2));
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
