'use server';

// Barrel re-export – all consumers continue importing from '@/app/actions'

export {
  connectToFtp,
  listCsvFiles,
  getFtpCredentials,
  getAvailableLocations,
} from './actions/ftp-actions';

export {
  runAudit,
  checkBulkCacheStatus,
  getCsvProducts,
  getShopifyProductsFromCache,
  getShopifyProductsFromCacheWithAllSkus,
  startBulkOperation,
  checkBulkOperationStatus,
  getBulkOperationResultAndParse,
  getBulkOperationResultAndParseWithAllSkus,
  runBulkAuditComparison,
  runBulkAuditFromCache,
  runBulkAuditFromDownload,
} from './actions/audit-actions';

export {
  fixMultipleMismatches,
  bulkUpdateTags,
} from './actions/fix-actions';

export {
  createInShopify,
  createMultipleInShopify,
  createMultipleVariantsForProduct,
  deleteFromShopify,
  deleteVariantFromShopify,
} from './actions/product-actions';

export {
  getProductWithImages,
  getProductByHandleServer,
  getProductImageCounts,
  addImageFromUrl,
  assignImageToVariant,
  deleteImage,
  deleteUnlinkedImages,
  deleteUnlinkedImagesForMultipleProducts,
} from './actions/media-actions';

export {
  fetchActivityLogs,
  clearActivityLogs,
} from './actions/log-actions';
