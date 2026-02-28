import { logger } from '@/lib/logger';

export interface GammaInventoryLevel {
    quantity: number;
    stockStatus: string;
}

export async function getLiveInventory(sku: string): Promise<GammaInventoryLevel | null> {
    const url = process.env.GAMMA_API_URL;
    const token = process.env.GAMMA_API_TOKEN;

    if (!url || !token) {
        logger.error('Missing Gamma API URL or Token in environment variables');
        return null;
    }

    try {
        const res = await fetch(`${url}/inventory?partNumber=${encodeURIComponent(sku)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            next: { revalidate: 0 } // Ensure live data
        });

        if (!res.ok) {
            if (res.status === 400) {
                // The API returns 400 when an item is not found
                return { quantity: 0, stockStatus: "Item not Found" };
            }
            logger.error(`Failed to fetch Gamma inventory for ${sku}: ${res.statusText}`);
            return null;
        }

        const json = await res.json();
        if (json.status === 'success' && json.data?.inventoryLevel) {
            return json.data.inventoryLevel as GammaInventoryLevel;
        }

        return null;
    } catch (error) {
        logger.error(`Error fetching Gamma inventory for ${sku}`, error);
        return null;
    }
}
