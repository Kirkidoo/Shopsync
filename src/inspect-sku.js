
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'shopsync.db');
const db = new Database(dbPath);

const skuToFind = '33-48500';
const rows = db.prepare("SELECT data FROM products WHERE json_extract(data, '$.sku') = ?").all(skuToFind);

console.log(`Found ${rows.length} rows for SKU ${skuToFind}`);
rows.forEach((row, i) => {
    console.log(`\nRow ${i + 1}:`);
    console.log(JSON.stringify(JSON.parse(row.data), null, 2));
});
