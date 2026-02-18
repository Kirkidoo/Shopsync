import { Product, AuditResult, DuplicateSku, MismatchDetail } from '@/lib/types';
import { getCsvStreamFromFtp } from './ftp';
import { parseCsvFromStream } from './csv';
import { getShopifyProductsBySku, getShopifyProductsByTag } from '@/lib/shopify';
import { logger } from '@/lib/logger';

export function findMismatches(
  csvProduct: Product,
  shopifyProduct: Product,
  csvFileName: string,
  isUseParentClearanceOverride: boolean = false
): MismatchDetail[] {
  const mismatches: MismatchDetail[] = [];

  // Mismatch Logic
  // 1. Price
  if (csvProduct.price !== shopifyProduct.price) {
    mismatches.push({
      field: 'price',
      csvValue: csvProduct.price,
      shopifyValue: shopifyProduct.price,
    });
  }

  // 1.5 Compare At Price
  const isClearanceFile = csvFileName.toLowerCase().includes('clearance');
  if (isClearanceFile) {
    // Standard comparison for clearance files
    if (csvProduct.compareAtPrice !== shopifyProduct.compareAtPrice) {
      mismatches.push({
        field: 'compare_at_price',
        csvValue: csvProduct.compareAtPrice,
        shopifyValue: shopifyProduct.compareAtPrice,
      });
    }
  } else {
    // Non-clearance files: Check for "Sticky Sale" (On sale when it shouldn't be)
    // Rule: Compare at price should be NULL or equal to Price.
    const isEffectiveSale =
      shopifyProduct.compareAtPrice !== null &&
      shopifyProduct.compareAtPrice !== shopifyProduct.price;

    if (isEffectiveSale) {
      mismatches.push({
        field: 'compare_at_price',
        csvValue: 'N/A (Should be null or equal to price)',
        shopifyValue: shopifyProduct.compareAtPrice,
      });
    }
  }

  // 2. Inventory
  if (csvProduct.inventory !== null && csvProduct.inventory !== shopifyProduct.inventory) {
    const isCappedInventory = csvProduct.inventory > 10 && shopifyProduct.inventory === 10;
    if (!isCappedInventory) {
      mismatches.push({
        field: 'inventory',
        csvValue: csvProduct.inventory,
        shopifyValue: shopifyProduct.inventory,
      });
    }
  }

  // Tags preprocessing
  const tags = shopifyProduct.tags
    ? shopifyProduct.tags
      .toLowerCase()
      .split(',')
      .map((t) => t.trim())
    : [];

  // 3. Oversize / Heavy Product Logic
  const csvTags = csvProduct.tags
    ? csvProduct.tags
      .toLowerCase()
      .split(',')
      .map((t) => t.trim())
    : [];

  const isOversize = tags.includes('oversize') || csvTags.includes('oversize');

  // 'oversize' tag (in CSV or Shopify) -> must have 'heavy-products' template
  if (isOversize) {
    if (shopifyProduct.templateSuffix !== 'heavy-products') {
      mismatches.push({
        field: 'incorrect_template_suffix',
        csvValue: 'heavy-products', // Expected
        shopifyValue: shopifyProduct.templateSuffix || 'Default Template',
      });
    }

    // Check if missing 'oversize' tag in Shopify
    if (!tags.includes('oversize')) {
      mismatches.push({
        field: 'missing_oversize_tag',
        csvValue: 'oversize',
        shopifyValue: shopifyProduct.tags || 'No Tags',
      });
    }

    // Optional: Flag if missing from Shopify tags if strictly required?
    // User complaint was about template logic, so we focus on that prioritization first.
  }
  // Reverse check: 'heavy-products' template -> must have 'oversize' tag
  else if (shopifyProduct.templateSuffix === 'heavy-products') {
    // If it's a clearance file, it should probably be 'clearance' template instead of default
    const isClearanceFile = csvFileName.toLowerCase().includes('clearance');
    const expectedTemplate = isClearanceFile ? 'clearance' : 'Default Template';

    mismatches.push({
      field: 'incorrect_template_suffix',
      csvValue: expectedTemplate, // Expected 'clearance' or 'Default Template'
      shopifyValue: 'heavy-products',
    });
  }
  // 4. Clearance Logic
  else if (csvFileName.toLowerCase().includes('clearance')) {
    // Exception: compare_at_price == price -> Not clearance
    if (csvProduct.compareAtPrice !== null && csvProduct.price === csvProduct.compareAtPrice) {
      if (isUseParentClearanceOverride) {
        // This variant has no discount, BUT a sibling variant does.
        // So we ALLOW the parent to have 'clearance' template/tag.
        // Do nothing -> No mismatch.
      } else {
        // If CSV implies NO discount, but Shopify has Clearance indicators -> Mismatch
        let hasClearanceIssues = false;
        if (tags.includes('clearance')) hasClearanceIssues = true;
        if (shopifyProduct.templateSuffix === 'clearance') hasClearanceIssues = true;

        if (hasClearanceIssues) {
          mismatches.push({
            field: 'clearance_price_mismatch',
            csvValue: 'Regular Price (No Clearance)',
            shopifyValue: 'Marked as Clearance',
          });
        }
      }
    } else {
      // Rule: Must have 'Clearance' tag
      if (!tags.includes('clearance')) {
        mismatches.push({
          field: 'missing_clearance_tag',
          csvValue: 'Clearance',
          shopifyValue: shopifyProduct.tags || 'No Tags',
        });
      }

      // Rule: Must have 'clearance' template
      if (shopifyProduct.templateSuffix !== 'clearance') {
        mismatches.push({
          field: 'incorrect_template_suffix',
          csvValue: 'clearance',
          shopifyValue: shopifyProduct.templateSuffix || 'Default Template',
        });
      }
    }
  }

  // Category Tag Check
  if (csvProduct.category) {
    const tags = shopifyProduct.tags
      ? shopifyProduct.tags
        .toLowerCase()
        .split(',')
        .map((t) => t.trim())
      : [];

    const categoryLower = csvProduct.category.toLowerCase().trim();
    if (!tags.includes(categoryLower)) {
      mismatches.push({
        field: 'missing_category_tag',
        csvValue: csvProduct.category,
        shopifyValue: shopifyProduct.tags || 'No Tags',
      });
    }
  }
  return mismatches;
}

/**
 * Detects products/variants that have the "Clearance" tag in Shopify but are NOT in the FTP Clearance file.
 * This includes:
 * 1. Entire products with Clearance tag that are not in the file at all
 * 2. Variants of products that ARE in the file, but specific variants are missing
 * This is used when processing a Clearance file to identify stale clearance items.
 */
export function findStaleClearanceProducts(
  shopifyProducts: Product[],
  csvProducts: Product[],
  csvFileName: string
): { product: Product; mismatch: MismatchDetail }[] {
  // Only run this check when processing a clearance file
  if (!csvFileName.toLowerCase().includes('clearance')) {
    return [];
  }

  const results: { product: Product; mismatch: MismatchDetail }[] = [];

  // Create a set of SKUs from the CSV file for quick lookup
  const csvSkuSet = new Set(csvProducts.map((p) => p.sku.toLowerCase()));

  // Create a set of handles from the CSV file to check for partial products
  const csvHandleSet = new Set(csvProducts.map((p) => p.handle?.toLowerCase()).filter(Boolean));

  for (const shopifyProduct of shopifyProducts) {
    // Check if product has Clearance tag
    const tags = shopifyProduct.tags
      ? shopifyProduct.tags
        .toLowerCase()
        .split(',')
        .map((t) => t.trim())
      : [];

    const hasClearanceTag = tags.includes('clearance');

    // Skip if product doesn't have Clearance tag
    if (!hasClearanceTag) continue;

    // Skip if product has 0 inventory (out of stock items don't need to be flagged)
    if (shopifyProduct.inventory === null || shopifyProduct.inventory === 0) continue;

    // Check if this SKU is in the CSV
    const isSkuInCsv = csvSkuSet.has(shopifyProduct.sku.toLowerCase());

    if (!isSkuInCsv) {
      // Check if the product's handle is in the CSV (meaning some variants are present)
      const isHandleInCsv = shopifyProduct.handle && csvHandleSet.has(shopifyProduct.handle.toLowerCase());

      if (isHandleInCsv) {
        // This is a missing variant - the product is partially in the file but this specific variant is missing
        results.push({
          product: shopifyProduct,
          mismatch: {
            field: 'stale_clearance_tag',
            csvValue: 'Variant missing from Clearance file',
            shopifyValue: 'Has Clearance tag',
          },
        });
      } else {
        // This is an entirely missing product - none of the variants are in the file
        results.push({
          product: shopifyProduct,
          mismatch: {
            field: 'stale_clearance_tag',
            csvValue: 'Not in Clearance file',
            shopifyValue: 'Has Clearance tag',
          },
        });
      }
    }
  }

  return results;
}

export async function runAuditComparison(
  csvProducts: Product[],
  shopifyProducts: Product[],
  csvFileName: string,
  allSkusInShopify?: Set<string>
): Promise<{ report: AuditResult[]; summary: any }> {
  const csvProductMap = new Map(csvProducts.map((p) => [p.sku, p]));
  logger.info(`Created map with ${csvProductMap.size} products from CSV.`);

  const shopifyProductMap = new Map<string, Product[]>();
  for (const p of shopifyProducts) {
    const skuLower = p.sku.toLowerCase();
    if (!shopifyProductMap.has(skuLower)) {
      shopifyProductMap.set(skuLower, []);
    }
    shopifyProductMap.get(skuLower)!.push(p);
  }
  logger.info(`Created map with ${shopifyProductMap.size} unique SKUs from Shopify.`);

  // --- Duplicate Handle Detection ---
  const shopifyHandleMap = new Map<string, Product[]>();
  for (const p of shopifyProducts) {
    if (!shopifyHandleMap.has(p.handle)) {
      shopifyHandleMap.set(p.handle, []);
    }
    shopifyHandleMap.get(p.handle)!.push(p);
  }

  let report: AuditResult[] = [];
  let summary = {
    mismatched: 0,
    not_in_csv: 0,
    missing_in_shopify: 0,
    duplicate_in_shopify: 0,
    duplicate_handle: 0,
  };

  const shopifyHandleSet = new Set(shopifyProducts.map((p) => p.handle));

  logger.info('Running audit comparison logic...');
  let matchedCount = 0;

  const processedShopifySkus = new Set<string>();

  // --- CSV Handle Map for Sibling Lookup ---
  const csvHandleMap = new Map<string, Product[]>();
  for (const p of csvProducts) {
    if (p.handle) {
      if (!csvHandleMap.has(p.handle)) {
        csvHandleMap.set(p.handle, []);
      }
      csvHandleMap.get(p.handle)!.push(p);
    }
  }

  for (const csvProduct of csvProducts) {
    const shopifyVariants = shopifyProductMap.get(csvProduct.sku.toLowerCase());

    // Check for sibling clearance status in CSV
    let isUseParentClearanceOverride = false;
    if (csvProduct.handle) {
      const siblings = csvHandleMap.get(csvProduct.handle) || [];
      // If ANY sibling (including self) has a valid discount (price < compareAt),
      // then the parent is legitimately "Clearance".
      const hasDiscountedVariant = siblings.some(
        (sib) =>
          sib.compareAtPrice !== null &&
          sib.price < sib.compareAtPrice
      );
      if (hasDiscountedVariant) {
        isUseParentClearanceOverride = true;
      }
    }

    if (shopifyVariants) {
      processedShopifySkus.add(csvProduct.sku.toLowerCase());

      if (shopifyVariants.length > 1) {
        summary.duplicate_in_shopify++;

        const duplicateReportItems = shopifyVariants.map((variant) => {
          const mismatches = findMismatches(
            csvProduct,
            variant,
            csvFileName,
            isUseParentClearanceOverride
          );
          return {
            sku: csvProduct.sku,
            csvProducts: [csvProduct],
            shopifyProducts: [variant],
            status: mismatches.length > 0 ? 'mismatched' : 'matched',
            mismatches: mismatches,
          } as AuditResult;
        });

        report.push({
          sku: csvProduct.sku,
          csvProducts: [csvProduct],
          shopifyProducts: shopifyVariants,
          status: 'duplicate_in_shopify',
          mismatches: [
            {
              field: 'duplicate_in_shopify',
              csvValue: null,
              shopifyValue: `Used in ${shopifyVariants.length} products`,
            },
          ],
        });
        report.push(...duplicateReportItems);
      } else {
        const shopifyProduct = shopifyVariants[0];
        const mismatches = findMismatches(
          csvProduct,
          shopifyProduct,
          csvFileName,
          isUseParentClearanceOverride
        );

        if (mismatches.length > 0) {
          report.push({
            sku: csvProduct.sku,
            csvProducts: [csvProduct],
            shopifyProducts: [shopifyProduct],
            status: 'mismatched',
            mismatches,
          });
          summary.mismatched++;
        } else {
          report.push({
            sku: csvProduct.sku,
            csvProducts: [csvProduct],
            shopifyProducts: [shopifyProduct],
            status: 'matched',
            mismatches: [],
          });
          matchedCount++;
        }
      }
    } else {
      // Check if this SKU exists in Shopify at a different location
      // If so, skip it - it's not truly missing, just not at the selected location
      if (allSkusInShopify && allSkusInShopify.has(csvProduct.sku.toLowerCase())) {
        // Product exists at another location - skip it, don't mark as missing
        continue;
      }

      // Check if handle exists in Shopify even if SKU is missing
      const productsWithHandle = shopifyHandleMap.get(csvProduct.handle);

      if (productsWithHandle && productsWithHandle.length > 0) {
        // Handle exists, so it's likely a variant.
        // Check for title mismatch to ensure it's the same product family.
        // Handle exists, so it's likely a variant.
        // User requested to ignore title mismatches ("name/handle mismatch never happen")
        // So we assume it's the same product family and report as Missing Variant.

        const mismatches: MismatchDetail[] = [
          {
            field: 'missing_in_shopify',
            csvValue: `SKU: ${csvProduct.sku}`,
            shopifyValue: null,
            missingType: 'variant',
          },
        ];

        if (csvProduct.weight && csvProduct.weight > 22679.6) {
          mismatches.push({
            field: 'heavy_product_flag',
            csvValue: `${(csvProduct.weight / 453.592).toFixed(2)} lbs`,
            shopifyValue: null,
          });
        }

        report.push({
          sku: csvProduct.sku,
          csvProducts: [csvProduct],
          shopifyProducts: productsWithHandle,
          status: 'missing_in_shopify',
          mismatches: mismatches,
        });
        summary.missing_in_shopify++;
      } else {
        // Handle does not exist -> Missing Product
        const mismatches: MismatchDetail[] = [
          {
            field: 'missing_in_shopify',
            csvValue: `SKU: ${csvProduct.sku}`,
            shopifyValue: null,
            missingType: 'product',
          },
        ];

        if (csvProduct.weight && csvProduct.weight > 22679.6) {
          mismatches.push({
            field: 'heavy_product_flag',
            csvValue: `${(csvProduct.weight / 453.592).toFixed(2)} lbs`,
            shopifyValue: null,
          });
        }

        if (csvFileName.toLowerCase().includes('clearance')) {
          // If it's a new product from clearance, it doesn't need a mismatch, it just gets created with the tag.
        }

        report.push({
          sku: csvProduct.sku,
          csvProducts: [csvProduct],
          shopifyProducts: [],
          status: 'missing_in_shopify',
          mismatches: mismatches,
        });
        summary.missing_in_shopify++;
      }
    }
  }

  for (const [sku, variants] of shopifyProductMap.entries()) {
    // Note: sku here is already lowercase from the map key
    // We need to check if we processed this SKU (using the original CSV SKU casing if possible, but here we only have the map key)
    // The processedShopifySkus set should also store lowercase SKUs to match.
    if (!processedShopifySkus.has(sku)) {
      for (const variant of variants) {
        report.push({
          sku: sku,
          csvProducts: [],
          shopifyProducts: [variant],
          status: 'not_in_csv',
          mismatches: [],
        });
        summary.not_in_csv++;
      }
    }
  }

  // --- Stale Clearance Detection ---
  // Flag products in Shopify with "Clearance" tag that are NOT in the FTP Clearance file
  const staleClearanceItems = findStaleClearanceProducts(shopifyProducts, csvProducts, csvFileName);
  for (const { product, mismatch } of staleClearanceItems) {
    // Check if this SKU already has a report entry
    const existingEntry = report.find(
      (r) => r.sku.toLowerCase() === product.sku.toLowerCase() && r.shopifyProducts.length > 0
    );

    if (existingEntry) {
      // Add mismatch to existing entry
      existingEntry.mismatches.push(mismatch);
      const previousStatus = existingEntry.status;
      if (previousStatus === 'matched' || previousStatus === 'not_in_csv') {
        existingEntry.status = 'mismatched';
        summary.mismatched++;
        if (previousStatus === 'not_in_csv') {
          summary.not_in_csv--;
        }
      }
    } else {
      // Create new report entry for this product
      report.push({
        sku: product.sku,
        csvProducts: [],
        shopifyProducts: [product],
        status: 'mismatched',
        mismatches: [mismatch],
      });
      summary.mismatched++;
    }
  }

  if (staleClearanceItems.length > 0) {
    logger.info(`Found ${staleClearanceItems.length} products with stale Clearance tag (not in FTP Clearance file)`);
  }

  const getHandle = (item: AuditResult) =>
    item.shopifyProducts[0]?.handle || item.csvProducts[0]?.handle || '';

  report.sort((a, b) => {
    const handleA = getHandle(a);
    const handleB = getHandle(b);
    if (handleA !== handleB) {
      return handleA.localeCompare(handleB);
    }
    return a.sku.localeCompare(b.sku);
  });

  logger.info(`Audit comparison complete. Matched: ${matchedCount} Summary:`, summary);

  return { report, summary: { ...summary, matched: matchedCount } };
}

export async function runAudit(
  csvFileName: string,
  ftpData: FormData,
  locationId?: number
): Promise<{ report: AuditResult[]; summary: any; duplicates: DuplicateSku[] } | null> {
  let csvProducts: Product[] = [];

  try {
    const readableStream = await getCsvStreamFromFtp(csvFileName, ftpData);
    const parsedData = await parseCsvFromStream(readableStream);
    csvProducts = parsedData.products;
  } catch (error) {
    logger.error('Failed to download or parse CSV from FTP', error);
    throw new Error(`Could not download or process file '${csvFileName}' from FTP.`);
  }

  if (csvProducts.length === 0) {
    logger.info('No products found in the CSV file. Aborting audit.');
    return {
      report: [],
      summary: {
        matched: 0,
        mismatched: 0,
        not_in_csv: 0,
        missing_in_shopify: 0,
        duplicate_in_shopify: 0,
        duplicate_handle: 0,
      },
      duplicates: [],
    };
  }

  // Fetch Shopify products based on SKUs from the CSV
  const skusFromCsv = csvProducts.map((p) => p.sku);
  const allShopifyProducts = await getShopifyProductsBySku(skusFromCsv, locationId);

  if (!allShopifyProducts) {
    logger.error('Audit cannot run because Shopify product data could not be fetched.');
    return null;
  }

  // For clearance files, also fetch products with Clearance tag to detect stale ones
  let combinedShopifyProducts = allShopifyProducts;
  if (csvFileName.toLowerCase().includes('clearance')) {
    logger.info('Clearance file detected - fetching products with Clearance tag for stale detection...');
    try {
      const clearanceTaggedProducts = await getShopifyProductsByTag('Clearance', locationId);

      // Merge the two lists, avoiding duplicates by SKU
      const existingSkus = new Set(allShopifyProducts.map((p) => p.sku.toLowerCase()));
      const newProducts = clearanceTaggedProducts.filter(
        (p) => !existingSkus.has(p.sku.toLowerCase())
      );

      if (newProducts.length > 0) {
        logger.info(`Found ${newProducts.length} additional products with Clearance tag not in CSV`);
        combinedShopifyProducts = [...allShopifyProducts, ...newProducts];
      }
    } catch (error) {
      logger.error('Failed to fetch Clearance-tagged products for stale detection:', error);
      // Continue with regular audit even if this fails
    }
  }

  const { report, summary } = await runAuditComparison(
    csvProducts,
    combinedShopifyProducts,
    csvFileName
  );

  const duplicatesForCard: DuplicateSku[] = report
    .filter((d) => d.status === 'duplicate_in_shopify')
    .map((d) => ({ sku: d.sku, count: d.shopifyProducts.length }));

  return { report: report, summary, duplicates: duplicatesForCard };
}

export async function runBulkAuditComparison(
  csvProducts: Product[],
  shopifyProducts: Product[],
  csvFileName: string,
  allSkusInShopify?: Set<string>
): Promise<{ report: AuditResult[]; summary: any; duplicates: DuplicateSku[] }> {
  const { report, summary } = await runAuditComparison(csvProducts, shopifyProducts, csvFileName, allSkusInShopify);
  const duplicatesForCard: DuplicateSku[] = report
    .filter((d) => d.status === 'duplicate_in_shopify')
    .map((d) => ({ sku: d.sku, count: d.shopifyProducts.length }));
  return { report, summary, duplicates: duplicatesForCard };
}
