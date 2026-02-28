import { NextResponse } from 'next/server';
import { getLiveInventory } from '@/services/gamma';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku');

    if (!sku) {
        return NextResponse.json({ error: 'SKU is required' }, { status: 400 });
    }

    const inventory = await getLiveInventory(sku);

    if (!inventory) {
        return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 });
    }

    return NextResponse.json(inventory);
}
