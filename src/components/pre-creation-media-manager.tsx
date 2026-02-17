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
import { Trash2, Link, Blocks, ImagePlus, X } from 'lucide-react';
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

interface PreCreationMediaManagerProps {
  variants: Product[];
  onSave: (updatedVariants: Product[]) => void;
  onCancel: () => void;
}

export function PreCreationMediaManager({
  variants,
  onSave,
  onCancel,
}: PreCreationMediaManagerProps) {
  const [localVariants, setLocalVariants] = useState<Product[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const { toast } = useToast();
  const [selectedImageUrls, setSelectedImageUrls] = useState<Set<string>>(new Set());

  // State for bulk assign dialog
  const [bulkAssignImageUrl, setBulkAssignImageUrl] = useState<string>('');
  const [bulkAssignOption, setBulkAssignOption] = useState<string>('');
  const [bulkAssignValue, setBulkAssignValue] = useState<string>('');
  const [isBulkAssignDialogOpen, setIsBulkAssignDialogOpen] = useState(false);

  // Revision counter to force Select re-renders when assignments change externally
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setLocalVariants(JSON.parse(JSON.stringify(variants)));
    const uniqueUrls = [...new Set(variants.map((v) => v.mediaUrl).filter(Boolean) as string[])];
    setImageUrls(uniqueUrls);
    setSelectedImageUrls(new Set());
  }, [variants]);

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

  const handleAssignImage = useCallback((sku: string, url: string | null) => {
    setLocalVariants((prev) => prev.map((v) => (v.sku === sku ? { ...v, mediaUrl: url } : v)));
    setRevision((r) => r + 1);
  }, []);

  const handleAssignToAll = useCallback((url: string) => {
    setLocalVariants((prev) => prev.map((v) => ({ ...v, mediaUrl: url })));
    setRevision((r) => r + 1);
    toast({
      title: 'Assigned to All',
      description: `Image assigned to all variants.`,
    });
  }, [toast]);

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
    onSave(localVariants);
  };

  if (variants.length === 0) {
    return null;
  }

  const productTitle = variants[0]?.name || 'New Product';

  return (
    <>
      <DialogHeader>
        <DialogTitle>Manage Media for: {productTitle}</DialogTitle>
        <DialogDescription>
          Add, remove, and assign images before creating the product. Changes are saved locally.
        </DialogDescription>
      </DialogHeader>
      <div className="grid max-h-[70vh] grid-cols-1 gap-8 overflow-hidden md:grid-cols-2">
        <div className="flex flex-col gap-4 overflow-y-auto pr-2">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-lg font-semibold">Image Gallery ({imageUrls.length})</h3>
            <div className="flex items-center gap-2">
              <Dialog open={isBulkAssignDialogOpen} onOpenChange={setIsBulkAssignDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={imageUrls.length === 0}>
                    <Blocks className="mr-2 h-4 w-4" />
                    Bulk Assign
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Bulk Assign Image</DialogTitle>
                    <DialogDescription>
                      Assign a single image to multiple variants based on an option or to all
                      variants.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>1. Select Image to Assign</Label>
                      <Select value={bulkAssignImageUrl} onValueChange={setBulkAssignImageUrl}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an image..." />
                        </SelectTrigger>
                        <SelectContent>
                          {imageUrls.map((url) => (
                            <SelectItem key={url} value={url}>
                              <div className="flex items-center gap-2">
                                <Image
                                  src={url}
                                  alt=""
                                  width={20}
                                  height={20}
                                  className="rounded-sm object-cover"
                                />
                                <span className="max-w-xs truncate">{url.split('/').pop()}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>2. Select Target Variants</Label>
                      <Select
                        value={bulkAssignOption}
                        onValueChange={(val) => {
                          setBulkAssignOption(val);
                          setBulkAssignValue('');
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Group by option or select all..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All Variants">All Variants</SelectItem>
                          {[...availableOptions.keys()].map((optionName) => (
                            <SelectItem key={optionName} value={optionName}>
                              {optionName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {bulkAssignOption && bulkAssignOption !== 'All Variants' && (
                      <div className="space-y-2">
                        <Label>3. Select Value to Match</Label>
                        <Select value={bulkAssignValue} onValueChange={setBulkAssignValue}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a value..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableOptions.get(bulkAssignOption)?.size &&
                              Array.from(availableOptions.get(bulkAssignOption)!).map((value) => (
                                <SelectItem key={value} value={value}>
                                  {value}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsBulkAssignDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleBulkAssign}>Assign Image</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={selectedImageUrls.size === 0}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete ({selectedImageUrls.size})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Selected Images?</AlertDialogTitle>
                  </AlertDialogHeader>
                  <AlertDialogDescription>
                    Are you sure you want to remove the {selectedImageUrls.size} selected image
                    URLs? They will be removed from the gallery and unassigned from all variants.
                    This does not delete the files from their source.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleBulkDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Remove URLs
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="select-all-pre"
              onCheckedChange={(checked) => handleSelectAllImages(!!checked)}
              checked={selectedImageUrls.size > 0 && selectedImageUrls.size === imageUrls.length}
              disabled={imageUrls.length === 0}
            />
            <Label htmlFor="select-all-pre" className="text-sm font-normal">
              Select All
            </Label>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {imageUrls.map((url, i) => {
              const isSelected = selectedImageUrls.has(url);
              const isAssigned = assignedUrls.has(url);
              const count = assignmentCounts.get(url) || 0;
              return (
                <div key={url} className="group relative overflow-hidden rounded-md border">
                  <label htmlFor={`pre-image-select-${i}`} className="block cursor-pointer">
                    <Image
                      src={url}
                      alt={`Product image`}
                      width={150}
                      height={150}
                      className="aspect-square w-full object-cover"
                    />
                  </label>
                  {/* Hover overlay with actions */}
                  <div
                    className={cn(
                      'pointer-events-none absolute inset-0 flex flex-col justify-between bg-black/60 p-1.5 opacity-0 transition-opacity group-hover:opacity-100',
                      isSelected && 'opacity-100'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <Checkbox
                        id={`pre-image-select-${i}`}
                        className="pointer-events-auto bg-white/80 data-[state=checked]:bg-primary"
                        checked={isSelected}
                        onCheckedChange={(checked) => handleImageSelection(url, !!checked)}
                        aria-label={`Select image`}
                      />
                      <div className="flex items-center gap-1">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md bg-secondary/80 text-secondary-foreground hover:bg-secondary"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="View full image in new tab"
                        >
                          <Link className="h-3.5 w-3.5" />
                        </a>
                        <button
                          type="button"
                          className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md bg-destructive/80 text-destructive-foreground hover:bg-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleDeleteSingleImage(url);
                          }}
                          aria-label="Delete image"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="pointer-events-auto mx-auto flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleAssignToAll(url);
                      }}
                      aria-label="Assign this image to all variants"
                    >
                      <ImagePlus className="h-3 w-3" />
                      Assign to All
                    </button>
                  </div>
                  {/* Assignment badge — visible when NOT hovering */}
                  {isAssigned ? (
                    <div className="absolute bottom-1 left-1 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow group-hover:hidden">
                      {count} variant{count !== 1 ? 's' : ''}
                    </div>
                  ) : (
                    <div className="absolute bottom-1 left-1 rounded bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow group-hover:hidden">
                      Unassigned
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="sticky bottom-0 mt-auto rounded-md border bg-muted/20 p-4">
            <Label htmlFor="new-image-url" className="text-base font-medium">
              Add New Image from URL
            </Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="new-image-url"
                placeholder="https://example.com/image.jpg"
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
              />
              <Button onClick={handleAddImageUrl}>Add</Button>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto pr-2">
          <h3 className="border-b pb-2 text-lg font-semibold">Variant Assignments</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Options</TableHead>
                <TableHead>Assigned Image</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {localVariants.map((variant) => (
                <TableRow key={variant.sku}>
                  <TableCell className="font-medium">{variant.sku}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {[variant.option1Value, variant.option2Value, variant.option3Value]
                      .filter(Boolean)
                      .join(' / ')}
                  </TableCell>
                  <TableCell>
                    {/* key includes revision + mediaUrl to force Radix Select to remount on external changes */}
                    <Select
                      key={`${variant.sku}-${revision}-${variant.mediaUrl || 'none'}`}
                      value={variant.mediaUrl || 'none'}
                      onValueChange={(value) =>
                        handleAssignImage(variant.sku, value === 'none' ? null : value)
                      }
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select image..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Image</SelectItem>
                        {imageUrls.map((url, index) => (
                          <SelectItem key={url} value={url}>
                            <div className="flex items-center gap-2">
                              <Image
                                src={url}
                                alt=""
                                width={20}
                                height={20}
                                className="rounded-sm object-cover"
                              />
                              <span className="max-w-[120px] truncate">Image {index + 1}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save Assignments</Button>
      </DialogFooter>
    </>
  );
}
