import { AuditResult } from '@/lib/types';

export const getHandle = (item: AuditResult) =>
    item.shopifyProducts[0]?.handle || item.csvProducts[0]?.handle || `no-handle-${item.sku}`;

export const hasAllExpectedTags = (
    shopifyTags: string | undefined | null,
    csvTags: string | undefined | null,
    category: string | undefined | null,
    customTag: string
): boolean => {
    if (!shopifyTags) return false;

    const currentTags = new Set(
        shopifyTags.split(',').map((t) => t.trim().toLowerCase())
    );

    // 1. Check CSV Tags (first 3)
    if (csvTags) {
        const expectedCsvTags = csvTags
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 3);

        for (const tag of expectedCsvTags) {
            if (!currentTags.has(tag)) return false;
        }
    }

    // 2. Check Category
    if (category) {
        if (!currentTags.has(category.trim().toLowerCase())) return false;
    }

    // 3. Check Custom Tag
    if (customTag) {
        if (!currentTags.has(customTag.trim().toLowerCase())) return false;
    }

    return true;
};
