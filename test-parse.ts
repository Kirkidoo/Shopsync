import 'dotenv/config';
import { checkBulkOperationStatus } from './src/lib/shopify';
import { parseJsonlWithAllSkus } from './src/services/jsonl-parser';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    try {
        const opId = 'gid://shopify/BulkOperation/7134207639869';
        const check = await checkBulkOperationStatus(opId);
        if (check.resultUrl) {
            const res = await fetch(check.resultUrl);
            const text = await res.text();
            fs.writeFileSync('temp.jsonl', text);

            console.log('Testing parseJsonlWithAllSkus');
            const result = await parseJsonlWithAllSkus('temp.jsonl');
            console.log(`Products returned: ${result.products.length}`);
            console.log(`SKUs added: ${result.allSkusInShopify.size}`);
        }
    } catch (e) {
        console.error(e);
    }
}
main();
