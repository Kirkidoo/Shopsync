'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Trash2,
    Link,
    Blocks,
    ImagePlus,
    X,
    ArrowRightLeft,
    MousePointer2,
    Check,
    Zap,
    CheckSquare,
    Square,
    Search,
    Maximize2,
    ChevronDown,
    Info,
    Loader2
} from 'lucide-react';
import { Product } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getProductWithImages } from '@/app/actions';

interface PreCreationMediaManagerVariantProps {
    variants: Product[];
    parentProductId: string;
    onSave: (updatedVariants: Product[], imageUrls: string[]) => void;
    onCancel: () => void;
}

export function PreCreationMediaManagerVariant({
    variants,
    parentProductId,
    onSave,
    onCancel,
}: PreCreationMediaManagerVariantProps) {
    const [localVariants, setLocalVariants] = useState<Product[]>([]);
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [newImageUrl, setNewImageUrl] = useState('');
    const { toast } = useToast();
    const [selectedImageUrls, setSelectedImageUrls] = useState<Set<string>>(new Set());

    // Track which URLs are from the existing Shopify product
    const [existingProductUrls, setExistingProductUrls] = useState<Set<string>>(new Set());
    const [isLoadingExisting, setIsLoadingExisting] = useState(true);

    // State for bulk assign dialog
    const [bulkAssignImageUrl, setBulkAssignImageUrl] = useState<string>('');
    const [bulkAssignOption, setBulkAssignOption] = useState<string>('');
    const [bulkAssignValue, setBulkAssignValue] = useState<string>('');
    const [isBulkAssignDialogOpen, setIsBulkAssignDialogOpen] = useState(false);

    // State for merging images
    const [mergingImageUrl, setMergingImageUrl] = useState<string | null>(null);
    const [isMergingDialogOpen, setIsMergingDialogOpen] = useState(false);
    const [masterImageUrl, setMasterImageUrl] = useState<string>('');

    // State for focused variant (for gallery picking)
    const [focusedVariantSku, setFocusedVariantSku] = useState<string | null>(null);

    // Revision counter to force Select re-renders when assignments change externally
    const [revision, setRevision] = useState(0);

    // Multi-select for variants
    const [selectedVariantSkus, setSelectedVariantSkus] = useState<Set<string>>(new Set());

    // Search/Filter for gallery
    const [gallerySearch, setGallerySearch] = useState('');

    // Initialize local variants and FTP image URLs
    useEffect(() => {
        setLocalVariants(JSON.parse(JSON.stringify(variants)));
        const uniqueFtpUrls = [...new Set(variants.map((v) => v.mediaUrl).filter(Boolean) as string[])];
        setImageUrls(uniqueFtpUrls);
        setSelectedImageUrls(new Set());
    }, []); // Only initialize on mount

    // Fetch existing product images from Shopify
    useEffect(() => {
        async function fetchExistingImages() {
            setIsLoadingExisting(true);
            try {
                const data = await getProductWithImages(parentProductId);
                const existingUrls = data.images.map((img) => img.src);
                const existingSet = new Set(existingUrls);
                setExistingProductUrls(existingSet);

                // Merge existing URLs into gallery (avoid duplicates)
                setImageUrls((prev) => {
                    const combined = [...prev];
                    existingUrls.forEach((url) => {
                        if (!combined.includes(url)) {
                            combined.push(url);
                        }
                    });
                    return combined;
                });
            } catch (err) {
                toast({
                    title: 'Warning',
                    description: 'Could not load existing product images.',
                    variant: 'destructive',
                });
            } finally {
                setIsLoadingExisting(false);
            }
        }
        fetchExistingImages();
    }, [parentProductId, toast]);

    // Reactive: recompute assigned URLs whenever localVariants changes
    const assignedUrls = useMemo(() => {
        return new Set(localVariants.map((v) => v.mediaUrl).filter(Boolean) as string[]);
    }, [localVariants]);

    // Count how many variants each URL is assigned to
    const assignmentCounts = useMemo(() => {
        const counts = new Map<string, number>();
        localVariants.forEach((v) => {
            if (v.mediaUrl) {
                counts.set(v.mediaUrl, (counts.get(v.mediaUrl) || 0) + 1);
            }
        });
        return counts;
    }, [localVariants]);

    const handleImageSelection = (imageUrl: string, checked: boolean) => {
        const newSet = new Set(selectedImageUrls);
        if (checked) {
            newSet.add(imageUrl);
        } else {
            newSet.delete(imageUrl);
        }
        setSelectedImageUrls(newSet);
    };

    const handleSelectAllImages = (checked: boolean) => {
        if (checked) {
            setSelectedImageUrls(new Set(imageUrls));
        } else {
            setSelectedImageUrls(new Set());
        }
    };

    const handleAddImageUrl = () => {
        if (!newImageUrl || !newImageUrl.startsWith('http')) {
            toast({
                title: 'Invalid URL',
                description: 'Please enter a valid image URL.',
                variant: 'destructive',
            });
            return;
        }
        if (imageUrls.includes(newImageUrl)) {
            toast({
                title: 'Duplicate URL',
                description: 'This image URL has already been added.',
                variant: 'destructive',
            });
            return;
        }
        setImageUrls((prev) => [...prev, newImageUrl]);
        setNewImageUrl('');
    };

    // Delete a single image from gallery and unassign from all variants
    const handleDeleteSingleImage = useCallback((urlToDelete: string) => {
        setImageUrls((prev) => prev.filter((url) => url !== urlToDelete));
        setLocalVariants((prev) =>
            prev.map((v) => (v.mediaUrl === urlToDelete ? { ...v, mediaUrl: null } : v))
        );
        setSelectedImageUrls((prev) => {
            const next = new Set(prev);
            next.delete(urlToDelete);
            return next;
        });
        setRevision((r) => r + 1);
        toast({
            title: 'Image Removed',
            description: 'Image removed from gallery and unassigned from all variants.',
        });
    }, [toast]);

    const handleBulkDelete = useCallback(() => {
        const urlsToKeep = imageUrls.filter((url) => !selectedImageUrls.has(url));
        setImageUrls(urlsToKeep);
        setLocalVariants((prev) =>
            prev.map((v) => {
                if (v.mediaUrl && selectedImageUrls.has(v.mediaUrl)) {
                    return { ...v, mediaUrl: null };
                }
                return v;
            })
        );
        setRevision((r) => r + 1);
        toast({
            title: 'Images Removed',
            description: `${selectedImageUrls.size} image(s) removed from gallery and unassigned.`,
        });
        setSelectedImageUrls(new Set());
    }, [imageUrls, selectedImageUrls, toast]);

    const handleMergeImages = useCallback(() => {
        if (!mergingImageUrl || !masterImageUrl) return;

        setLocalVariants((prev) =>
            prev.map((v) => (v.mediaUrl === mergingImageUrl ? { ...v, mediaUrl: masterImageUrl } : v))
        );
        setImageUrls((prev) => prev.filter((url) => url !== mergingImageUrl));

        // Update selection if needed
        setSelectedImageUrls((prev) => {
            const next = new Set(prev);
            next.delete(mergingImageUrl);
            return next;
        });

        setRevision((r) => r + 1);
        setIsMergingDialogOpen(false);
        setMergingImageUrl(null);
        setMasterImageUrl('');

        toast({
            title: 'Images Merged',
            description: 'The duplicate image has been replaced and removed.',
        });
    }, [mergingImageUrl, masterImageUrl, toast]);

    const handleAssignImage = useCallback((sku: string, url: string | null) => {
        setLocalVariants((prev) => prev.map((v) => (v.sku === sku ? { ...v, mediaUrl: url } : v)));
        setRevision((r) => r + 1);
    }, []);

    const handleAssignToAll = useCallback((url: string) => {
        setLocalVariants((prev) => prev.map((v) => ({ ...v, mediaUrl: url })));
        setRevision((r) => r + 1);
        toast({
            title: 'Assigned to All',
            description: `Image assigned to all ${localVariants.length} variants.`,
        });
    }, [localVariants.length, toast]);

    const handleAssignToSelection = useCallback((url: string) => {
        if (selectedVariantSkus.size === 0) return;

        setLocalVariants((prev) =>
            prev.map((v) => (selectedVariantSkus.has(v.sku) ? { ...v, mediaUrl: url } : v))
        );
        setRevision((r) => r + 1);
        toast({
            title: 'Success!',
            description: `Assigned to ${selectedVariantSkus.size} selected variants.`,
        });
    }, [selectedVariantSkus, toast]);

    const toggleVariantSelection = (sku: string) => {
        setSelectedVariantSkus((prev) => {
            const next = new Set(prev);
            if (next.has(sku)) next.delete(sku);
            else next.add(sku);
            return next;
        });
    };

    const selectAllVariants = (checked: boolean) => {
        if (checked) {
            setSelectedVariantSkus(new Set(localVariants.map((v) => v.sku)));
        } else {
            setSelectedVariantSkus(new Set());
        }
    };

    const selectByOption = (optionName: string, value: string) => {
        let optionKey: keyof Product | null = null;
        if (variants[0]?.option1Name === optionName) optionKey = 'option1Value';
        else if (variants[0]?.option2Name === optionName) optionKey = 'option2Value';
        else if (variants[0]?.option3Name === optionName) optionKey = 'option3Value';

        if (!optionKey) return;

        const matchingSkus = localVariants
            .filter((v) => v[optionKey!] === value)
            .map((v) => v.sku);

        setSelectedVariantSkus((prev) => {
            const next = new Set(prev);
            matchingSkus.forEach((sku) => next.add(sku));
            return next;
        });

        toast({
            title: 'Selection Updated',
            description: `Selected ${matchingSkus.length} variants with ${optionName}: ${value}`,
        });
    };

    const availableOptions = useMemo(() => {
        const options = new Map<string, Set<string>>();

        variants.forEach((variant) => {
            if (variant.option1Name && variant.option1Value) {
                if (!options.has(variant.option1Name)) {
                    options.set(variant.option1Name, new Set());
                }
                options.get(variant.option1Name)!.add(variant.option1Value);
            }
            if (variant.option2Name && variant.option2Value) {
                if (!options.has(variant.option2Name)) {
                    options.set(variant.option2Name, new Set());
                }
                options.get(variant.option2Name)!.add(variant.option2Value);
            }
            if (variant.option3Name && variant.option3Value) {
                if (!options.has(variant.option3Name)) {
                    options.set(variant.option3Name, new Set());
                }
                options.get(variant.option3Name)!.add(variant.option3Value);
            }
        });

        return options;
    }, [variants]);

    const handleBulkAssign = () => {
        if (!bulkAssignImageUrl || !bulkAssignOption) {
            toast({
                title: 'Incomplete Selection',
                description: 'Please select an image and an option.',
                variant: 'destructive',
            });
            return;
        }

        let variantsToUpdate: Product[] = [];

        if (bulkAssignOption === 'All Variants') {
            variantsToUpdate = [...localVariants];
        } else {
            if (!bulkAssignValue) {
                toast({
                    title: 'Incomplete Selection',
                    description: 'Please select a value to match.',
                    variant: 'destructive',
                });
                return;
            }

            let optionKey: keyof Product | null = null;
            if (variants[0]?.option1Name === bulkAssignOption) optionKey = 'option1Value';
            else if (variants[0]?.option2Name === bulkAssignOption) optionKey = 'option2Value';
            else if (variants[0]?.option3Name === bulkAssignOption) optionKey = 'option3Value';

            if (!optionKey) return;

            variantsToUpdate = localVariants.filter((v) => v[optionKey] === bulkAssignValue);
        }

        if (variantsToUpdate.length === 0) {
            toast({
                title: 'No variants found',
                description: 'No variants match the selected criteria.',
                variant: 'destructive',
            });
            return;
        }

        setLocalVariants((prev) =>
            prev.map((v) => {
                if (variantsToUpdate.some((vtu) => vtu.sku === v.sku)) {
                    return { ...v, mediaUrl: bulkAssignImageUrl };
                }
                return v;
            })
        );

        setRevision((r) => r + 1);
        setIsBulkAssignDialogOpen(false);
        toast({
            title: 'Success!',
            description: `Image assigned to ${variantsToUpdate.length} variants.`,
        });

        // Reset form
        setBulkAssignImageUrl('');
        setBulkAssignOption('');
        setBulkAssignValue('');
    };

    const handleSave = () => {
        onSave(localVariants, imageUrls);
    };

    if (variants.length === 0) {
        return null;
    }

    const productTitle = variants[0]?.name || 'New Product';

    // Helper to determine image source badge
    const getImageSourceBadge = (url: string) => {
        if (existingProductUrls.has(url)) return 'EXISTING';
        return null; // FTP images don't need a badge, they're the default
    };

    return (
        <TooltipProvider>
            <div className="flex flex-col h-[85vh] -m-6 bg-background/50 backdrop-blur-xl">
                {/* Top Header - Premium Bar */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-background/80 backdrop-blur-md sticky top-0 z-20">
                    <div>
                        <div className="flex items-center gap-2">
                            <DialogTitle className="text-xl font-bold tracking-tight">{productTitle}</DialogTitle>
                            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-primary/5 text-primary border-primary/20">
                                Media Manager
                            </Badge>
                            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500 border-blue-500/20">
                                Missing Variant
                            </Badge>
                        </div>
                        <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                            Assign media to missing variants using existing product images or FTP sources.
                        </DialogDescription>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" onClick={onCancel} className="h-9 px-4 text-sm font-medium hover:bg-muted/80">
                            Discard Changes
                        </Button>
                        <Button onClick={handleSave} className="h-9 px-5 text-sm font-semibold shadow-lg shadow-primary/20 translate-y-0 active:translate-y-0.5 transition-all">
                            Save Assignments
                        </Button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel: Gallery (World Class Aesthetics) */}
                    <div className="w-1/2 border-r flex flex-col bg-muted/5 relative">
                        <div className="p-4 border-b flex items-center justify-between bg-background/40 backdrop-blur-sm sticky top-0 z-10">
                            <div className="flex items-center gap-4 flex-1">
                                <div className="relative flex-1 max-w-xs">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search images..."
                                        className="pl-9 h-9 bg-background/60 border-none ring-1 ring-border/50 focus-visible:ring-primary/50 text-sm"
                                        value={gallerySearch}
                                        onChange={(e) => setGallerySearch(e.target.value)}
                                    />
                                </div>
                                <Separator orientation="vertical" className="h-6" />
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="select-all-pre"
                                        className="rounded-sm border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                        onCheckedChange={(checked) => handleSelectAllImages(!!checked)}
                                        checked={imageUrls.length > 0 && selectedImageUrls.size === imageUrls.length}
                                        disabled={imageUrls.length === 0}
                                    />
                                    <Label htmlFor="select-all-pre" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        All
                                    </Label>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 ml-4">
                                {isLoadingExisting && (
                                    <div className="flex items-center gap-1.5 text-muted-foreground animate-pulse">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        <span className="text-[10px] font-bold uppercase">Loading...</span>
                                    </div>
                                )}

                                {selectedImageUrls.size > 0 && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="sm" className="h-8 px-3 text-[11px] font-bold uppercase tracking-tighter animate-in fade-in zoom-in duration-200">
                                                Delete ({selectedImageUrls.size})
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent className="max-w-md border-destructive/20 shadow-2xl shadow-destructive/10">
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Remove {selectedImageUrls.size} images?</AlertDialogTitle>
                                                <AlertDialogDescription className="text-sm">
                                                    This will unassign them from all variants. The URLs will be removed from this manager&apos;s session.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel className="text-xs h-8">Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90 text-xs h-8">
                                                    Confirm Removal
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}

                                <Dialog open={isBulkAssignDialogOpen} onOpenChange={setIsBulkAssignDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[11px] font-bold uppercase tracking-tight bg-background/50" disabled={imageUrls.length === 0}>
                                            <Blocks className="h-3.5 w-3.5" />
                                            Legacy Bulk
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader>
                                            <DialogTitle className="flex items-center gap-2">
                                                <Zap className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                                                Bulk Assignment Tool
                                            </DialogTitle>
                                            <DialogDescription>
                                                Match images by variant options (like Color or Size) across the entire product.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="space-y-5 py-4">
                                            <div className="space-y-2.5">
                                                <Label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                                                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px]">1</span>
                                                    Select Source Image
                                                </Label>
                                                <Select value={bulkAssignImageUrl} onValueChange={setBulkAssignImageUrl}>
                                                    <SelectTrigger className="h-10 bg-muted/30">
                                                        <SelectValue placeholder="Pick an image from the gallery..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {imageUrls.map((url, idx) => (
                                                            <SelectItem key={url} value={url}>
                                                                <div className="flex items-center gap-3">
                                                                    <Image src={url} alt="" width={24} height={24} className="rounded object-cover ring-1 ring-border" />
                                                                    <span className="text-sm font-medium">Image {idx + 1}</span>
                                                                    {existingProductUrls.has(url) && <Badge className="bg-blue-500/80 text-[8px] px-1 h-3.5 border-none ml-1">EXISTING</Badge>}
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-4 pt-2">
                                                <Label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                                                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px]">2</span>
                                                    Define Targeting Logic
                                                </Label>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1.5">
                                                        <span className="text-[10px] font-bold text-muted-foreground/60 ml-1">GROUP BY</span>
                                                        <Select value={bulkAssignOption} onValueChange={(val) => { setBulkAssignOption(val); setBulkAssignValue(''); }}>
                                                            <SelectTrigger className="h-9">
                                                                <SelectValue placeholder="Option name..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="All Variants" className="font-bold text-primary">Full Product</SelectItem>
                                                                {[...availableOptions.keys()].map((name) => (
                                                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    {bulkAssignOption && bulkAssignOption !== 'All Variants' && (
                                                        <div className="space-y-1.5 animate-in slide-in-from-left-2 duration-300">
                                                            <span className="text-[10px] font-bold text-muted-foreground/60 ml-1">MATCH VALUE</span>
                                                            <Select value={bulkAssignValue} onValueChange={setBulkAssignValue}>
                                                                <SelectTrigger className="h-9">
                                                                    <SelectValue placeholder="Choose value..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {availableOptions.get(bulkAssignOption)?.size &&
                                                                        Array.from(availableOptions.get(bulkAssignOption)!).map((val) => (
                                                                            <SelectItem key={val} value={val}>{val}</SelectItem>
                                                                        ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button variant="ghost" onClick={() => setIsBulkAssignDialogOpen(false)} className="text-xs">Cancel</Button>
                                            <Button onClick={handleBulkAssign} disabled={!bulkAssignImageUrl || (!bulkAssignValue && bulkAssignOption !== 'All Variants')} className="gap-2 shadow-lg shadow-primary/20">
                                                <Check className="h-4 w-4" />
                                                Apply Batch Update
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </div>

                        <ScrollArea className="flex-1 p-6">
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                                {imageUrls.filter(url => !gallerySearch || url.toLowerCase().includes(gallerySearch.toLowerCase())).map((url, i) => {
                                    const isSelected = selectedImageUrls.has(url);
                                    const count = assignmentCounts.get(url) || 0;
                                    const isBeingApplied = selectedVariantSkus.size > 0;
                                    const sourceBadge = getImageSourceBadge(url);

                                    return (
                                        <div
                                            key={url}
                                            className={cn(
                                                "group relative aspect-square rounded-xl border-2 overflow-hidden transition-all duration-300 ring-offset-2 hover:ring-2 hover:ring-primary/40",
                                                isSelected ? "border-primary ring-2 ring-primary/60 scale-[0.98] shadow-lg shadow-primary/10" : "border-border/60 hover:border-border"
                                            )}
                                        >
                                            <Image
                                                src={url}
                                                alt={`Gallery item ${i + 1}`}
                                                fill
                                                className={cn(
                                                    "object-cover transition-transform duration-500 group-hover:scale-110",
                                                    isSelected && "brightness-[0.85]"
                                                )}
                                            />

                                            {/* Selection Overlay (Persistent if checked) */}
                                            <div className={cn(
                                                "absolute top-3 left-3 flex items-center gap-2 transition-opacity duration-200",
                                                isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                            )}>
                                                <Checkbox
                                                    id={`pre-image-select-${i}`}
                                                    className="h-5 w-5 bg-background shadow-xl data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                                    checked={isSelected}
                                                    onCheckedChange={(checked) => handleImageSelection(url, !!checked)}
                                                />
                                            </div>

                                            {/* Main Actions Overlay */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                                                <div className="flex flex-col gap-2 translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                                                    {isBeingApplied ? (
                                                        <Button
                                                            size="sm"
                                                            className="w-full bg-primary/90 hover:bg-primary shadow-xl ring-1 ring-white/20 backdrop-blur-sm text-[11px] font-bold h-8 gap-2 uppercase"
                                                            onClick={(e) => { e.preventDefault(); handleAssignToSelection(url); }}
                                                        >
                                                            <MousePointer2 className="h-3.5 w-3.5" />
                                                            Apply to {selectedVariantSkus.size} Selected
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            className="w-full bg-background/90 hover:bg-background shadow-xl ring-1 ring-black/5 backdrop-blur-sm text-[11px] font-bold h-8 gap-2 uppercase"
                                                            onClick={(e) => { e.preventDefault(); handleAssignToAll(url); }}
                                                        >
                                                            <ImagePlus className="h-3.5 w-3.5" />
                                                            Assign All
                                                        </Button>
                                                    )}

                                                    <div className="flex gap-2">
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="secondary"
                                                                    size="icon"
                                                                    className="h-8 w-8 bg-background/40 hover:bg-background/90 backdrop-blur-sm border-white/10"
                                                                    onClick={(e) => { e.preventDefault(); setMergingImageUrl(url); setIsMergingDialogOpen(true); }}
                                                                >
                                                                    <ArrowRightLeft className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Merge/Replace</TooltipContent>
                                                        </Tooltip>

                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="secondary"
                                                                    size="icon"
                                                                    className="h-8 w-8 bg-background/40 hover:bg-background/90 backdrop-blur-sm border-white/10"
                                                                    onClick={(e) => { e.preventDefault(); window.open(url, '_blank'); }}
                                                                >
                                                                    <Link className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Full View</TooltipContent>
                                                        </Tooltip>

                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="destructive"
                                                                    size="icon"
                                                                    className="h-8 w-8 bg-destructive/60 hover:bg-destructive shadow-xl"
                                                                    onClick={(e) => { e.preventDefault(); handleDeleteSingleImage(url); }}
                                                                >
                                                                    <X className="h-4 w-4 text-white" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Delete URL</TooltipContent>
                                                        </Tooltip>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Status Indicators */}
                                            <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 pointer-events-none">
                                                {count > 0 ? (
                                                    <Badge className="bg-green-500/90 text-[9px] px-1.5 h-4 border-none backdrop-blur-sm shadow-md transition-all group-hover:scale-105">
                                                        {count} USED
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="bg-black/40 text-white/70 text-[9px] px-1.5 h-4 border-none backdrop-blur-sm opacity-50 group-hover:opacity-100 transition-opacity">
                                                        STALE
                                                    </Badge>
                                                )}
                                                {sourceBadge === 'EXISTING' && (
                                                    <Badge className="bg-blue-500/90 text-[9px] px-1.5 h-4 border-none backdrop-blur-sm shadow-md">
                                                        EXISTING
                                                    </Badge>
                                                )}
                                                {isSelected && (
                                                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg border-2 border-background animate-in zoom-in-50 duration-200">
                                                        <Check className="h-3 w-3 text-primary-foreground" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>

                        {/* URL Ingestion Floating Panel */}
                        <div className="p-6 bg-gradient-to-t from-background/90 to-transparent absolute bottom-0 inset-x-0 pointer-events-none">
                            <div className="bg-background/80 backdrop-blur-xl p-4 rounded-2xl border shadow-2xl pointer-events-auto ring-1 ring-border/50">
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 relative">
                                        <Input
                                            placeholder="Paste high-res image URL here..."
                                            className="h-10 pl-4 border-none bg-muted/40 text-sm focus-visible:ring-1 ring-primary/20"
                                            value={newImageUrl}
                                            onChange={(e) => setNewImageUrl(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddImageUrl()}
                                        />
                                    </div>
                                    <Button onClick={handleAddImageUrl} className="h-10 px-5 gap-2 font-bold shadow-md shadow-primary/10">
                                        <ImagePlus className="h-4 w-4" />
                                        Ingest
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Variant Table (Interactive Control) */}
                    <div className="w-1/2 flex flex-col bg-background/40">
                        <div className="p-4 border-b flex items-center justify-between bg-background/60 backdrop-blur-md sticky top-0 z-10 h-[57px]">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="select-all-vars"
                                        className="h-4 w-4 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                        onCheckedChange={(checked) => selectAllVariants(!!checked)}
                                        checked={localVariants.length > 0 && selectedVariantSkus.size === localVariants.length}
                                    />
                                    <Label htmlFor="select-all-vars" className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
                                        Selection ({selectedVariantSkus.size})
                                    </Label>
                                </div>
                                {selectedVariantSkus.size > 0 && (
                                    <Badge variant="secondary" className="text-[10px] animate-pulse bg-primary/10 text-primary border-primary/20">
                                        Awaiting Image
                                    </Badge>
                                )}
                            </div>

                            <div className="flex gap-1">
                                {[...availableOptions.entries()].slice(0, 2).map(([name, values]) => (
                                    <DropdownMenu key={name}>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-8 py-0 px-2 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground">
                                                {name} <ChevronDown className="ml-1 h-3 w-3" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48 p-1">
                                            {Array.from(values).map(val => (
                                                <DropdownMenuItem key={val} className="text-xs" onClick={() => selectByOption(name, val)}>
                                                    Select all &quot;{val}&quot;
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ))}
                            </div>
                        </div>

                        <ScrollArea className="flex-1 h-[calc(100vh-200px)]">
                            <Table>
                                <TableHeader className="bg-muted/30 sticky top-0 z-10 backdrop-blur-sm">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="w-[48px]"></TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 h-10">Identity</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 h-10">Attributes</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 h-10 text-right pr-4">Assignment</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {localVariants.map((variant) => {
                                        const isSelected = selectedVariantSkus.has(variant.sku);
                                        const isFocused = focusedVariantSku === variant.sku;

                                        return (
                                            <TableRow
                                                key={variant.sku}
                                                className={cn(
                                                    "group transition-colors border-border/40",
                                                    isSelected && "bg-primary/[0.03] hover:bg-primary/[0.05]",
                                                    isFocused && "bg-primary/[0.08] ring-1 ring-inset ring-primary/20"
                                                )}
                                                onClick={() => toggleVariantSelection(variant.sku)}
                                            >
                                                <TableCell className="pl-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                    <Checkbox
                                                        className="h-4 w-4 rounded-sm"
                                                        checked={isSelected}
                                                        onCheckedChange={() => toggleVariantSelection(variant.sku)}
                                                    />
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-sm font-semibold tracking-tight">{variant.sku}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <Button
                                                                variant={isFocused ? "default" : "secondary"}
                                                                size="sm"
                                                                className={cn(
                                                                    "h-5 px-1.5 text-[9px] font-bold uppercase tracking-tighter transition-all",
                                                                    !isFocused && "opacity-0 group-hover:opacity-100 bg-muted/40 hover:bg-muted/80"
                                                                )}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setFocusedVariantSku(isFocused ? null : variant.sku);
                                                                }}
                                                            >
                                                                {isFocused ? <MousePointer2 className="h-2 w-2 mr-1" /> : <Zap className="h-2 w-2 mr-1" />}
                                                                {isFocused ? "Active" : "Assign"}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {[variant.option1Value, variant.option2Value, variant.option3Value].filter(Boolean).map((val, idx) => (
                                                            <Badge key={idx} variant="outline" className="text-[9px] px-1 h-3.5 border-border/50 text-muted-foreground bg-muted/10 font-medium">
                                                                {val}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-3 pr-4 text-right">
                                                    <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                                                        <Select
                                                            key={`${variant.sku}-${revision}-${variant.mediaUrl || 'none'}`}
                                                            value={variant.mediaUrl || 'none'}
                                                            onValueChange={(val) => handleAssignImage(variant.sku, val === 'none' ? null : val)}
                                                        >
                                                            <SelectTrigger className={cn(
                                                                "h-8 w-[140px] text-xs font-medium bg-background border-border/60 transition-all",
                                                                variant.mediaUrl ? "border-primary/40 ring-1 ring-primary/10 shadow-sm" : "text-muted-foreground/60"
                                                            )}>
                                                                <SelectValue placeholder="No Assignment" />
                                                            </SelectTrigger>
                                                            <SelectContent align="end">
                                                                <SelectItem value="none" className="text-xs">Unassigned</SelectItem>
                                                                {imageUrls.map((url, idx) => (
                                                                    <SelectItem key={url} value={url} className="text-xs">
                                                                        <div className="flex items-center gap-2">
                                                                            <Image src={url} alt="" width={16} height={16} className="rounded-sm object-cover" />
                                                                            <span>Image {idx + 1}</span>
                                                                            {existingProductUrls.has(url) && <Badge className="bg-blue-500/80 text-[7px] px-1 h-3 border-none ml-0.5">EXISTING</Badge>}
                                                                        </div>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {variant.mediaUrl && (
                                                            <div className="flex items-center gap-1.5 animate-in slide-in-from-right-1 duration-300">
                                                                <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-tighter">Verified</span>
                                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-sm shadow-green-500/50" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </ScrollArea>

                        {/* Table Footer / Summary Bar */}
                        <div className="p-4 border-t bg-muted/5 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Efficiency</span>
                                    <span className="text-sm font-bold">{Math.round((assignedUrls.size / imageUrls.length) * 100 || 0)}% Coverage</span>
                                </div>
                                <Separator orientation="vertical" className="h-8" />
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Unassigned</span>
                                    <span className="text-sm font-bold text-orange-500">{localVariants.filter(v => !v.mediaUrl).length} Variants</span>
                                </div>
                                <Separator orientation="vertical" className="h-8" />
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sources</span>
                                    <span className="text-sm font-bold text-blue-500">{existingProductUrls.size} Existing</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Info className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-medium italic">Existing images from Shopify product are available for assignment.</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Merge Dialog - Revamped */}
                <Dialog open={isMergingDialogOpen} onOpenChange={setIsMergingDialogOpen}>
                    <DialogContent className="max-w-xl p-0 overflow-hidden rounded-3xl border-muted/50 shadow-2xl">
                        <div className="p-8 space-y-8">
                            <DialogHeader className="space-y-2 text-left">
                                <DialogTitle className="text-2xl font-bold tracking-tight">Image Harmonization</DialogTitle>
                                <DialogDescription className="text-sm leading-relaxed">
                                    Consolidate your media assets by merging a duplicate into a master image.
                                    All variant links will be instantly swapped.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="flex items-center justify-between gap-6 p-6 rounded-2xl bg-muted/30 border border-muted ring-1 ring-inset ring-white/5 shadow-inner">
                                <div className="flex flex-col items-center gap-3 flex-1">
                                    <span className="text-[10px] font-bold text-destructive uppercase tracking-widest px-2 py-0.5 rounded bg-destructive/10 ring-1 ring-destructive/20">Removal Target</span>
                                    <div className="relative h-28 w-28 rounded-xl overflow-hidden ring-4 ring-destructive/10 shadow-xl">
                                        {mergingImageUrl && <Image src={mergingImageUrl} alt="Duplicate" fill className="object-cover grayscale" />}
                                    </div>
                                    <span className="text-[10px] font-medium text-muted-foreground truncate w-24 text-center">Duplicate URL</span>
                                </div>

                                <div className="h-12 w-12 rounded-full bg-background border shadow-md flex items-center justify-center relative z-10 animate-pulse">
                                    <ArrowRightLeft className="h-5 w-5 text-primary" />
                                </div>

                                <div className="flex flex-col items-center gap-3 flex-1">
                                    <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest px-2 py-0.5 rounded bg-green-500/10 ring-1 ring-green-500/20">Primary Anchor</span>
                                    <div className={cn(
                                        "relative h-28 w-28 rounded-xl overflow-hidden transition-all duration-500",
                                        masterImageUrl ? "ring-4 ring-green-500/20 shadow-2xl scale-110" : "bg-muted/50 border-2 border-dashed border-muted-foreground/30 flex items-center justify-center"
                                    )}>
                                        {masterImageUrl ? (
                                            <Image src={masterImageUrl} alt="Master" fill className="object-cover" />
                                        ) : (
                                            <div className="text-2xl font-bold text-muted-foreground/20">?</div>
                                        )}
                                    </div>
                                    <span className="text-[10px] font-medium text-muted-foreground truncate w-24 text-center">Master URL</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-xs font-bold text-muted-foreground tracking-widest uppercase ml-1">Select the Master Reference</Label>
                                <Select value={masterImageUrl} onValueChange={setMasterImageUrl}>
                                    <SelectTrigger className="h-12 text-base font-medium bg-background border-none ring-1 ring-border/60 shadow-lg shadow-black/5">
                                        <SelectValue placeholder="Search target master image..." />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-64">
                                        {imageUrls.filter(u => u !== mergingImageUrl).map((url, idx) => (
                                            <SelectItem key={url} value={url} className="py-2.5">
                                                <div className="flex items-center gap-4">
                                                    <Image src={url} alt="" width={32} height={32} className="rounded-lg object-cover ring-1 ring-primary/10" />
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold">Image Reference {idx + 1}</span>
                                                        <span className="text-[10px] text-muted-foreground font-mono truncate w-64">{url}</span>
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-4 pt-4 border-t">
                                <Button variant="ghost" onClick={() => { setIsMergingDialogOpen(false); setMergingImageUrl(null); setMasterImageUrl(''); }} className="flex-1 h-12 text-sm font-semibold rounded-xl">
                                    Cancel
                                </Button>
                                <Button onClick={handleMergeImages} disabled={!masterImageUrl} className="flex-1 h-12 text-sm font-bold rounded-xl shadow-xl shadow-primary/20 gap-2">
                                    <Blocks className="h-4 w-4" />
                                    Harmonize Media
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </TooltipProvider>
    );
}
