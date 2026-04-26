import 'dotenv/config';
import { checkBulkOperationStatus } from './src/lib/shopify';
import fs from 'fs';

async function main() {
    try {
        const opId = 'gid://shopify/BulkOperation/7134207639869';
        const check = await checkBulkOperationStatus(opId);
        if (check.resultUrl) {
            const res = await fetch(check.resultUrl);
            const text = await res.text();
            const lines = text.split('\n').filter(Boolean).slice(0, 50);

            for (let i = 0; i < lines.length; i++) {
                const parsed = JSON.parse(lines[i]);
                const simplified = {
                    node: parsed.id?.split('/').pop() || 'NO_ID',
                    type: parsed.id?.split('/')[3] || 'UNKNOWN',
                    parentId: parsed.__parentId,
                    sku: parsed.sku,
                    location: parsed.location?.id,
                    available: parsed.quantities?.find(q => q.name === 'available')?.quantity
                };
                console.log(simplified);
            }
        }
    } catch (e) {
        console.error(e);
    }
}
main();
