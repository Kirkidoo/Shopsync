import Database from 'better-sqlite3';
import path from 'path';
import { Product } from './types';
import { parseJsonlWithAllSkus } from '@/services/jsonl-parser';
import { logger } from './logger';

// Initialize the database connection
// The database file will be created in the project root
const dbPath = path.resolve(process.cwd(), 'shopsync.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create the necessary tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    variantId TEXT PRIMARY KEY,
    data TEXT
  );
`);

/**
 * Parses the bulk export JSONL and does a batch INSERT/REPLACE of all products.
 */
export async function seedDatabaseFromJsonl(filePath: string, locationId?: number) {
    const { products, allSkusInShopify } = await parseJsonlWithAllSkus(filePath, locationId);

    const insert = db.prepare('INSERT OR REPLACE INTO products (variantId, data) VALUES (?, ?)');

    const insertMany = db.transaction((productsToInsert: Product[]) => {
        // Clear existing products to ensure a clean sync if needed?
        // User asked for INSERT/REPLACE, so we'll stick to that.
        for (const product of productsToInsert) {
            insert.run(product.variantId, JSON.stringify(product));
        }
    });

    insertMany(products);

    // Update metadata
    setLastSyncDate(new Date().toISOString());
    db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(
        'allSkusInShopify',
        JSON.stringify(Array.from(allSkusInShopify))
    );
}

/**
 * Upserts a batch of products into the database.
 */
export function updateProductsInDb(products: Product[]) {
    const insert = db.prepare('INSERT OR REPLACE INTO products (variantId, data) VALUES (?, ?)');

    const updateMany = db.transaction((productsToUpdate: Product[]) => {
        for (const product of productsToUpdate) {
            insert.run(product.variantId, JSON.stringify(product));
        }
    });

    updateMany(products);

    // Also update allSkusInShopify metadata in case new SKUs were added
    // This is a bit expensive to do every time but keeps it synced
    const allProducts = getProductsFromDb();
    const skus = Array.from(new Set(allProducts.map(p => p.sku.toLowerCase()).filter(Boolean)));
    upsertMetadata('allSkusInShopify', JSON.stringify(skus));
}

/**
 * Retrieves all products from the database and parses the JSON data.
 */
export function getProductsFromDb(): Product[] {
    const rows = db.prepare('SELECT data FROM products').all() as { data: string }[];
    return rows.map(row => JSON.parse(row.data) as Product);
}

/**
 * Retrieves all unique SKUs from the products in the database.
 */
export function getAllSkusFromDb(): Set<string> {
    const row = db.prepare('SELECT value FROM metadata WHERE key = ?').get('allSkusInShopify') as { value: string } | undefined;
    if (row) {
        try {
            return new Set(JSON.parse(row.value));
        } catch (e) {
            logger.error('Failed to parse allSkusInShopify from metadata', e);
        }
    }
    // Fallback to products in DB
    const products = getProductsFromDb();
    const skus = new Set<string>();
    for (const p of products) {
        if (p.sku) skus.add(p.sku.toLowerCase());
    }
    return skus;
}

/**
 * Retrieves the last sync date from the metadata table.
 */
export function getLastSyncDate(): string | null {
    const row = db.prepare('SELECT value FROM metadata WHERE key = ?').get('lastSyncDate') as { value: string } | undefined;
    return row ? row.value : null;
}

/**
 * Updates the last sync date in the metadata table.
 */
export function setLastSyncDate(dateStr: string) {
    upsertMetadata('lastSyncDate', dateStr);
}

/**
 * General helper to upsert metadata.
 */
export function upsertMetadata(key: string, value: string) {
    db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(key, value);
}

export default db;
