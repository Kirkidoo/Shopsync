import Database from 'better-sqlite3';
import path from 'path';
import { Product } from './types';
import { parseJsonlWithAllSkus } from '@/services/jsonl-parser';
import { logger } from './logger';
import { env } from '@/lib/env';

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

    // Clear existing products to ensure a clean sync for "Full Fresh Sync"
    db.prepare('DELETE FROM products').run();

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
    if (locationId) {
        setSyncLocationId(locationId.toString());
    } else {
        const fallBackDir = env.GAMMA_WAREHOUSE_LOCATION_ID.toString();
        setSyncLocationId(fallBackDir);
    }
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
    const rows = db.prepare("SELECT DISTINCT json_extract(data, '$.sku') as sku FROM products WHERE json_extract(data, '$.sku') IS NOT NULL").all() as { sku: string }[];
    const skus = new Set<string>();
    for (const row of rows) {
        if (row.sku) skus.add(row.sku.toLowerCase());
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
 * Retrieves the location ID for which the database was synced.
 */
export function getSyncLocationId(): string | null {
    const row = db.prepare('SELECT value FROM metadata WHERE key = ?').get('syncLocationId') as { value: string } | undefined;
    return row ? row.value : null;
}

/**
 * Updates the location ID used for the database sync.
 */
export function setSyncLocationId(locationId: string) {
    upsertMetadata('syncLocationId', locationId);
}

/**
 * Checks if the database is populated with products.
 */
export function isDatabasePopulated(): boolean {
    const row = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
    return row.count > 0;
}

/**
 * General helper to upsert metadata.
 */
export function upsertMetadata(key: string, value: string) {
    db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(key, value);
}

/**
 * Retrieves the rate limit state for a given shop.
 */
export function getRateLimitState(shopName: string): { currentlyAvailable: number, restoreRate: number } | null {
    const row = db.prepare('SELECT value FROM metadata WHERE key = ?').get(`rateLimit_${shopName}`) as { value: string } | undefined;
    if (row) {
        try {
            return JSON.parse(row.value);
        } catch (e) {
            logger.error(`Error parsing rate limit state for ${shopName}:`, e);
            return null;
        }
    }
    return null;
}

/**
 * Updates the rate limit state for a given shop.
 */
export function setRateLimitState(shopName: string, state: { currentlyAvailable: number, restoreRate: number }) {
    upsertMetadata(`rateLimit_${shopName}`, JSON.stringify(state));
}

export default db;
