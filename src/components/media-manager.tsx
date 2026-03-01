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
  Loader2,
  ArrowRight, Save, Plus, AlertCircle, Grid, List as ListIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useProductMedia,
  useAssignImageMutation,
  useAddImageMutation,
  useDeleteImageMutation,
} from '@/hooks/use-media-manager';
import { useVirtualizer } from '@tanstack/react-virtual';
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
import { MediaManagerImageCard } from './media-manager-image-card';

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
  const { data: mediaData, isLoading, error } = useProductMedia(productId);
  const assignMutation = useAssignImageMutation(productId);
  const addImageMutation = useAddImageMutation(productId);
  const deleteImageMutation = useDeleteImageMutation(productId);

  const [newImageUrl, setNewImageUrl] = useState('');
  const { toast } = useToast();
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [localMissingVariants, setLocalMissingVariants] = useState<Record<string, Product>>(() => {
    const dict: Record<string, Product> = {};
    missingVariants.forEach(v => {
      if (v.sku) dict[v.sku] = JSON.parse(JSON.stringify(v));
    });
    return dict;
  });

  // Use data from React Query or local missing variants
  const variants = mediaData?.variants || [];
  const variantsById = useMemo(() => {
    const dict: Record<string, Product> = {};
    variants.forEach(v => {
      if (v.variantId) dict[v.variantId] = v;
    });
    return dict;
  }, [variants]);

  const variantsBySku = useMemo(() => {
    const dict: Record<string, Product> = {};
    variants.forEach(v => {
      if (v.sku) dict[v.sku] = v;
    });
    return dict;
  }, [variants]);

  const images = mediaData?.images || [];

  // State for bulk assign dialog
  const [bulkAssignImageId, setBulkAssignImageId] = useState<string>('');
  const [bulkAssignOption, setBulkAssignOption] = useState<string>('');
  const [bulkAssignValue, setBulkAssignValue] = useState<string>('');
  const [isBulkAssignDialogOpen, setIsBulkAssignDialogOpen] = useState(false);

  // State for merging images
  const [mergingImageId, setMergingImageId] = useState<string | null>(null);
  const [isMergingDialogOpen, setIsMergingDialogOpen] = useState(false);
  const [masterImageId, setMasterImageId] = useState<string>('');

  // State for focused variant (for gallery picking)
  const [focusedVariantSku, setFocusedVariantSku] = useState<string | null>(null);

  // Multi-select for variants
  const [selectedVariantSkus, setSelectedVariantSkus] = useState<Set<string>>(new Set());

  // Search/Filter for gallery
  const [gallerySearch, setGallerySearch] = useState('');

  // Tracking granular loading states (e.g., "deleting-image-123", "assigning-variant-abc")
  // Note: Mutations now handle these, but we can keep pendingActions for simulations/uploads
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  const addPending = (id: string) => setPendingActions(prev => new Set(prev).add(id));
  const removePending = (id: string) => setPendingActions(prev => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });

  const handleUploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    for (const file of fileArray) {
      const actionId = `uploading-${file.name}`;
      addPending(actionId);

      // Since we only have addImageFromUrl, we'd typically upload to a bucket first
      // or use a multipart action. Assuming the backend supports it or we use a temporary URL.
      // For this refactor, I'll implement the UI logic and assume a future-proofed action
      // Or I can add a simple console log/toast if the backend part is out of scope.
      // The user asked to "Implement a drag-and-drop zone".

      toast({ title: 'Upload Started', description: `Uploading ${file.name}...` });

      // Placeholder: In a real app, this would be: 
      // const res = await uploadImage(productId, file);
      // For now, let's simulate success to show the UX
      setTimeout(() => {
        removePending(actionId);
        toast({ title: 'Upload Complete', description: `${file.name} uploaded successfully (Simulation).` });
      }, 2000);
    }
  }, [productId, toast]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  }, [handleUploadFiles]);

  const handleImageSelection = useCallback((imageId: string, checked: boolean) => {
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
      id: `ftp-${index + 1}`,
      product_id: productId,
      src: url,
      variant_ids: missingVariants.filter((v) => v.mediaUrl === url).map((v) => v.variantId).filter(Boolean),
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

    addImageMutation.mutate(newImageUrl, {
      onSuccess: () => {
        setNewImageUrl('');
        onImageCountChange(images.length + 1);
      }
    });
  };

  const handleAssignImage = useCallback(
    async (variantId: string, imageId: string | null) => {
      assignMutation.mutate({ variantId, imageId });
    },
    [assignMutation]
  );

  const handleAssignImageToMissingVariant = useCallback(
    (sku: string, imageId: string | null) => {
      setLocalMissingVariants((prev) => {
        const variant = prev[sku];
        if (!variant) return prev;

        const next = { ...prev };
        if (imageId !== null && imageId.startsWith('ftp-')) {
          const ftpImg = ftpImages.find((img) => img.id === imageId);
          next[sku] = { ...variant, imageId: null, mediaUrl: ftpImg?.src ?? variant.mediaUrl };
        } else {
          next[sku] = { ...variant, imageId, mediaUrl: null };
        }
        return next;
      });
    },
    [ftpImages]
  );

  const handleAssignToAll = useCallback(async (imageId: string) => {
    if (isMissingVariantMode) {
      setLocalMissingVariants((prev) => {
        const next = { ...prev };
        const ftpImg = imageId.startsWith('ftp-') ? ftpImages.find(img => img.id === imageId) : null;

        Object.keys(next).forEach(sku => {
          if (ftpImg) {
            next[sku] = { ...next[sku], imageId: null, mediaUrl: ftpImg.src };
          } else {
            next[sku] = { ...next[sku], imageId, mediaUrl: null };
          }
        });
        return next;
      });
    } else {
      const targets = variants;
      // Bulk assign using individual mutations for optimistic UI benefit or a single bulk action if available
      // For now, we'll keep it simple and just run them in parallel
      targets.forEach(v => assignMutation.mutate({ variantId: v.variantId!, imageId }));
    }
  }, [isMissingVariantMode, ftpImages, variants, assignMutation]);

  const handleAssignToSelection = useCallback(async (imageId: string) => {
    if (selectedVariantSkus.size === 0) return;

    if (isMissingVariantMode) {
      setLocalMissingVariants((prev) => {
        const next = { ...prev };
        const ftpImg = imageId.startsWith('ftp-') ? ftpImages.find(img => img.id === imageId) : null;

        selectedVariantSkus.forEach(sku => {
          if (next[sku]) {
            if (ftpImg) {
              next[sku] = { ...next[sku], imageId: null, mediaUrl: ftpImg.src };
            } else {
              next[sku] = { ...next[sku], imageId, mediaUrl: null };
            }
          }
        });
        return next;
      });
    } else {
      selectedVariantSkus.forEach(sku => {
        const v = variantsBySku[sku];
        if (v?.variantId) assignMutation.mutate({ variantId: v.variantId, imageId });
      });
    }
  }, [isMissingVariantMode, selectedVariantSkus, variants, ftpImages, assignMutation]);

  const handleQuickAssign = useCallback((imageId: string) => {
    if (selectedVariantSkus.size > 0) {
      handleAssignToSelection(imageId);
    } else {
      handleAssignToAll(imageId);
    }
  }, [selectedVariantSkus.size, handleAssignToSelection, handleAssignToAll]);

  const handleVariantAssign = useCallback((id: string, imageId: string | null) => {
    if (isMissingVariantMode) {
      handleAssignImageToMissingVariant(id, imageId);
    } else {
      handleAssignImage(id, imageId);
    }
  }, [isMissingVariantMode, handleAssignImageToMissingVariant, handleAssignImage]);

  const toggleVariantSelection = (sku: string) => {
    setSelectedVariantSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const selectAllVariants = (checked: boolean) => {
    const dataSource = isMissingVariantMode ? Object.values(localMissingVariants) : variants;
    if (checked) setSelectedVariantSkus(new Set(dataSource.map((v) => v.sku!)));
    else setSelectedVariantSkus(new Set());
  };

  const selectByOption = (optionName: string, value: string) => {
    const dataSource = isMissingVariantMode ? Object.values(localMissingVariants) : variants;
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

  const handleMergeImages = useCallback(async () => {
    if (mergingImageId === null || !masterImageId) return;
    const variantsToUpdate = variants.filter(v => v.imageId === mergingImageId);

    try {
      await Promise.all(variantsToUpdate.map((v) => assignMutation.mutateAsync({ variantId: v.variantId!, imageId: masterImageId })));
      await deleteImageMutation.mutateAsync(mergingImageId);
      toast({ title: 'Images Merged', description: 'Duplicate replaced and removed.' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to merge images.', variant: 'destructive' });
    } finally {
      setIsMergingDialogOpen(false);
      setMergingImageId(null);
      setMasterImageId('');
    }
  }, [mergingImageId, masterImageId, variants, assignMutation, deleteImageMutation, toast]);

  const handleDeleteImage = useCallback(async (imageId: string) => {
    if (imageId.startsWith('ftp-')) {
      toast({ title: 'Not Deletable', description: 'FTP images cannot be deleted from here.', variant: 'destructive' });
      return;
    }
    const imageToDelete = images.find((img) => img.id === imageId);
    if (imageToDelete && imageToDelete.variant_ids.length > 0) {
      toast({ title: 'Cannot Delete', description: 'Image is assigned to variants. Unassign first.', variant: 'destructive' });
      return;
    }

    deleteImageMutation.mutate(imageId, {
      onSuccess: () => {
        onImageCountChange(images.length - 1);
      }
    });
  }, [images, deleteImageMutation, toast, onImageCountChange]);

  const handleBulkDelete = async () => {
    const assignedImages = Array.from(selectedImageIds).filter((id) => {
      const image = images.find((img) => img.id === id);
      return image && image.variant_ids.length > 0;
    });
    if (assignedImages.length > 0) {
      toast({ title: 'Cannot Delete', description: `Some selected images are assigned.`, variant: 'destructive' });
      return;
    }

    const idsToDelete = Array.from(selectedImageIds);
    try {
      await Promise.all(idsToDelete.map(id => deleteImageMutation.mutateAsync(id)));
      onImageCountChange(images.length - idsToDelete.length);
      setSelectedImageIds(new Set());
    } catch (e) {
      // Mutations handle their own errors
    }
  };

  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const dataSource = isMissingVariantMode ? Object.values(localMissingVariants) : variants;
    dataSource.forEach((v) => { if (v.imageId) counts.set(v.imageId, (counts.get(v.imageId) || 0) + 1); });
    return counts;
  }, [localMissingVariants, variants, isMissingVariantMode]);

  const availableOptions = useMemo(() => {
    const optionsSource = isMissingVariantMode ? Object.values(localMissingVariants) : (variants as Product[]);
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
    const imageId = bulkAssignImageId;
    if (!imageId || !bulkAssignOption) return;
    if (isMissingVariantMode) {
      setLocalMissingVariants(prev => {
        const next = { ...prev };
        const ftpImg = imageId.startsWith('ftp-') ? ftpImages.find(img => img.id === imageId) : null;
        const variantsList = Object.values(prev);

        variantsList.forEach(v => {
          let match = false;
          if (bulkAssignOption === 'All Variants') match = true;
          else {
            const first = variantsList.find(vm => vm.option1Name === bulkAssignOption || vm.option2Name === bulkAssignOption || vm.option3Name === bulkAssignOption);
            if (first?.option1Name === bulkAssignOption && v.option1Value === bulkAssignValue) match = true;
            else if (first?.option2Name === bulkAssignOption && v.option2Value === bulkAssignValue) match = true;
            else if (first?.option3Name === bulkAssignOption && v.option3Value === bulkAssignValue) match = true;
          }
          if (match) {
            if (ftpImg) {
              next[v.sku!] = { ...v, imageId: null, mediaUrl: ftpImg.src };
            } else {
              next[v.sku!] = { ...v, imageId, mediaUrl: null };
            }
          }
        });
        return next;
      });
    } else {
      const targets = variants.filter(v => {
        if (bulkAssignOption === 'All Variants') return true;
        const first = variants.find(vm => vm.option1Name === bulkAssignOption || vm.option2Name === bulkAssignOption || vm.option3Name === bulkAssignOption);
        if (first?.option1Name === bulkAssignOption) return v.option1Value === bulkAssignValue;
        if (first?.option2Name === bulkAssignOption) return v.option2Value === bulkAssignValue;
        if (first?.option3Name === bulkAssignOption) return v.option3Value === bulkAssignValue;
        return false;
      });
      targets.forEach(v => assignMutation.mutate({ variantId: v.variantId!, imageId }));
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

  if (error) {
    return (
      <div className="flex h-[80vh] items-center justify-center bg-background/50 backdrop-blur-xl -m-6 rounded-lg">
        <div className="flex flex-col items-center gap-4 text-destructive">
          <AlertCircle className="h-10 w-10" />
          <p className="text-sm font-medium">{(error as Error).message || 'Failed to sync assets.'}</p>
        </div>
      </div>
    );
  }

  const handleSaveData = () => { if (isMissingVariantMode && onSaveMissingVariant) onSaveMissingVariant(Object.values(localMissingVariants)); };
  const productTitle = isMissingVariantMode ? (missingVariants[0]?.name || 'New Product') : (variants[0]?.name || 'Product Media');

  const parentRef = useRef<HTMLDivElement>(null);
  const variantParentRef = useRef<HTMLDivElement>(null);

  const filteredImages = useMemo(() =>
    allImages.filter(img => !gallerySearch || img.src.toLowerCase().includes(gallerySearch.toLowerCase()) || img.id.includes(gallerySearch)),
    [allImages, gallerySearch]
  );

  const columns = 2; // Fixed to simplify grid virtualization, or can be dynamic based on width
  const rowCount = Math.ceil((filteredImages.length + 1) / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 5,
  });

  const variantList = isMissingVariantMode ? Object.values(localMissingVariants) : (variants as Product[]);
  const variantVirtualizer = useVirtualizer({
    count: variantList.length,
    getScrollElement: () => variantParentRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });

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
          {/* Gallery with Dropzone */}
          <div
            className="w-1/2 border-r flex flex-col bg-muted/5 relative"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {/* Drag Overlay */}
            <AnimatePresence>
              {isDragging && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-[2px] border-2 border-dashed border-primary m-2 rounded-xl pointer-events-none"
                >
                  <div className="flex flex-col items-center gap-2 bg-background/80 px-6 py-4 rounded-full shadow-2xl border border-primary/20">
                    <Plus className="h-8 w-8 text-primary animate-bounce" />
                    <span className="text-sm font-bold uppercase tracking-widest text-primary">Drop to Upload</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                              <SelectItem key={img.id} value={img.id}>
                                <div className="flex items-center gap-2">
                                  <Image src={img.src} alt="" width={24} height={24} className="rounded" />
                                  <span className="truncate w-40">#{img.id} {img.isFtpSource ? '(FTP)' : ''}</span>
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

            <div ref={parentRef} className="flex-1 overflow-auto p-6">
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const imagesInRow = filteredImages.slice(
                    virtualRow.index * columns,
                    (virtualRow.index + 1) * columns
                  );

                  return (
                    <div
                      key={virtualRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                        gap: '1rem',
                      }}
                    >
                      <AnimatePresence initial={false}>
                        {imagesInRow.map((image) => (
                          <MediaManagerImageCard
                            key={image.id}
                            image={image}
                            isSelected={selectedImageIds.has(image.id)}
                            isAssigned={image.variant_ids.length > 0}
                            isMissingVariantMode={isMissingVariantMode}
                            isPending={pendingActions.has(`deleting-${image.id}`)}
                            onSelectionChange={handleImageSelection}
                            onDelete={handleDeleteImage}
                            onAssign={handleQuickAssign}
                          />
                        ))}
                      </AnimatePresence>

                      {/* Show Add Asset button in the first empty slot after images */}
                      {virtualRow.index === Math.floor(filteredImages.length / columns) && (
                        <button
                          onClick={() => document.getElementById('file-upload')?.click()}
                          className="aspect-square rounded-xl border-2 border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary group"
                          style={{ gridColumn: (filteredImages.length % columns) + 1 }}
                        >
                          <div className="h-10 w-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                            <Plus className="h-5 w-5" />
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-tight">Add Asset</span>
                          <input
                            id="file-upload"
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
                          />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Show active uploads */}
              {[...pendingActions].filter(a => a.startsWith('uploading-')).length > 0 && (
                <div className="mt-8 space-y-2">
                  <h4 className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Active Uploads</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {[...pendingActions].filter(a => a.startsWith('uploading-')).map(action => (
                      <div key={action} className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10 animate-pulse">
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="text-xs font-medium truncate w-40">{action.replace('uploading-', '')}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] border-primary/20 text-primary">Uploading</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 bg-background/80 border-t flex gap-2">
              <Input placeholder="Image URL..." value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} className="h-9" />
              <Button size="sm" onClick={handleAddImage} disabled={addImageMutation.isPending}><ImagePlus className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Variants */}
          <div className="w-1/2 flex flex-col bg-background/20">
            <div className="p-4 border-b flex items-center justify-between h-[57px]">
              <div className="flex items-center gap-2">
                <Checkbox checked={selectedVariantSkus.size === variantList.length} onCheckedChange={c => selectAllVariants(!!c)} />
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Select ({selectedVariantSkus.size})</span>
              </div>
            </div>
            <div ref={variantParentRef} className="flex-1 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead className="w-12"></TableHead><TableHead className="text-[10px] uppercase">Identity</TableHead><TableHead className="text-[10px] uppercase">Assignment</TableHead></TableRow></TableHeader>
                <TableBody>
                  <div
                    style={{
                      height: `${variantVirtualizer.getTotalSize()}px`,
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    {variantVirtualizer.getVirtualItems().map((virtualRow) => {
                      const variant = variantList[virtualRow.index];
                      const sku = variant.sku || variant.variantId || 'unknown';
                      const isSelected = selectedVariantSkus.has(sku);
                      return (
                        <TableRow
                          key={virtualRow.key}
                          data-index={virtualRow.index}
                          ref={variantVirtualizer.measureElement}
                          className={cn(isSelected && "bg-primary/5", "absolute w-full top-0 left-0")}
                          style={{
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          onClick={() => toggleVariantSelection(sku)}
                        >
                          <TableCell className="w-12"><Checkbox checked={isSelected} onCheckedChange={() => toggleVariantSelection(sku)} /></TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs font-bold">{sku}</span>
                              <span className="text-[10px] text-muted-foreground">{[variant.option1Value, variant.option2Value, variant.option3Value].filter(Boolean).join(' / ')}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <VariantRow
                              variant={variant}
                              images={allImages}
                              isSubmitting={assignMutation.isPending}
                              onAssign={handleVariantAssign}
                              idType={isMissingVariantMode ? 'sku' : 'variantId'}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </div>
                </TableBody>
              </Table>
            </div>
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
