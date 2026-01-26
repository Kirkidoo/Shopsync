import { useState, useMemo, useEffect } from 'react';
import { AuditResult, MismatchDetail, Product, DuplicateSku, Summary } from '@/lib/types';
import { getFixedMismatches, getCreatedProductHandles, clearAuditMemory, markMismatchAsFixed } from '@/lib/utils';
import { getHandle, hasAllExpectedTags } from '@/components/audit/audit-utils';

export type FilterType =
    | 'all'
    | 'mismatched'
    | 'missing_in_shopify'
    | 'not_in_csv'
    | 'duplicate_in_shopify'
    | 'tag_updates';

interface UseAuditDataProps {
    initialData: AuditResult[];
    initialSummary: Summary;
}

export function useAuditData({ initialData, initialSummary }: UseAuditDataProps) {
    // State
    const [reportData, setReportData] = useState<AuditResult[]>(initialData);
    const [reportSummary, setReportSummary] = useState<Summary>(initialSummary);

    const [filter, setFilter] = useState<FilterType>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [handlesPerPage, setHandlesPerPage] = useState(10);

    // Advanced filters
    const [mismatchFilters, setMismatchFilters] = useState<Set<MismatchDetail['field']>>(new Set());
    const [filterSingleSku, setFilterSingleSku] = useState(false);
    const [selectedVendor, setSelectedVendor] = useState<string>('all');
    const [filterCustomTag, setFilterCustomTag] = useState('');

    // Memory / Persistence
    const [fixedMismatches, setFixedMismatches] = useState<Set<string>>(new Set());
    const [createdProductHandles, setCreatedProductHandles] = useState<Set<string>>(new Set());
    const [updatedProductHandles, setUpdatedProductHandles] = useState<Set<string>>(new Set());


    // Initialize
    useEffect(() => {
        setReportData(initialData);
        setReportSummary(initialSummary);
        setFixedMismatches(getFixedMismatches());
        setCreatedProductHandles(getCreatedProductHandles());
    }, [initialData, initialSummary]);

    // Derived Values
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

    // Derived Values
    const uniqueVendors = useMemo(() => {
        const vendors = new Set<string>();
        initialData.forEach((item) => {
            if (item.status === 'not_in_csv' && item.shopifyProducts[0]?.vendor) {
                vendors.add(item.shopifyProducts[0].vendor);
            }
        });
        return ['all', ...Array.from(vendors).sort()];
    }, [initialData]);

    const availableCsvColumns = useMemo(() => {
        const columns = new Set<string>();
        initialData.forEach(item => {
            if (item.csvProducts[0]?.rawCsvData) {
                Object.keys(item.csvProducts[0].rawCsvData).forEach(k => columns.add(k));
            }
        });
        return Array.from(columns).sort();
    }, [initialData]);

    // Main Filtering Logic
    const filteredData = useMemo(() => {
        let results: AuditResult[] = reportData
            .map((item) => {
                // Hide fixed mismatches
                if (item.status === 'mismatched' && item.mismatches && item.mismatches.length > 0) {
                    const remainingMismatches = item.mismatches.filter(
                        (m) => !fixedMismatches.has(`${item.sku}-${m.field}`)
                    );
                    return { ...item, mismatches: remainingMismatches };
                }
                // Hide missing items if created
                if (item.status === 'missing_in_shopify') {
                    if (createdProductHandles.has(getHandle(item))) {
                        return { ...item, mismatches: [] }; // Effectively hide
                    }
                    // Filter individual mismatches if any marked fixed (unlikely for 'missing' but good practice)
                    const remainingMismatches = item.mismatches.filter(
                        (m) => !fixedMismatches.has(`${item.sku}-${m.field}`)
                    );
                    return { ...item, mismatches: remainingMismatches };
                }
                return item;
            })
            .filter((item) => {
                // Post-processing filter: remove items that are now "clean" or hidden
                if (item.status === 'mismatched' && item.mismatches.length === 0) return false;

                if (item.status === 'missing_in_shopify') {
                    if (createdProductHandles.has(getHandle(item))) return false;
                    // If the only mismatch was 'missing_in_shopify' and it's handled, hide it.
                    // (Logic copied from original: if mismatches.length is 1 and it's missing_in_shopify, check created handles again)
                    if (item.mismatches.length === 1 && item.mismatches[0].field === 'missing_in_shopify') {
                        return !createdProductHandles.has(getHandle(item));
                    }
                    if (item.mismatches.length === 0) return false;
                }
                return true;
            });

        // 1. Filter by Main Tab
        if (filter !== 'all') {
            if (filter === 'tag_updates') {
                results = results.filter((item) => {
                    if (item.shopifyProducts.length === 0 || item.csvProducts.length === 0) return false;
                    if (updatedProductHandles.has(getHandle(item))) return false;

                    if (filterCustomTag) {
                        const shopifyTags = item.shopifyProducts[0].tags;
                        const csvTags = item.csvProducts[0].tags;
                        const category = item.csvProducts[0].category;
                        if (hasAllExpectedTags(shopifyTags, csvTags, category, filterCustomTag)) {
                            return false;
                        }
                    }
                    return true;
                });
            } else {
                results = results.filter((item) => item.status === filter);
            }
        }

        // 2. Filter by Search Term
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            results = results.filter((item) => {
                const product = item.csvProducts[0] || item.shopifyProducts[0];
                return (
                    item.sku.toLowerCase().includes(term) ||
                    (product && product.handle.toLowerCase().includes(term)) ||
                    (product && product.name.toLowerCase().includes(term))
                );
            });
        }

        // 3. Specific Filters
        if (filter === 'mismatched' && mismatchFilters.size > 0) {
            results = results.filter((item) =>
                item.mismatches.some((m) => mismatchFilters.has(m.field))
            );
        }
        if (filter === 'not_in_csv' && selectedVendor !== 'all') {
            results = results.filter((item) => item.shopifyProducts[0]?.vendor === selectedVendor);
        }

        // 4. Single SKU Filter
        if (filterSingleSku) {
            // Re-implementing simplified grouping just for this check:
            const counts: Record<string, number> = {};
            results.forEach(i => {
                const h = getHandle(i);
                counts[h] = (counts[h] || 0) + 1;
            });
            results = results.filter(i => counts[getHandle(i)] === 1);
        }

        // 5. Column Filters
        if (Object.keys(columnFilters).length > 0) {
            results = results.filter(item => {
                const csvData = item.csvProducts[0]?.rawCsvData;
                if (!csvData) return false; // If no CSV data, can't match filter? Or should we match if filter is empty?
                // Assuming "must match" if filter exists
                return Object.entries(columnFilters).every(([key, value]) => {
                    const cellValue = csvData[key];
                    if (!cellValue) return false;
                    return cellValue.toLowerCase().includes(value.toLowerCase());
                });
            });
        }

        return results;
    }, [reportData, fixedMismatches, createdProductHandles, filter, updatedProductHandles, filterCustomTag, searchTerm, mismatchFilters, selectedVendor, filterSingleSku, columnFilters]);

    // Grouping
    const allGroupedByHandle = useMemo(() => {
        const map = new Map<string, AuditResult[]>();
        reportData.forEach((item) => {
            const handle = getHandle(item);
            if (!map.has(handle)) map.set(handle, []);
            map.get(handle)!.push(item);
        });
        return map;
    }, [reportData]);

    const groupedByHandle = useMemo(() => {
        return filteredData.reduce((acc, item) => {
            const handle = getHandle(item);
            if (!acc[handle]) acc[handle] = [];
            acc[handle].push(item);
            return acc;
        }, {} as Record<string, AuditResult[]>);
    }, [filteredData]);

    const groupedBySku = useMemo(() => {
        if (filter !== 'duplicate_in_shopify') return {};
        return filteredData.reduce((acc, item) => {
            if (item.status === 'duplicate_in_shopify') {
                // For duplicates, the audit result contains the list of conflicting shopify products
                acc[item.sku] = item.shopifyProducts;
            }
            return acc;
        }, {} as Record<string, Product[]>);
    }, [filteredData, filter]);


    // Pagination
    const handleKeys = filter === 'duplicate_in_shopify'
        ? Object.keys(groupedBySku)
        : Object.keys(groupedByHandle);

    const totalPages = Math.ceil(handleKeys.length / handlesPerPage);
    const paginatedHandleKeys = handleKeys.slice(
        (currentPage - 1) * handlesPerPage,
        currentPage * handlesPerPage
    );

    // Stats
    const currentSummary = useMemo(() => {
        return filteredData.reduce((acc, item) => {
            if (item.status === 'mismatched' && item.mismatches.length > 0) acc.mismatched++;
            if (item.status === 'missing_in_shopify') acc.missing_in_shopify++;
            if (item.status === 'not_in_csv') acc.not_in_csv++;
            if (item.status === 'duplicate_in_shopify') acc.duplicate_in_shopify++;
            if (item.status === 'matched') acc.matched++;
            return acc;
        }, { matched: 0, mismatched: 0, missing_in_shopify: 0, not_in_csv: 0, duplicate_in_shopify: 0 });
    }, [filteredData]);


    return {
        // State
        reportData, setReportData,
        reportSummary, setReportSummary,
        filter, setFilter,
        searchTerm, setSearchTerm,
        currentPage, setCurrentPage,
        handlesPerPage, setHandlesPerPage,
        mismatchFilters, setMismatchFilters,
        filterSingleSku, setFilterSingleSku,
        selectedVendor, setSelectedVendor,
        filterCustomTag, setFilterCustomTag,
        fixedMismatches, setFixedMismatches,
        createdProductHandles, setCreatedProductHandles,
        updatedProductHandles, setUpdatedProductHandles,

        columnFilters, setColumnFilters,
        availableCsvColumns,

        // Derived
        filteredData,
        uniqueVendors,
        allGroupedByHandle,
        groupedByHandle,
        groupedBySku,
        handleKeys,
        paginatedHandleKeys,
        totalPages,
        currentSummary
    };
}
