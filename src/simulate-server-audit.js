
const { getProductsFromDb, getLastSyncDate } = require('./src/lib/db');
const { findMismatches } = require('./src/services/audit');

async function test() {
    const sku = '33-48500';
    console.log(`Simulating audit for SKU: ${sku}...`);

    const lastSyncDate = getLastSyncDate();
    console.log('Last Sync Date in DB:', lastSyncDate);

    const allProducts = getProductsFromDb();
    const shopifyProduct = allProducts.find(p => p.sku === sku);

    if (!shopifyProduct) {
        console.log('SKU not found in DB products list.');
        return;
    }

    console.log('Shopify Product in DB:');
    console.log(`Price: ${shopifyProduct.price}`);
    console.log(`CompareAt: ${shopifyProduct.compareAtPrice}`);

    // Mock CSV product (Price matched to what it should be)
    const csvProduct = {
        ...shopifyProduct,
        price: 369.95,
        compareAtPrice: null // Simulate missing column
    };

    console.log('\nRunning findMismatches (Regular file)...');
    const mismatches = findMismatches(csvProduct, shopifyProduct, 'regular.csv');
    console.log('Mismatches found:', JSON.stringify(mismatches, null, 2));
}

test();
