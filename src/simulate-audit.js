
const { findMismatches } = require('./services/audit');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'shopsync.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT data FROM products').all();

let flaggedCount = 0;
let totalChecked = 0;

rows.forEach(row => {
    const shopifyProduct = JSON.parse(row.data);
    if (shopifyProduct.compareAtPrice !== null) {
        if (Number(shopifyProduct.price) === Number(shopifyProduct.compareAtPrice)) {
            totalChecked++;
            // Create a dummy csvProduct that matches price
            const csvProduct = { ...shopifyProduct };

            const mismatches = findMismatches(csvProduct, shopifyProduct, 'regular.csv');
            const stickySale = mismatches.find(m => m.field === 'compare_at_price');

            if (stickySale) {
                flaggedCount++;
                if (flaggedCount < 10) {
                    console.log(`FLAGGED: SKU ${shopifyProduct.sku}, Price: ${shopifyProduct.price}, CompareAt: ${shopifyProduct.compareAtPrice}`);
                }
            }
        }
    }
});

console.log(`\nTotal checked where P == CP: ${totalChecked}`);
console.log(`Total flagged as Sticky Sale: ${flaggedCount}`);
