import { useMemo, useEffect, useDeferredValue, useCallback } from 'react';
import { AuditResult, MismatchDetail, Product, Summary } from '@/lib/types';
import { getFixedMismatches, getCreatedProductHandles } from '@/lib/utils';
import { getHandle, hasAllExpectedTags } from '@/components/audit/audit-utils';
import { useAuditDataStore, useAuditUIStore } from '@/store/audit-store';

export type FilterType =
    | 'all'
    | 'mismatched'
    | 'missing_in_shopify'
    | 'not_in_csv'
    | 'duplicate_in_shopify'
    | 'tag_updates';

interface UseAuditDataProps {
    initialData?: AuditResult[];
    initialSummary?: Summary | null;
}

export function useAuditData(props?: UseAuditDataProps) {
    const { initialData, initialSummary } = props || {};
    // Store Selectors - Data
    const reportData = useAuditDataStore((state) => state.reportData);
    const setReportData = useAuditDataStore((state) => state.setReportData);
    const setReportSummary = useAuditDataStore((state) => state.setReportSummary);
    const fixedMismatches = useAuditDataStore((state) => state.fixedMismatches);
    const setFixedMismatches = useAuditDataStore((state) => state.setFixedMismatches);
    const createdProductHandles = useAuditDataStore((state) => state.createdProductHandles);
    const setCreatedProductHandles = useAuditDataStore((state) => state.setCreatedProductHandles);
    const updatedProductHandles = useAuditDataStore((state) => state.updatedProductHandles);
    const imageCounts = useAuditDataStore((state) => state.imageCounts);

    // Store Selectors - UI
    const filter = useAuditUIStore((state) => state.filter) as FilterType;
    const setFilter = useAuditUIStore((state) => state.setFilter);
    const searchTerm = useAuditUIStore((state) => state.searchTerm);
    const setSearchTerm = useAuditUIStore((state) => state.setSearchTerm);
    const currentPage = useAuditUIStore((state) => state.currentPage);
    const setCurrentPage = useAuditUIStore((state) => state.setCurrentPage);
    const handlesPerPage = useAuditUIStore((state) => state.handlesPerPage);
    const setHandlesPerPage = useAuditUIStore((state) => state.setHandlesPerPage);
    const mismatchFilters = useAuditUIStore((state) => state.mismatchFilters) as Set<MismatchDetail['field']>;
    const setMismatchFilters = useAuditUIStore((state) => state.setMismatchFilters);
    const filterSingleSku = useAuditUIStore((state) => state.filterSingleSku);
    const setFilterSingleSku = useAuditUIStore((state) => state.setFilterSingleSku);
    const selectedVendor = useAuditUIStore((state) => state.selectedVendor);
    const setSelectedVendor = useAuditUIStore((state) => state.setSelectedVendor);
    const filterCustomTag = useAuditUIStore((state) => state.filterCustomTag);
    const setFilterCustomTag = useAuditUIStore((state) => state.setFilterCustomTag);
    const hideMissingVariants = useAuditUIStore((state) => state.hideMissingVariants);
    const setHideMissingVariants = useAuditUIStore((state) => state.setHideMissingVariants);
    const selectedHandles = useAuditUIStore((state) => state.selectedHandles);
    const setSelectedHandles = useAuditUIStore((state) => state.setSelectedHandles);
    const toggleHandleSelection = useAuditUIStore((state) => state.toggleHandleSelection);
    const columnFilters = useAuditUIStore((state) => state.columnFilters);
    const setColumnFilters = useAuditUIStore((state) => state.setColumnFilters);

    const deferredSearchTerm = useDeferredValue(searchTerm);

    // Initialize
    useEffect(() => {
        if (initialData) setReportData(initialData);
        if (initialSummary) setReportSummary(initialSummary);
        setFixedMismatches(getFixedMismatches());
        setCreatedProductHandles(getCreatedProductHandles());
    }, [initialData, initialSummary, setReportData, setReportSummary, setFixedMismatches, setCreatedProductHandles]);

    // Derived Values
    const uniqueVendors = useMemo(() => {
        const vendors = new Set<string>();
        const dataToScan = initialData || reportData;
        dataToScan.forEach((item) => {
            if (item.status === 'not_in_csv' && item.shopifyProducts[0]?.vendor) {
                vendors.add(item.shopifyProducts[0].vendor);
            }
        });
        return ['all', ...Array.from(vendors).sort()];
    }, [initialData, reportData]);

    const availableCsvColumns = useMemo(() => {
        const columns = new Set<string>();
        const dataToScan = initialData || reportData;
        dataToScan.forEach(item => {
            if (item.csvProducts[0]?.rawCsvData) {
                Object.keys(item.csvProducts[0].rawCsvData).forEach(k => columns.add(k));
            }
        });
        return Array.from(columns).sort();
    }, [initialData, reportData]);

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
                    // Filter individual mismatches if any marked fixed
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

        // 2. Filter by Search Term (deferred for performance)
        if (deferredSearchTerm) {
            const term = deferredSearchTerm.toLowerCase();
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

        // 3b. Hide Missing Variants toggle
        if (hideMissingVariants && (filter === 'missing_in_shopify' || filter === 'all')) {
            results = results.filter((item) => {
                if (item.status !== 'missing_in_shopify') return true;
                // Keep only items where at least one mismatch is missingType 'product'
                return item.mismatches.some((m) => m.missingType === 'product');
            });
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
    }, [reportData, fixedMismatches, createdProductHandles, filter, updatedProductHandles, filterCustomTag, deferredSearchTerm, mismatchFilters, selectedVendor, filterSingleSku, columnFilters, hideMissingVariants]);

    // Grouping
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
    const handleKeys = useMemo(() => {
        return filter === 'duplicate_in_shopify'
            ? Object.keys(groupedBySku)
            : Object.keys(groupedByHandle);
    }, [filter, groupedBySku, groupedByHandle]);

    const totalPages = Math.ceil(handleKeys.length / handlesPerPage);
    const paginatedHandleKeys = useMemo(() => {
        return handleKeys.slice(
            (currentPage - 1) * handlesPerPage,
            currentPage * handlesPerPage
        );
    }, [handleKeys, currentPage, handlesPerPage]);

    // Selection Logic
    const handleSelectHandle = useCallback((handle: string, checked: boolean) => {
        toggleHandleSelection(handle);
    }, [toggleHandleSelection]);

    const isAllOnPageSelected = useMemo(() => {
        return paginatedHandleKeys.length > 0 &&
            paginatedHandleKeys.every((handle) => selectedHandles.has(handle));
    }, [paginatedHandleKeys, selectedHandles]);

    const isSomeOnPageSelected = useMemo(() => {
        return paginatedHandleKeys.some((handle) => selectedHandles.has(handle)) &&
            !isAllOnPageSelected;
    }, [paginatedHandleKeys, selectedHandles, isAllOnPageSelected]);

    const toggleSelectAllPage = useCallback(() => {
        if (isAllOnPageSelected) {
            setSelectedHandles((prev) => {
                const next = new Set(prev);
                paginatedHandleKeys.forEach((handle) => next.delete(handle));
                return next;
            });
        } else {
            setSelectedHandles((prev) => {
                const next = new Set(prev);
                paginatedHandleKeys.forEach((handle) => next.add(handle));
                return next;
            });
        }
    }, [isAllOnPageSelected, paginatedHandleKeys, setSelectedHandles]);

    const hasSelectionWithMismatches = useMemo(() => {
        if (selectedHandles.size === 0) return false;
        return Array.from(selectedHandles).some(h =>
            groupedByHandle[h]?.some(i => i.status === 'mismatched' && i.mismatches.length > 0)
        );
    }, [selectedHandles, groupedByHandle]);

    const hasSelectionWithUnlinkedImages = useMemo(() => {
        if (selectedHandles.size === 0) return false;
        return Array.from(selectedHandles).some(h => {
            const items = groupedByHandle[h];
            const pid = items?.[0]?.shopifyProducts[0]?.id;
            const count = pid ? imageCounts[pid] : undefined;
            return count !== undefined && items && count > items.length;
        });
    }, [selectedHandles, groupedByHandle, imageCounts]);

    // Stats
    const currentSummary = useMemo(() => {
        return filteredData.reduce((acc, item) => {
            if (item.status === 'mismatched' && item.mismatches.length > 0) acc.mismatched++;
            if (item.status === 'missing_in_shopify') acc.missing_in_shopify++;
            if (item.status === 'not_in_csv') acc.not_in_csv++;
            if (item.status === 'duplicate_in_shopify') acc.duplicate_in_shopify++;
            if (item.status === 'duplicate_handle') acc.duplicate_handle++;
            if (item.status === 'matched') acc.matched++;
            return acc;
        }, { matched: 0, mismatched: 0, missing_in_shopify: 0, not_in_csv: 0, duplicate_in_shopify: 0, duplicate_handle: 0 });
    }, [filteredData]);


    return {
        // State
        reportData, setReportData,
        reportSummary: useAuditDataStore.getState().reportSummary,
        setReportSummary,
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
        updatedProductHandles,
        setUpdatedProductHandles: useAuditDataStore.getState().setUpdatedProductHandles,
        hideMissingVariants, setHideMissingVariants,
        selectedHandles, setSelectedHandles,
        imageCounts,

        columnFilters, setColumnFilters,
        availableCsvColumns,

        // Derived Logic
        handleSelectHandle,
        toggleSelectAllPage,
        isAllOnPageSelected,
        isSomeOnPageSelected,
        hasSelectionWithMismatches,
        hasSelectionWithUnlinkedImages,

        // Derived Data
        filteredData,
        uniqueVendors,
        groupedByHandle,
        groupedBySku,
        handleKeys,
        paginatedHandleKeys,
        totalPages,
        currentSummary
    };
}
