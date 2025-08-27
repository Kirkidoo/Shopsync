'use server';

import { Product, AuditResult } from '@/lib/types';

const mockCsvData: { [key: string]: Product[] } = {
  'products_2024_01.csv': [
    { sku: 'TS-001', name: 'Blue T-Shirt', price: 19.99 },
    { sku: 'TS-002', name: 'Red T-Shirt', price: 19.99 },
    { sku: 'HD-001', name: 'Black Hoodie', price: 49.99 },
    { sku: 'CP-001', name: 'Gray Cap', price: 24.99 }, // Mismatch price
    { sku: 'SK-001', name: 'Striped Socks', price: 9.99 }, // Only in CSV
  ],
  'inventory_update_Q2.csv': [
    { sku: 'TS-001', name: 'Blue T-Shirt', price: 21.99 },
    { sku: 'TS-002', name: 'Red T-Shirt', price: 21.99 },
    { sku: 'HD-001', name: 'Black Hoodie', price: 54.99 },
    { sku: 'CP-001', name: 'Gray Baseball Cap', price: 24.99 },
    { sku: 'SH-001', name: 'Leather Shoes', price: 129.99 },
  ]
};

const mockShopifyData: Product[] = [
  { sku: 'TS-001', name: 'Blue T-Shirt', price: 19.99 },
  { sku: 'TS-002', name: 'Red T-Shirt', price: 19.99 },
  { sku: 'HD-001', name: 'Black Hoodie', price: 49.99 },
  { sku: 'CP-001', name: 'Gray Cap', price: 29.99 }, // Mismatch price
  { sku: 'JN-001', name: 'Denim Jeans', price: 79.99 }, // New in Shopify
  { sku: 'SH-001', name: 'Leather Shoes', price: 129.99 },
];

export async function connectToFtp(data: FormData) {
  const username = data.get('username');
  if (username === 'bad') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    throw new Error('Invalid FTP credentials.');
  }
  await new Promise(resolve => setTimeout(resolve, 1500));
  return { success: true };
}

export async function listCsvFiles() {
  await new Promise(resolve => setTimeout(resolve, 500));
  return Object.keys(mockCsvData);
}

export async function runAudit(csvFileName: string): Promise<{ report: AuditResult[], summary: { matched: number, mismatched: number, newInShopify: number, onlyInCsv: number } }> {
  await new Promise(resolve => setTimeout(resolve, 1000));
  const csvProducts = mockCsvData[csvFileName] || [];
  const csvProductMap = new Map(csvProducts.map(p => [p.sku, p]));

  await new Promise(resolve => setTimeout(resolve, 2000));
  const shopifyProductMap = new Map(mockShopifyData.map(p => [p.sku, p]));

  const allSkus = new Set([...csvProductMap.keys(), ...shopifyProductMap.keys()]);
  const report: AuditResult[] = [];
  const summary = { matched: 0, mismatched: 0, newInShopify: 0, onlyInCsv: 0 };

  for (const sku of allSkus) {
    const csvProduct = csvProductMap.get(sku) || null;
    const shopifyProduct = shopifyProductMap.get(sku) || null;

    if (csvProduct && shopifyProduct) {
      if (csvProduct.price === shopifyProduct.price && csvProduct.name === shopifyProduct.name) {
        report.push({ sku, csvProduct, shopifyProduct, status: 'matched' });
        summary.matched++;
      } else {
        report.push({ sku, csvProduct, shopifyProduct, status: 'mismatched' });
        summary.mismatched++;
      }
    } else if (shopifyProduct) {
      report.push({ sku, csvProduct: null, shopifyProduct, status: 'new_in_shopify' });
      summary.newInShopify++;
    } else if (csvProduct) {
      report.push({ sku, csvProduct, shopifyProduct: null, status: 'only_in_csv' });
      summary.onlyInCsv++;
    }
  }

  await new Promise(resolve => setTimeout(resolve, 500));
  
  report.sort((a, b) => a.sku.localeCompare(b.sku));

  return { report, summary };
}
