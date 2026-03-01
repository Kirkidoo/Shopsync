'use server';

import {
    Product,
    AuditResult,
    DuplicateSku,
} from '@/lib/types';
import {
    startProductExportBulkOperation as startShopifyBulkOp,
    checkBulkOperationStatus as checkShopifyBulkOpStatus,
    downloadBulkOperationResultToFile,
    syncUpdatedProducts
} from '@/lib/shopify';
import fsPromises from 'fs/promises';
import path from 'path';
import * as csvService from '@/services/csv';
import * as auditService from '@/services/audit';
import { logger } from '@/lib/logger';
import {
    seedDatabaseFromJsonl,
    getProductsFromDb,
    getAllSkusFromDb,
    getLastSyncDate,
    setLastSyncDate,
    updateProductsInDb
} from '@/lib/db';

// ── Cache helpers (private to this module) ──────────────────────────

const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE_PATH = path.join(CACHE_DIR, 'shopify-bulk-export.jsonl');
const CACHE_INFO_PATH = path.join(CACHE_DIR, 'cache-info.json');

async function ensureCacheDirExists() {
    try {
        await fsPromises.access(CACHE_DIR);
    } catch {
        await fsPromises.mkdir(CACHE_DIR, { recursive: true });
    }
}

// ── Exported server actions ─────────────────────────────────────────

export async function runAudit(
    csvFileName: string,
    ftpData: FormData,
    locationId?: number
): Promise<{ report: AuditResult[]; summary: any; duplicates: DuplicateSku[] } | null> {
    // 1. Get CSV products
    const csvProducts = await csvService.getCsvProducts(csvFileName, ftpData);
    if (!csvProducts) return null;

    // 2. Perform incremental sync
    try {
        const lastSyncDate = getLastSyncDate();
        if (lastSyncDate) {
            const newSyncThreshold = new Date().toISOString();
            const updated = await syncUpdatedProducts(lastSyncDate, locationId);
            if (updated.length > 0) {
                updateProductsInDb(updated);
            }
            setLastSyncDate(newSyncThreshold);
        } else {
            setLastSyncDate(new Date().toISOString());
        }
    } catch (error) {
        logger.error('Incremental sync failed during runAudit, proceeding with existing data', error);
    }

    // 3. Get all products from DB for audit
    const shopifyProducts = getProductsFromDb();
    const allSkusInShopify = getAllSkusFromDb();

    // 4. Run comparison
    return await auditService.runBulkAuditComparison(
        csvProducts,
        shopifyProducts,
        csvFileName,
        allSkusInShopify
    );
}

export async function checkBulkCacheStatus(): Promise<{ lastModified: string | null }> {
    return { lastModified: getLastSyncDate() };
}

export async function getCsvProducts(
    csvFileName: string,
    ftpData: FormData
): Promise<Product[] | null> {
    return await csvService.getCsvProducts(csvFileName, ftpData);
}

export async function getShopifyProductsFromCache(locationId?: number): Promise<Product[] | null> {
    try {
        return getProductsFromDb();
    } catch (error) {
        logger.error('Failed to read products from database.', error);
        return null;
    }
}

export async function getShopifyProductsFromCacheWithAllSkus(locationId?: number): Promise<{
    products: Product[];
    allSkusInShopify: Set<string>;
} | null> {
    try {
        return {
            products: getProductsFromDb(),
            allSkusInShopify: getAllSkusFromDb()
        };
    } catch (error) {
        logger.error('Failed to read products or SKUs from database.', error);
        return null;
    }
}

export async function startBulkOperation(): Promise<{
    id: string;
    status: string;
    resultUrl?: string;
}> {
    return await startShopifyBulkOp();
}

export async function checkBulkOperationStatus(
    id: string
): Promise<{ id: string; status: string; resultUrl?: string }> {
    return await checkShopifyBulkOpStatus(id);
}

export async function getBulkOperationResultAndParse(
    url: string,
    locationId?: number
): Promise<Product[] | null> {
    await ensureCacheDirExists();
    try {
        await downloadBulkOperationResultToFile(url, CACHE_FILE_PATH);
        await seedDatabaseFromJsonl(CACHE_FILE_PATH, locationId);

        const products = getProductsFromDb();
        return products;
    } catch (error) {
        logger.error('Failed to download or seed database', error);
        return null;
    }
}

export async function getBulkOperationResultAndParseWithAllSkus(
    url: string,
    locationId?: number
): Promise<{
    products: Product[];
    allSkusInShopify: Set<string>;
} | null> {
    await ensureCacheDirExists();
    try {
        await downloadBulkOperationResultToFile(url, CACHE_FILE_PATH);
        await seedDatabaseFromJsonl(CACHE_FILE_PATH, locationId);

        return {
            products: getProductsFromDb(),
            allSkusInShopify: getAllSkusFromDb()
        };
    } catch (error) {
        logger.error('Failed to download or seed database', error);
        return null;
    }
}

export async function runBulkAuditComparison(
    csvProducts: Product[],
    shopifyProducts: Product[],
    csvFileName: string,
    allSkusInShopify?: Set<string>
): Promise<{ report: AuditResult[]; summary: any; duplicates: DuplicateSku[] }> {
    return await auditService.runBulkAuditComparison(
        csvProducts,
        shopifyProducts,
        csvFileName,
        allSkusInShopify
    );
}

export async function runBulkAuditFromCache(
    csvProducts: Product[],
    csvFileName: string,
    locationId?: number
): Promise<{ report: AuditResult[]; summary: any; duplicates: DuplicateSku[] } | null> {
    try {
        // 1. Perform incremental sync
        const lastSyncDate = getLastSyncDate();
        if (lastSyncDate) {
            const newSyncThreshold = new Date().toISOString();
            const updated = await syncUpdatedProducts(lastSyncDate, locationId);
            if (updated.length > 0) {
                updateProductsInDb(updated);
            }
            setLastSyncDate(newSyncThreshold);
        } else {
            setLastSyncDate(new Date().toISOString());
        }

        // 2. Get data from DB
        const shopifyProducts = getProductsFromDb();
        const allSkusInShopify = getAllSkusFromDb();

        logger.info(
            `Parsed ${shopifyProducts.length} products from DB, ${allSkusInShopify.size} total SKUs in Shopify`
        );
        return await auditService.runBulkAuditComparison(
            csvProducts,
            shopifyProducts,
            csvFileName,
            allSkusInShopify
        );
    } catch (error) {
        logger.error('Failed to run bulk audit from database', error);
        return null;
    }
}

export async function runBulkAuditFromDownload(
    csvProducts: Product[],
    csvFileName: string,
    resultUrl: string,
    locationId?: number
): Promise<{ report: AuditResult[]; summary: any; duplicates: DuplicateSku[] } | null> {
    await ensureCacheDirExists();
    try {
        await downloadBulkOperationResultToFile(resultUrl, CACHE_FILE_PATH);
        await seedDatabaseFromJsonl(CACHE_FILE_PATH, locationId);

        const shopifyProducts = getProductsFromDb();
        const allSkusInShopify = getAllSkusFromDb();

        logger.info(
            `Parsed ${shopifyProducts.length} products from DB, ${allSkusInShopify.size} total SKUs in Shopify`
        );
        return await auditService.runBulkAuditComparison(
            csvProducts,
            shopifyProducts,
            csvFileName,
            allSkusInShopify
        );
    } catch (error) {
        logger.error('Failed to run bulk audit from download', error);
        return null;
    }
}
