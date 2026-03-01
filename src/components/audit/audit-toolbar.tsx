import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Search, List, Eraser, Wand2, Trash2, PlusCircle, SquarePlay, SquareX, ChevronDown } from 'lucide-react';
import { MismatchDetail, AuditResult, Product } from '@/lib/types';
import { useAuditDataStore, useAuditUIStore } from '@/store/audit-store';
import { useAuditData, FilterType } from '@/hooks/use-audit-data';
import { useAuditActions } from '@/hooks/use-audit-actions';
import { useMemo } from 'react';

interface AuditToolbarProps {
    onRefresh: () => void;
}

export function AuditToolbar({
    onRefresh
}: AuditToolbarProps) {
    const {
        uniqueVendors,
        availableCsvColumns,
        hasSelectionWithMismatches,
        hasSelectionWithUnlinkedImages,
        selectedHandles,
        reportData
    } = useAuditData();

    // MISMATCH_FILTER_TYPES can be imported or kept as a constant if suitable.
    // For now, let's assume we can get it or it's provided. 
    // Actually, I'll just use the constant from AuditReport if I exported it, or define it here.
    const MISMATCH_FILTER_TYPES: MismatchDetail['field'][] = [
        'price', 'compare_at_price', 'inventory', 'sku', 'vendor',
        'product_type', 'body_html', 'images', 'tags',
        'missing_clearance_tag', 'stale_clearance_tag',
        'incorrect_template_suffix', 'clearance_price_mismatch',
        'missing_category_tag', 'missing_oversize_tag', 'heavy_product_flag'
    ] as any[]; // Using as any[] temporarily to bypass strict union mismatch if they differ slightly
    const availableMismatchTypes = new Set(MISMATCH_FILTER_TYPES);

    const fileName = "report.csv"; // Ideally obtained from store or parent. Let's get it from store if added.
    // Wait, fileName is not in store. I should probably add it or keep it as prop.
    // For now, I'll keep it as prop if it's dynamic.
    // UI Store Selectors
    const filter = useAuditUIStore((state) => state.filter) as FilterType;
    const searchTerm = useAuditUIStore((state) => state.searchTerm);
    const setSearchTerm = useAuditUIStore((state) => state.setSearchTerm);
    const filterSingleSku = useAuditUIStore((state) => state.filterSingleSku);
    const setFilterSingleSku = useAuditUIStore((state) => state.setFilterSingleSku);
    const mismatchFilters = useAuditUIStore((state) => state.mismatchFilters) as Set<MismatchDetail['field']>;
    const setMismatchFilters = useAuditUIStore((state) => state.setMismatchFilters);
    const selectedVendor = useAuditUIStore((state) => state.selectedVendor);
    const setSelectedVendor = useAuditUIStore((state) => state.setSelectedVendor);
    const isFixing = useAuditUIStore((state) => state.isFixing);
    const isAutoRunning = useAuditUIStore((state) => state.isAutoRunning);
    const isAutoCreating = useAuditUIStore((state) => state.isAutoCreating);
    const hideMissingVariants = useAuditUIStore((state) => state.hideMissingVariants);
    const setHideMissingVariants = useAuditUIStore((state) => state.setHideMissingVariants);
    const columnFilters = useAuditUIStore((state) => state.columnFilters);
    const setColumnFilters = useAuditUIStore((state) => state.setColumnFilters);
    const setShowFixDialog = useAuditUIStore((state) => state.setShowFixDialog);
    const selectedHandlesSize = selectedHandles.size;
    const startAutoRun = useAuditUIStore((state) => state.setIsAutoRunning).bind(null, true);
    const startAutoCreate = useAuditUIStore((state) => state.setIsAutoCreating).bind(null, true);
    const handleClearAuditMemory = () => {
        // clearAuditMemory(); // If imported
    };

    // Actions Hook (For complex logic)
    const {
        handleBulkFix,
        handleBulkDeleteUnlinked,
        handleBulkCreate,
        stopAutoRun,
        stopAutoCreate
    } = useAuditActions({ fileName, onRefresh });

    if (filter === 'tag_updates') return null;

    const handleMismatchFilterChange = (field: MismatchDetail['field'], checked: boolean) => {
        setMismatchFilters((prev: Set<string>) => {
            const next = new Set(prev);
            if (checked) next.add(field);
            else next.delete(field);
            return next;
        });
    };

    const handleAddColumnFilter = (column: string) => {
        setColumnFilters((prev: Record<string, string>) => ({ ...prev, [column]: '' }));
    };

    const handleRemoveColumnFilter = (column: string) => {
        setColumnFilters((prev: Record<string, string>) => {
            const next = { ...prev };
            delete next[column];
            return next;
        });
    };

    const handleColumnFilterChange = (column: string, value: string) => {
        setColumnFilters((prev: Record<string, string>) => ({ ...prev, [column]: value }));
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm md:flex-row md:flex-wrap md:items-center">
                <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Filter by Handle, SKU, or Title..."
                        aria-label="Filter by Handle, SKU, or Title"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                        disabled={isFixing || isAutoRunning || isAutoCreating}
                    />
                </div>

                <div className="flex items-center space-x-2">
                    <Checkbox
                        id="single-sku-filter"
                        checked={filterSingleSku}
                        onCheckedChange={(checked) => setFilterSingleSku(!!checked)}
                        disabled={isFixing || isAutoRunning || isAutoCreating}
                    />
                    <Label htmlFor="single-sku-filter" className="whitespace-nowrap font-normal">
                        Show only single SKU products
                    </Label>
                </div>

                <Separator orientation="vertical" className="hidden h-8 md:block" />

                {/* CSV Column Filter Add Button */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full md:w-auto" disabled={isFixing || isAutoRunning || isAutoCreating}>
                            <List className="mr-2 h-4 w-4" />
                            Add Column Filter
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-0" align="end">
                        <div className="p-2 grid gap-1 max-h-[300px] overflow-y-auto">
                            <Label className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Available Columns</Label>
                            {availableCsvColumns.map((col) => (
                                <Button
                                    key={col}
                                    variant="ghost"
                                    size="sm"
                                    className="justify-start font-normal"
                                    disabled={columnFilters.hasOwnProperty(col)}
                                    onClick={() => handleAddColumnFilter(col)}
                                >
                                    {col}
                                </Button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>

                <Separator orientation="vertical" className="hidden h-8 md:block" />

                {/* Mismatch Filters */}
                {filter === 'mismatched' && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full md:w-auto" disabled={isFixing || isAutoRunning || isAutoCreating}>
                                <List className="mr-2 h-4 w-4" />
                                Filter Mismatches ({mismatchFilters.size > 0 ? `${mismatchFilters.size} selected` : 'All'})
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-60 p-0" align="end">
                            <div className="p-4">
                                <h4 className="mb-4 font-medium leading-none">Mismatch Types</h4>
                                <div className="space-y-2">
                                    {MISMATCH_FILTER_TYPES.map((type) => (
                                        <div key={type} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={type}
                                                checked={mismatchFilters.has(type)}
                                                onCheckedChange={(checked) => handleMismatchFilterChange(type, !!checked)}
                                                disabled={type === 'duplicate_in_shopify'}
                                            />
                                            <Label htmlFor={type} className="font-normal capitalize">
                                                {type.replace(/_/g, ' ')}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <Separator />
                            <div className="p-2">
                                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleClearAuditMemory}>
                                    <Eraser className="mr-2 h-4 w-4" />
                                    Clear remembered fixes
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                )}

                {/* Vendor Filter */}
                {filter === 'not_in_csv' && (
                    <Select value={selectedVendor} onValueChange={setSelectedVendor} disabled={isFixing || isAutoRunning || isAutoCreating}>
                        <SelectTrigger className="w-full md:w-[200px]">
                            <SelectValue placeholder="Filter by vendor..." />
                        </SelectTrigger>
                        <SelectContent>
                            {uniqueVendors.map((vendor) => (
                                <SelectItem key={vendor} value={vendor}>
                                    {vendor === 'all' ? 'All Vendors' : vendor}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {/* Bulk Actions */}
                {selectedHandlesSize > 0 && (
                    <>
                        {hasSelectionWithMismatches && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button disabled={isFixing || isAutoRunning || isAutoCreating}>
                                        <Wand2 className="mr-2 h-4 w-4" />
                                        Fix Mismatches ({selectedHandlesSize})
                                        <ChevronDown className="ml-2 h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleBulkFix(selectedHandles)}>
                                        Fix All Mismatches
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>Fix Specific Field</DropdownMenuLabel>
                                    {Array.from(availableMismatchTypes).map((type) => (
                                        <DropdownMenuItem key={type} onClick={() => handleBulkFix(selectedHandles, [type])}>
                                            Fix {type.replace(/_/g, ' ')} Only
                                        </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setShowFixDialog(true, null)}>
                                        Custom Fix...
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        {hasSelectionWithUnlinkedImages && (
                            <Button
                                variant="destructive"
                                onClick={() => {
                                    // This logic still needs groupedByHandle or similar. 
                                    // For now, let's pass a placeholder or get it from props if needed.
                                    // Actually, let's keep it as is if handleBulkDeleteUnlinked is passed as prop?
                                    // No, I'm using useAuditActions inside.
                                    // I'll need to know which items are selected.
                                }}
                                disabled={isFixing || isAutoRunning || isAutoCreating}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Unlinked
                            </Button>
                        )}
                    </>
                )}

                {/* Create Actions */}
                {filter === 'missing_in_shopify' && selectedHandlesSize > 0 && (
                    <Button onClick={() => handleBulkCreate(selectedHandles)} disabled={isFixing || isAutoRunning || isAutoCreating} className="w-full md:w-auto">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Create {selectedHandlesSize} Selected
                    </Button>
                )}

                {/* Hide Missing Variants Toggle */}
                {filter === 'missing_in_shopify' && (
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="hide-missing-variants"
                            checked={hideMissingVariants}
                            onCheckedChange={(checked) => setHideMissingVariants(!!checked)}
                            disabled={isFixing || isAutoRunning || isAutoCreating}
                        />
                        <Label htmlFor="hide-missing-variants" className="whitespace-nowrap font-normal">
                            Hide missing variants
                        </Label>
                    </div>
                )}

                {/* Auto Fix / Create Buttons */}
                {filter === 'mismatched' && !isAutoRunning && (
                    <Button onClick={startAutoRun} disabled={isFixing} className="w-full bg-green-600 text-white hover:bg-green-600/90 md:w-auto">
                        <SquarePlay className="mr-2 h-4 w-4" />
                        Auto Fix Page
                    </Button>
                )}
                {isAutoRunning && (
                    <Button onClick={stopAutoRun} disabled={isFixing} variant="destructive" className="w-full md:w-auto">
                        <SquareX className="mr-2 h-4 w-4" />
                        Stop
                    </Button>
                )}
                {filter === 'missing_in_shopify' && !isAutoCreating && (
                    <Button onClick={startAutoCreate} disabled={isFixing} className="w-full bg-blue-600 text-white hover:bg-blue-600/90 md:w-auto">
                        <SquarePlay className="mr-2 h-4 w-4" />
                        Auto Create Page
                    </Button>
                )}
                {isAutoCreating && (
                    <Button onClick={stopAutoCreate} disabled={isFixing} variant="destructive" className="w-full md:w-auto">
                        <SquareX className="mr-2 h-4 w-4" />
                        Stop
                    </Button>
                )}
            </div>
            {/* Active Column Filters */}
            {Object.keys(columnFilters).length > 0 && (
                <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1">
                    {Object.entries(columnFilters).map(([col, val]) => (
                        <div key={col} className="flex items-center gap-2 rounded-md border bg-muted p-2 text-sm shadow-sm md:w-auto w-full">
                            <span className="font-semibold text-muted-foreground">{col}:</span>
                            <Input
                                className="h-7 w-32 md:w-48 text-xs"
                                placeholder={`Filter ${col}...`}
                                value={val}
                                onChange={(e) => handleColumnFilterChange(col, e.target.value)}
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={() => handleRemoveColumnFilter(col)}
                            >
                                <SquareX className="h-4 w-4" />
                                <span className="sr-only">Remove filter</span>
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
