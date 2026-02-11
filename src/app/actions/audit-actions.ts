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
} from '@/lib/shopify';
import fsPromises from 'fs/promises';
import path from 'path';
import * as csvService from '@/services/csv';
import * as auditService from '@/services/audit';
import { logger } from '@/lib/logger';
import { parseJsonlGenerator, parseJsonlWithAllSkus } from '@/services/jsonl-parser';

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
    return await auditService.runAudit(csvFileName, ftpData, locationId);
}

export async function checkBulkCacheStatus(): Promise<{ lastModified: string | null }> {
    try {
        await fsPromises.access(CACHE_INFO_PATH);
        const info = JSON.parse(await fsPromises.readFile(CACHE_INFO_PATH, 'utf-8'));
        return { lastModified: info.lastModified };
    } catch (error) {
        return { lastModified: null };
    }
}

export async function getCsvProducts(
    csvFileName: string,
    ftpData: FormData
): Promise<Product[] | null> {
    return await csvService.getCsvProducts(csvFileName, ftpData);
}

export async function getShopifyProductsFromCache(locationId?: number): Promise<Product[] | null> {
    try {
        await fsPromises.access(CACHE_FILE_PATH);
        const products: Product[] = [];
        for await (const product of parseJsonlGenerator(CACHE_FILE_PATH, locationId)) {
            products.push(product);
        }
        return products;
    } catch (error) {
        logger.error('Failed to read or parse cache file.', error);
        return null;
    }
}

export async function getShopifyProductsFromCacheWithAllSkus(locationId?: number): Promise<{
    products: Product[];
    allSkusInShopify: Set<string>;
} | null> {
    try {
        await fsPromises.access(CACHE_FILE_PATH);
        return await parseJsonlWithAllSkus(CACHE_FILE_PATH, locationId);
    } catch (error) {
        logger.error('Failed to read or parse cache file.', error);
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
        await fsPromises.writeFile(
            CACHE_INFO_PATH,
            JSON.stringify({ lastModified: new Date().toISOString() })
        );
        const products: Product[] = [];
        for await (const product of parseJsonlGenerator(CACHE_FILE_PATH, locationId)) {
            products.push(product);
        }
        return products;
    } catch (error) {
        logger.error('Failed to download or parse bulk result', error);
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
        await fsPromises.writeFile(
            CACHE_INFO_PATH,
            JSON.stringify({ lastModified: new Date().toISOString() })
        );
        return await parseJsonlWithAllSkus(CACHE_FILE_PATH, locationId);
    } catch (error) {
        logger.error('Failed to download or parse bulk result', error);
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
        await fsPromises.access(CACHE_FILE_PATH);
        const { products: shopifyProducts, allSkusInShopify } = await parseJsonlWithAllSkus(
            CACHE_FILE_PATH,
            locationId
        );
        logger.info(
            `Parsed ${shopifyProducts.length} products at location, ${allSkusInShopify.size} total SKUs in Shopify`
        );
        return await auditService.runBulkAuditComparison(
            csvProducts,
            shopifyProducts,
            csvFileName,
            allSkusInShopify
        );
    } catch (error) {
        logger.error('Failed to run bulk audit from cache', error);
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
        await fsPromises.writeFile(
            CACHE_INFO_PATH,
            JSON.stringify({ lastModified: new Date().toISOString() })
        );
        const { products: shopifyProducts, allSkusInShopify } = await parseJsonlWithAllSkus(
            CACHE_FILE_PATH,
            locationId
        );
        logger.info(
            `Parsed ${shopifyProducts.length} products at location, ${allSkusInShopify.size} total SKUs in Shopify`
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
