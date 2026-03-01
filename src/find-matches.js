
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'shopsync.db');
const db = new Database(dbPath);

const rows = db.prepare('SELECT data FROM products').all();

let count = 0;
rows.forEach(row => {
    const p = JSON.parse(row.data);
    if (p.compareAtPrice !== null) {
        const p1 = p.price;
        const p2 = p.compareAtPrice;
        if (Number(p1) === Number(p2)) {
            count++;
            if (count < 10) {
                console.log(`Match found: SKU ${p.sku}, Price: ${p1} (${typeof p1}), CompareAt: ${p2} (${typeof p2})`);
                console.log(`Strict Equality Check: ${p1 === p2}`);
            }
        }
    }
});

console.log(`\nTotal products where Price == CompareAtPrice (numerically): ${count}`);
