'use client';

import { useState, useEffect, useTransition, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
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
  Blocks,
  AlertTriangle,
  Link,
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
import {
  getProductWithImages,
  addImageFromUrl,
  assignImageToVariant,
  deleteImage,
} from '@/app/actions';
import { Product, ShopifyProductImage } from '@/lib/types';
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
import { VariantRow } from './media-manager-variant-row';

interface MediaManagerProps {
  productId: string;
  onImageCountChange: (newCount: number) => void;
  isMissingVariantMode?: boolean;
  missingVariants?: Product[];
  onSaveMissingVariant?: (updatedVariant: Product[]) => void;
}

export function MediaManager({
  productId,
  onImageCountChange,
  isMissingVariantMode = false,
  missingVariants = [],
  onSaveMissingVariant,
}: MediaManagerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<Partial<Product>[]>([]);
  const [images, setImages] = useState<ShopifyProductImage[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [isSubmitting, startSubmitting] = useTransition();
  const { toast } = useToast();
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(new Set());
  const [localMissingVariants, setLocalMissingVariants] = useState<Product[]>(() =>
    JSON.parse(JSON.stringify(missingVariants))
  );

  // State for bulk assign dialog
  const [bulkAssignImageId, setBulkAssignImageId] = useState<string>('');
  const [bulkAssignOption, setBulkAssignOption] = useState<string>('');
  const [bulkAssignValue, setBulkAssignValue] = useState<string>('');
  const [isBulkAssignDialogOpen, setIsBulkAssignDialogOpen] = useState(false);

  // State for merging images
  const [mergingImageId, setMergingImageId] = useState<number | null>(null);
  const [isMergingDialogOpen, setIsMergingDialogOpen] = useState(false);
  const [masterImageId, setMasterImageId] = useState<string>('');

  // State for focused variant (for gallery picking)
  const [focusedVariantSku, setFocusedVariantSku] = useState<string | null>(null);

  // Revision counter to force re-renders when assignments change externally
  const [revision, setRevision] = useState(0);

  // Multi-select for variants
  const [selectedVariantSkus, setSelectedVariantSkus] = useState<Set<string>>(new Set());

  // Search/Filter for gallery
  const [gallerySearch, setGallerySearch] = useState('');

  const variantsRef = useRef(variants);
  useEffect(() => {
    variantsRef.current = variants;
  }, [variants]);

  const fetchMediaData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSelectedImageIds(new Set());
    try {
      const data = await getProductWithImages(productId);
      setVariants(data.variants);
      setImages(data.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media data.');
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchMediaData();
  }, [fetchMediaData]);

  const handleImageSelection = useCallback((imageId: number, checked: boolean) => {
    setSelectedImageIds((prev) => {
      const newSet = new Set(prev);
      if (checked) newSet.add(imageId);
      else newSet.delete(imageId);
      return newSet;
    });
  }, []);

  // Extract unique media URLs from missing variants to show in gallery
  const ftpImages = useMemo<ShopifyProductImage[]>(() => {
    if (!isMissingVariantMode || missingVariants.length === 0) return [];
    const uniqueUrls = Array.from(new Set(missingVariants.map((v) => v.mediaUrl).filter(Boolean) as string[]));
    return uniqueUrls.map((url, index) => ({
      id: -(index + 1),
      product_id: parseInt(productId.split('/').pop() || '0', 10),
      src: url,
      variant_ids: missingVariants.filter((v) => v.mediaUrl === url).map((v) => parseInt(v.variantId.split('/').pop() || '0', 10)).filter((id) => !isNaN(id)),
      isFtpSource: true,
    }));
  }, [isMissingVariantMode, missingVariants, productId]);

  const allImages = useMemo(() => [...images, ...ftpImages], [images, ftpImages]);
  const unlinkedImages = useMemo(() => allImages.filter((img) => !img.variant_ids || img.variant_ids.length === 0), [allImages]);

  const handleSelectAllUnlinked = (checked: boolean) => {
    if (checked) setSelectedImageIds(new Set(unlinkedImages.map((img) => img.id)));
    else {
      const newSet = new Set(selectedImageIds);
      unlinkedImages.forEach((img) => newSet.delete(img.id));
      setSelectedImageIds(newSet);
    }
  };

  const handleAddImage = () => {
    if (!newImageUrl) {
      toast({ title: 'URL Required', description: 'Please enter an image URL.', variant: 'destructive' });
      return;
    }
    startSubmitting(async () => {
      const result = await addImageFromUrl(productId, newImageUrl);
      if (result.success && result.image) {
        const newImages = [...images, result.image];
        setImages(newImages);
        onImageCountChange(newImages.length);
        setNewImageUrl('');
        toast({ title: 'Success!', description: 'Image has been added.' });
      } else {
        toast({ title: 'Error', description: result.message, variant: 'destructive' });
      }
    });
  };

  const handleAssignImage = useCallback(
    (variantId: string, imageId: number | null) => {
      const previousVariant = variantsRef.current.find((v) => v.variantId === variantId);
      const previousImageId = previousVariant?.imageId ?? null;
      setVariants((prev) => prev.map((v) => (v.variantId === variantId ? { ...v, imageId: imageId } : v)));
      startSubmitting(async () => {
        const result = await assignImageToVariant(variantId, imageId!);
        if (result.success) {
          toast({ title: 'Success!', description: 'Image assigned to variant.' });
          setRevision((r) => r + 1);
          fetchMediaData();
        } else {
          setVariants((prev) => prev.map((v) => (v.variantId === variantId ? { ...v, imageId: previousImageId } : v)));
          toast({ title: 'Error', description: result.message, variant: 'destructive' });
        }
      });
    },
    [fetchMediaData, toast]
  );

  const handleAssignImageToMissingVariant = useCallback(
    (sku: string, imageId: number | null) => {
      setLocalMissingVariants((prev) =>
        prev.map((v) => {
          if (v.sku === sku) {
            if (imageId !== null && imageId < 0) {
              const ftpImg = ftpImages.find((img) => img.id === imageId);
              return { ...v, imageId: null, mediaUrl: ftpImg?.src ?? v.mediaUrl };
            }
            return { ...v, imageId, mediaUrl: null };
          }
          return v;
        })
      );
    },
    [ftpImages]
  );

  const handleAssignToAll = useCallback((imageId: number) => {
    if (isMissingVariantMode) {
      setLocalMissingVariants((prev) =>
        prev.map((v) => {
          if (imageId < 0) {
            const ftpImg = ftpImages.find((img) => img.id === imageId);
            return { ...v, imageId: null, mediaUrl: ftpImg?.src ?? v.mediaUrl };
          }
          return { ...v, imageId, mediaUrl: null };
        })
      );
    } else {
      setVariants((prev) => prev.map((v) => ({ ...v, imageId })));
      startSubmitting(async () => {
        const variantsToUpdate = variantsRef.current;
        const results = await Promise.all(variantsToUpdate.map((v) => assignImageToVariant(v.variantId!, imageId)));
        const failedCount = results.filter((r) => !r.success).length;
        if (failedCount > 0) {
          fetchMediaData();
          toast({ title: 'Bulk Assign Failed', description: `Could not assign to ${failedCount} variants.`, variant: 'destructive' });
        } else {
          toast({ title: 'Assigned to All', description: `Image assigned to all ${variantsToUpdate.length} variants.` });
          fetchMediaData();
        }
      });
    }
    setRevision((r) => r + 1);
  }, [isMissingVariantMode, ftpImages, fetchMediaData, toast]);

  const handleAssignToSelection = useCallback((imageId: number) => {
    if (selectedVariantSkus.size === 0) return;
    if (isMissingVariantMode) {
      setLocalMissingVariants((prev) =>
        prev.map((v) => {
          if (selectedVariantSkus.has(v.sku)) {
            if (imageId < 0) {
              const ftpImg = ftpImages.find((img) => img.id === imageId);
              return { ...v, imageId: null, mediaUrl: ftpImg?.src ?? v.mediaUrl };
            }
            return { ...v, imageId, mediaUrl: null };
          }
          return v;
        })
      );
    } else {
      const variantsToUpdate = variants.filter(v => selectedVariantSkus.has(v.sku!));
      setVariants((prev) => prev.map((v) => (selectedVariantSkus.has(v.sku!) ? { ...v, imageId } : v)));
      startSubmitting(async () => {
        const results = await Promise.all(variantsToUpdate.map((v) => assignImageToVariant(v.variantId!, imageId)));
        const failedCount = results.filter((r) => !r.success).length;
        if (failedCount > 0) {
          fetchMediaData();
          toast({ title: 'Bulk Assign Failed', description: `Could not assign to ${failedCount} variants.`, variant: 'destructive' });
        } else {
          toast({ title: 'Success!', description: `Assigned to ${selectedVariantSkus.size} selected variants.` });
          fetchMediaData();
        }
      });
    }
    setRevision((r) => r + 1);
  }, [isMissingVariantMode, selectedVariantSkus, variants, ftpImages, fetchMediaData, toast]);

  const toggleVariantSelection = (sku: string) => {
    setSelectedVariantSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const selectAllVariants = (checked: boolean) => {
    const dataSource = isMissingVariantMode ? localMissingVariants : variants;
    if (checked) setSelectedVariantSkus(new Set(dataSource.map((v) => v.sku!)));
    else setSelectedVariantSkus(new Set());
  };

  const selectByOption = (optionName: string, value: string) => {
    const dataSource = isMissingVariantMode ? localMissingVariants : variants;
    const firstWithOpts = dataSource.find(v => v.option1Name === optionName || v.option2Name === optionName || v.option3Name === optionName);
    let optionKey: keyof Product | null = null;
    if (firstWithOpts?.option1Name === optionName) optionKey = 'option1Value';
    else if (firstWithOpts?.option2Name === optionName) optionKey = 'option2Value';
    else if (firstWithOpts?.option3Name === optionName) optionKey = 'option3Value';
    if (!optionKey) return;
    const matchingSkus = dataSource.filter((v) => (v as any)[optionKey!] === value).map((v) => v.sku!);
    setSelectedVariantSkus((prev) => {
      const next = new Set(prev);
      matchingSkus.forEach((sku) => next.add(sku));
      return next;
    });
    toast({ title: 'Selection Updated', description: `Selected ${matchingSkus.length} variants with ${optionName}: ${value}` });
  };

  const handleMergeImages = useCallback(() => {
    if (mergingImageId === null || !masterImageId) return;
    const masterId = parseInt(masterImageId);
    const variantsToUpdate = variants.filter(v => v.imageId === mergingImageId);
    startSubmitting(async () => {
      const results = await Promise.all(variantsToUpdate.map((v) => assignImageToVariant(v.variantId!, masterId)));
      const failedCount = results.filter((r) => !r.success).length;
      if (failedCount > 0) toast({ title: 'Merge Partially Failed', description: `Could not update ${failedCount} variants.`, variant: 'destructive' });
      else {
        await deleteImage(productId, mergingImageId);
        toast({ title: 'Images Merged', description: 'Duplicate replaced and removed.' });
      }
      fetchMediaData();
      setIsMergingDialogOpen(false);
      setMergingImageId(null);
      setMasterImageId('');
    });
  }, [mergingImageId, masterImageId, variants, productId, fetchMediaData, toast]);

  const handleDeleteImage = useCallback((imageId: number) => {
    if (imageId < 0) {
      toast({ title: 'Not Deletable', description: 'FTP images cannot be deleted from here.', variant: 'destructive' });
      return;
    }
    const imageToDelete = images.find((img) => img.id === imageId);
    if (imageToDelete && imageToDelete.variant_ids.length > 0) {
      toast({ title: 'Cannot Delete', description: 'Image is assigned to variants. Unassign first.', variant: 'destructive' });
      return;
    }
    startSubmitting(async () => {
      const result = await deleteImage(productId, imageId);
      if (result.success) {
        toast({ title: 'Success!', description: 'Image has been deleted.' });
        fetchMediaData();
      } else toast({ title: 'Error', description: result.message, variant: 'destructive' });
    });
  }, [images, productId, fetchMediaData, toast]);

  const handleBulkDelete = () => {
    const assignedImages = Array.from(selectedImageIds).filter((id) => {
      const image = images.find((img) => img.id === id);
      return image && image.variant_ids.length > 0;
    });
    if (assignedImages.length > 0) {
      toast({ title: 'Cannot Delete', description: `Some selected images are assigned.`, variant: 'destructive' });
      return;
    }
    startSubmitting(async () => {
      const idsToDelete = Array.from(selectedImageIds);
      let successIds: number[] = [];
      for (const id of idsToDelete) {
        const res = await deleteImage(productId, id);
        if (res.success) successIds.push(id);
        await new Promise((r) => setTimeout(r, 600));
      }
      if (successIds.length < idsToDelete.length) toast({ title: 'Partial Failure', description: `Some deletions failed.`, variant: 'destructive' });
      else toast({ title: 'Success!', description: `${successIds.length} images deleted.` });
      fetchMediaData();
    });
  };

  const assignmentCounts = useMemo(() => {
    const counts = new Map<number, number>();
    const dataSource = isMissingVariantMode ? localMissingVariants : (variants as Product[]);
    dataSource.forEach((v) => { if (v.imageId) counts.set(v.imageId, (counts.get(v.imageId) || 0) + 1); });
    return counts;
  }, [localMissingVariants, variants, isMissingVariantMode]);

  const availableOptions = useMemo(() => {
    const optionsSource = isMissingVariantMode ? localMissingVariants : (variants as Product[]);
    const options = new Map<string, Set<string>>();
    if (optionsSource.length === 0) return options;
    const first = optionsSource.find(v => v.option1Name || v.option2Name || v.option3Name);
    const names = { opt1: first?.option1Name || 'Option 1', opt2: first?.option2Name || 'Option 2', opt3: first?.option3Name || 'Option 3' };
    optionsSource.forEach(v => {
      if (v.option1Value) { if (!options.has(names.opt1)) options.set(names.opt1, new Set()); options.get(names.opt1)!.add(v.option1Value); }
      if (v.option2Value) { if (!options.has(names.opt2)) options.set(names.opt2, new Set()); options.get(names.opt2)!.add(v.option2Value); }
      if (v.option3Value) { if (!options.has(names.opt3)) options.set(names.opt3, new Set()); options.get(names.opt3)!.add(v.option3Value); }
    });
    return options;
  }, [variants, localMissingVariants, isMissingVariantMode]);

  const handleBulkAssign = () => {
    const imageId = parseInt(bulkAssignImageId);
    if (!imageId || !bulkAssignOption) return;
    if (isMissingVariantMode) {
      setLocalMissingVariants(prev => prev.map(v => {
        let match = false;
        if (bulkAssignOption === 'All Variants') match = true;
        else {
          const first = localMissingVariants.find(vm => vm.option1Name === bulkAssignOption || vm.option2Name === bulkAssignOption || vm.option3Name === bulkAssignOption);
          if (first?.option1Name === bulkAssignOption && v.option1Value === bulkAssignValue) match = true;
          else if (first?.option2Name === bulkAssignOption && v.option2Value === bulkAssignValue) match = true;
          else if (first?.option3Name === bulkAssignOption && v.option3Value === bulkAssignValue) match = true;
        }
        if (match) {
          if (imageId < 0) { const ftpImg = ftpImages.find(img => img.id === imageId); return { ...v, imageId: null, mediaUrl: ftpImg?.src ?? v.mediaUrl }; }
          return { ...v, imageId, mediaUrl: null };
        }
        return v;
      }));
    } else {
      const targets = variants.filter(v => {
        if (bulkAssignOption === 'All Variants') return true;
        const first = variants.find(vm => vm.option1Name === bulkAssignOption || vm.option2Name === bulkAssignOption || vm.option3Name === bulkAssignOption);
        if (first?.option1Name === bulkAssignOption) return v.option1Value === bulkAssignValue;
        if (first?.option2Name === bulkAssignOption) return v.option2Value === bulkAssignValue;
        if (first?.option3Name === bulkAssignOption) return v.option3Value === bulkAssignValue;
        return false;
      });
      startSubmitting(async () => {
        const res = await Promise.all(targets.map(v => assignImageToVariant(v.variantId!, imageId)));
        if (res.filter(r => !r.success).length > 0) toast({ title: 'Partial Failure', variant: 'destructive' });
        else toast({ title: 'Success', description: `Assigned to ${targets.length} variants.` });
        fetchMediaData();
      });
    }
    setIsBulkAssignDialogOpen(false);
  };

  const areAllUnlinkedSelected = useMemo(() => {
    if (unlinkedImages.length === 0) return false;
    return unlinkedImages.every((img) => selectedImageIds.has(img.id));
  }, [unlinkedImages, selectedImageIds]);

  if (isLoading && images.length === 0) {
    return (
      <div className="flex h-[80vh] items-center justify-center bg-background/50 backdrop-blur-xl -m-6 rounded-lg">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">Synchronizing Shopify assets...</p>
        </div>
      </div>
    );
  }

  const handleSaveData = () => { if (isMissingVariantMode && onSaveMissingVariant) onSaveMissingVariant(localMissingVariants); };
  const productTitle = isMissingVariantMode ? (missingVariants[0]?.name || 'New Product') : (variants[0]?.name || 'Product Media');

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[85vh] -m-6 bg-background/50 backdrop-blur-xl overflow-hidden rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <div>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-xl font-bold tracking-tight">{productTitle}</DialogTitle>
              <Badge variant="outline" className="text-[10px] font-bold uppercase bg-primary/5 text-primary">Media Manager</Badge>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">{isMissingVariantMode ? 'Assign media to missing variants.' : 'Manage Shopify product media.'}</DialogDescription>
          </div>
          <div className="flex items-center gap-3">
            <DialogClose asChild><Button variant="ghost" size="sm">Discard</Button></DialogClose>
            {isMissingVariantMode && <Button onClick={handleSaveData} size="sm">Save Changes</Button>}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Gallery */}
          <div className="w-1/2 border-r flex flex-col bg-muted/5">
            <div className="p-4 border-b flex items-center justify-between bg-background/40 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search..." className="pl-9 h-9" value={gallerySearch} onChange={e => setGallerySearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={areAllUnlinkedSelected} onCheckedChange={checked => handleSelectAllUnlinked(!!checked)} disabled={unlinkedImages.length === 0} />
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Unlinked</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedImageIds.size > 0 && (
                  <Button variant="destructive" size="sm" onClick={handleBulkDelete}>Delete ({selectedImageIds.size})</Button>
                )}
                <Dialog open={isBulkAssignDialogOpen} onOpenChange={setIsBulkAssignDialogOpen}>
                  <DialogTrigger asChild><Button variant="outline" size="sm" className="h-8 gap-1"><Zap className="h-3 w-3" /> Bulk</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Bulk Assignment Tool</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase">1. Select Source Image</Label>
                        <Select value={bulkAssignImageId} onValueChange={setBulkAssignImageId}>
                          <SelectTrigger><SelectValue placeholder="Pick image..." /></SelectTrigger>
                          <SelectContent>
                            {allImages.map(img => (
                              <SelectItem key={img.id} value={img.id.toString()}>
                                <div className="flex items-center gap-2">
                                  <Image src={img.src} alt="" width={24} height={24} className="rounded" />
                                  <span>#{img.id} {img.isFtpSource ? '(FTP)' : ''}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase">2. Target Logic</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={bulkAssignOption} onValueChange={v => { setBulkAssignOption(v); setBulkAssignValue(''); }}>
                            <SelectTrigger><SelectValue placeholder="Group by..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="All Variants">All Variants</SelectItem>
                              {[...availableOptions.keys()].map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {bulkAssignOption && bulkAssignOption !== 'All Variants' && (
                            <Select value={bulkAssignValue} onValueChange={setBulkAssignValue}>
                              <SelectTrigger><SelectValue placeholder="Match..." /></SelectTrigger>
                              <SelectContent>
                                {[...availableOptions.get(bulkAssignOption)!].map(val => <SelectItem key={val as string} value={val as string}>{val as string}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    </div>
                    <DialogFooter><Button onClick={handleBulkAssign} disabled={!bulkAssignImageId}>Apply</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <ScrollArea className="flex-1 p-6">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {allImages.filter(img => !gallerySearch || img.src.toLowerCase().includes(gallerySearch) || img.id.toString().includes(gallerySearch)).map(image => {
                  const isSelected = selectedImageIds.has(image.id);
                  const count = assignmentCounts.get(image.id) || 0;
                  return (
                    <div key={image.id} className={cn("group relative aspect-square rounded-xl border-2 overflow-hidden transition-all", isSelected ? "border-primary scale-[0.98]" : "border-border/60")}>
                      <Image src={image.src} alt="" fill className="object-cover" />
                      <div className="absolute top-2 left-2"><Checkbox checked={isSelected} onCheckedChange={c => handleImageSelection(image.id, !!c)} /></div>
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" className="w-full h-7 text-[10px]" onClick={() => selectedVariantSkus.size > 0 ? handleAssignToSelection(image.id) : handleAssignToAll(image.id)}>Assign</Button>
                      </div>
                      <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                        {count > 0 && <Badge className="bg-green-500 text-[10px] h-4">{count} USED</Badge>}
                        {image.isFtpSource && <Badge className="bg-blue-500 text-[10px] h-4">FTP</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="p-4 bg-background/80 border-t flex gap-2">
              <Input placeholder="Image URL..." value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} className="h-9" />
              <Button size="sm" onClick={handleAddImage} disabled={isSubmitting}><ImagePlus className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Variants */}
          <div className="w-1/2 flex flex-col bg-background/20">
            <div className="p-4 border-b flex items-center justify-between h-[57px]">
              <div className="flex items-center gap-2">
                <Checkbox checked={selectedVariantSkus.size === (isMissingVariantMode ? localMissingVariants : variants).length} onCheckedChange={c => selectAllVariants(!!c)} />
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Select ({selectedVariantSkus.size})</span>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <Table>
                <TableHeader><TableRow><TableHead className="w-12"></TableHead><TableHead className="text-[10px] uppercase">Identity</TableHead><TableHead className="text-[10px] uppercase">Assignment</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(isMissingVariantMode ? localMissingVariants : (variants as Product[])).map(variant => {
                    const sku = variant.sku || variant.variantId || 'unknown';
                    const isSelected = selectedVariantSkus.has(sku);
                    return (
                      <TableRow key={sku} className={cn(isSelected && "bg-primary/5")} onClick={() => toggleVariantSelection(sku)}>
                        <TableCell className="w-12"><Checkbox checked={isSelected} onCheckedChange={() => toggleVariantSelection(sku)} /></TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">{sku}</span>
                            <span className="text-[10px] text-muted-foreground">{[variant.option1Value, variant.option2Value, variant.option3Value].filter(Boolean).join(' / ')}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <VariantRow variant={variant} images={allImages} isSubmitting={isSubmitting} onAssign={isMissingVariantMode ? handleAssignImageToMissingVariant : handleAssignImage} idType={isMissingVariantMode ? 'sku' : 'variantId'} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </div>
        {/* Merge Dialog */}
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

              <div className="flex items-center justify-between gap-6 p-6 rounded-2xl bg-muted/30 border border-muted shadow-inner">
                <div className="flex flex-col items-center gap-3 flex-1">
                  <span className="text-[10px] font-bold text-destructive uppercase tracking-widest px-2 py-0.5 rounded bg-destructive/10 ring-1 ring-destructive/20">Removal Target</span>
                  <div className="relative h-28 w-28 rounded-xl overflow-hidden ring-4 ring-destructive/10 shadow-xl">
                    {mergingImageId && images.find(img => img.id === mergingImageId) && (
                      <Image src={images.find(img => img.id === mergingImageId)!.src} alt="Duplicate" fill className="object-cover grayscale" />
                    )}
                  </div>
                </div>

                <div className="h-12 w-12 rounded-full bg-background border shadow-md flex items-center justify-center animate-pulse">
                  <ArrowRightLeft className="h-5 w-5 text-primary" />
                </div>

                <div className="flex flex-col items-center gap-3 flex-1">
                  <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest px-2 py-0.5 rounded bg-green-500/10 ring-1 ring-green-500/20">Primary Anchor</span>
                  <div className={cn(
                    "relative h-28 w-28 rounded-xl overflow-hidden transition-all duration-500",
                    masterImageId ? "ring-4 ring-green-500/20 shadow-2xl scale-110" : "bg-muted/50 border-2 border-dashed border-muted-foreground/30 flex items-center justify-center"
                  )}>
                    {masterImageId ? (
                      <Image src={images.find(img => img.id.toString() === masterImageId)?.src || ''} alt="Master" fill className="object-cover" />
                    ) : (
                      <div className="text-2xl font-bold text-muted-foreground/20">?</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold text-muted-foreground tracking-widest uppercase ml-1">Select the Master Reference</Label>
                <Select value={masterImageId} onValueChange={setMasterImageId}>
                  <SelectTrigger className="h-12 text-base font-medium bg-background border-none ring-1 ring-border/60 shadow-lg shadow-black/5">
                    <SelectValue placeholder="Search target master image..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {allImages.filter(img => img.id !== mergingImageId).map(img => (
                      <SelectItem key={img.id} value={img.id.toString()} className="py-2.5">
                        <div className="flex items-center gap-4">
                          <Image src={img.src} alt="" width={32} height={32} className="rounded-lg object-cover ring-1 ring-primary/10" />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold">Image Reference #{img.id}</span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate w-64">{img.src}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t">
                <Button variant="ghost" onClick={() => { setIsMergingDialogOpen(false); setMergingImageId(null); setMasterImageId(''); }} className="flex-1 h-12 text-sm font-semibold rounded-xl">
                  Cancel
                </Button>
                <Button onClick={handleMergeImages} disabled={!masterImageId} className="flex-1 h-12 text-sm font-bold rounded-xl shadow-xl shadow-primary/20 gap-2">
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
