import { create } from 'zustand';
import { AuditResult, AuditStatus, DuplicateSku, Summary, MismatchDetail } from '@/lib/types';

interface AuditDataState {
    reportData: AuditResult[];
    reportSummary: Summary | null;
    duplicates: DuplicateSku[];
    imageCounts: Record<string, number>;
    loadingImageCounts: Set<string>;
    fixedMismatches: Set<string>;
    createdProductHandles: Set<string>;
    updatedProductHandles: Set<string>;

    // Actions
    setReportData: (data: AuditResult[] | ((prev: AuditResult[]) => AuditResult[])) => void;
    setReportSummary: (summary: Summary | ((prev: Summary | null) => Summary)) => void;
    setImageCounts: (counts: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
    setLoadingImageCounts: (handles: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    setFixedMismatches: (fixed: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    setCreatedProductHandles: (created: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    setUpdatedProductHandles: (updated: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    updateItemStatus: (sku: string, status: AuditStatus, mismatches?: MismatchDetail[]) => void;
    removeImageCount: (productId: string) => void;
}

export const useAuditDataStore = create<AuditDataState>((set) => ({
    reportData: [],
    reportSummary: null,
    duplicates: [],
    imageCounts: {},
    loadingImageCounts: new Set(),
    fixedMismatches: new Set(),
    createdProductHandles: new Set(),
    updatedProductHandles: new Set(),

    setReportData: (data) => set((state) => ({
        reportData: typeof data === 'function' ? data(state.reportData) : data
    })),
    setReportSummary: (summary) => set((state) => ({
        reportSummary: typeof summary === 'function' ? summary(state.reportSummary) : summary
    })),
    setImageCounts: (counts) => set((state) => ({
        imageCounts: typeof counts === 'function' ? counts(state.imageCounts) : counts
    })),
    setLoadingImageCounts: (handles) => set((state) => ({
        loadingImageCounts: typeof handles === 'function' ? handles(state.loadingImageCounts) : handles
    })),
    setFixedMismatches: (fixed) => set((state) => ({
        fixedMismatches: typeof fixed === 'function' ? fixed(state.fixedMismatches) : fixed
    })),
    setCreatedProductHandles: (created) => set((state) => ({
        createdProductHandles: typeof created === 'function' ? created(state.createdProductHandles) : created
    })),
    setUpdatedProductHandles: (updated) => set((state) => ({
        updatedProductHandles: typeof updated === 'function' ? updated(state.updatedProductHandles) : updated
    })),
    updateItemStatus: (sku, status, mismatches = []) =>
        set((state) => ({
            reportData: state.reportData.map((item) =>
                item.sku === sku ? { ...item, status, mismatches } : item
            ),
        })),
    removeImageCount: (productId) =>
        set((state) => {
            const newCounts = { ...state.imageCounts };
            delete newCounts[productId];
            return { imageCounts: newCounts };
        }),
}));

interface AuditUIState {
    selectedHandles: Set<string>;
    filter: string;
    searchTerm: string;
    currentPage: number;
    handlesPerPage: number;
    mismatchFilters: Set<string>;
    filterSingleSku: boolean;
    selectedVendor: string;
    filterCustomTag: string;
    hideMissingVariants: boolean;
    columnFilters: Record<string, string>;
    isFixing: boolean;
    isAutoRunning: boolean;
    isAutoCreating: boolean;
    showFixDialog: boolean;
    fixDialogHandles: Set<string> | null;
    editingMediaFor: string | null;
    editingMissingMedia: string | null;
    editingMissingVariantMedia: { parentProductId: string; items: AuditResult[] } | null;

    // Actions
    setSelectedHandles: (handles: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    toggleHandleSelection: (handle: string) => void;
    setFilter: (filter: string) => void;
    setSearchTerm: (term: string) => void;
    setCurrentPage: (page: number | ((prev: number) => number)) => void;
    setHandlesPerPage: (perPage: number | ((prev: number) => number)) => void;
    setMismatchFilters: (filters: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    setFilterSingleSku: (filter: boolean) => void;
    setSelectedVendor: (vendor: string) => void;
    setFilterCustomTag: (tag: string) => void;
    setHideMissingVariants: (hide: boolean) => void;
    setColumnFilters: (filters: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
    setIsFixing: (isFixing: boolean) => void;
    setIsAutoRunning: (isRunning: boolean) => void;
    setIsAutoCreating: (isCreating: boolean) => void;
    setShowFixDialog: (show: boolean, handles?: Set<string> | null) => void;
    setEditingMediaFor: (id: string | null) => void;
    setEditingMissingMedia: (handle: string | null) => void;
    setEditingMissingVariantMedia: (data: { parentProductId: string; items: AuditResult[] } | null) => void;
    clearUIState: () => void;
}

export const useAuditUIStore = create<AuditUIState>((set) => ({
    selectedHandles: new Set(),
    filter: 'all',
    searchTerm: '',
    currentPage: 1,
    handlesPerPage: 20,
    mismatchFilters: new Set(),
    filterSingleSku: false,
    selectedVendor: 'all',
    filterCustomTag: '',
    hideMissingVariants: false,
    columnFilters: {},
    isFixing: false,
    isAutoRunning: false,
    isAutoCreating: false,
    showFixDialog: false,
    fixDialogHandles: null,
    editingMediaFor: null,
    editingMissingMedia: null,
    editingMissingVariantMedia: null,

    setSelectedHandles: (handles) => set((state) => ({
        selectedHandles: typeof handles === 'function' ? handles(state.selectedHandles) : handles
    })),
    toggleHandleSelection: (handle) =>
        set((state) => {
            const newSelected = new Set(state.selectedHandles);
            if (newSelected.has(handle)) {
                newSelected.delete(handle);
            } else {
                newSelected.add(handle);
            }
            return { selectedHandles: newSelected };
        }),
    setFilter: (filter) => set({ filter }),
    setSearchTerm: (searchTerm) => set({ searchTerm, currentPage: 1 }),
    setCurrentPage: (page) => set((state) => ({
        currentPage: typeof page === 'function' ? page(state.currentPage) : page
    })),
    setHandlesPerPage: (perPage) => set((state) => ({
        handlesPerPage: typeof perPage === 'function' ? perPage(state.handlesPerPage) : perPage,
        currentPage: 1
    })),
    setMismatchFilters: (filters) => set((state) => ({
        mismatchFilters: typeof filters === 'function' ? filters(state.mismatchFilters) : filters
    })),
    setFilterSingleSku: (filterSingleSku) => set({ filterSingleSku }),
    setSelectedVendor: (selectedVendor) => set({ selectedVendor }),
    setFilterCustomTag: (filterCustomTag) => set({ filterCustomTag }),
    setHideMissingVariants: (hideMissingVariants) => set({ hideMissingVariants }),
    setColumnFilters: (filters) => set((state) => ({
        columnFilters: typeof filters === 'function' ? filters(state.columnFilters) : filters
    })),
    setIsFixing: (isFixing) => set({ isFixing }),
    setIsAutoRunning: (isAutoRunning) => set({ isAutoRunning }),
    setIsAutoCreating: (isAutoCreating) => set({ isAutoCreating }),
    setShowFixDialog: (showFixDialog, fixDialogHandles = null) =>
        set({ showFixDialog, fixDialogHandles }),
    setEditingMediaFor: (editingMediaFor) => set({ editingMediaFor }),
    setEditingMissingMedia: (editingMissingMedia) => set({ editingMissingMedia }),
    setEditingMissingVariantMedia: (editingMissingVariantMedia) => set({ editingMissingVariantMedia }),
    clearUIState: () =>
        set({
            selectedHandles: new Set(),
            filter: 'all',
            searchTerm: '',
            currentPage: 1,
            mismatchFilters: new Set(),
            filterSingleSku: false,
            selectedVendor: 'all',
            filterCustomTag: '',
            hideMissingVariants: false,
            columnFilters: {},
            isFixing: false,
            isAutoRunning: false,
            isAutoCreating: false,
            showFixDialog: false,
            fixDialogHandles: null,
            editingMediaFor: null,
            editingMissingMedia: null,
            editingMissingVariantMedia: null,
        }),
}));
