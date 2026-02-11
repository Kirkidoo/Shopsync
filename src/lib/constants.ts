// --- Shopify & Warehouse Constants ---

/** Gamma Warehouse location ID (Shopify) */
export const GAMMA_WAREHOUSE_LOCATION_ID = process.env.GAMMA_WAREHOUSE_LOCATION_ID
    ? parseInt(process.env.GAMMA_WAREHOUSE_LOCATION_ID, 10)
    : 93998154045;

/** Name of the secondary location to disconnect new products from */
export const GARAGE_LOCATION_NAME = 'Garage Harry Stanley';

// --- Audit Thresholds ---

/** 50 lbs expressed in grams (used for oversize/heavy product detection) */
export const HEAVY_PRODUCT_THRESHOLD_GRAMS = 22679.6;

/** Conversion factor: 1 pound = 453.592 grams */
export const GRAMS_PER_POUND = 453.592;

/** Inventory quantities at or below this cap are reported as matched */
export const INVENTORY_CAP = 10;
