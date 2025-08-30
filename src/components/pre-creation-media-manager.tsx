
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Link } from 'lucide-react';
import { Product } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface PreCreationMediaManagerProps {
    variants: Product[];
    onSave: (updatedVariants: Product[]) => void;
    onCancel: () => void;
}

export function PreCreationMediaManager({ variants, onSave, onCancel }: PreCreationMediaManagerProps) {
    const [localVariants, setLocalVariants] = useState<Product[]>([]);
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [newImageUrl, setNewImageUrl] = useState('');
    const { toast } = useToast();

    useEffect(() => {
        // Deep copy to avoid mutating parent state directly
        setLocalVariants(JSON.parse(JSON.stringify(variants)));

        // Extract unique image URLs from the variants
        const uniqueUrls = [...new Set(variants.map(v => v.mediaUrl).filter(Boolean) as string[])];
        setImageUrls(uniqueUrls);
    }, [variants]);

    const handleAddImageUrl = () => {
        if (!newImageUrl || !newImageUrl.startsWith('http')) {
            toast({ title: 'Invalid URL', description: 'Please enter a valid image URL.', variant: 'destructive' });
            return;
        }
        if (imageUrls.includes(newImageUrl)) {
            toast({ title: 'Duplicate URL', description: 'This image URL has already been added.', variant: 'destructive' });
            return;
        }
        setImageUrls(prev => [...prev, newImageUrl]);
        setNewImageUrl('');
    };

    const handleDeleteImageUrl = (urlToDelete: string) => {
        setImageUrls(prev => prev.filter(url => url !== urlToDelete));
        // Unassign this URL from any variants that were using it
        setLocalVariants(prev => prev.map(v => v.mediaUrl === urlToDelete ? { ...v, mediaUrl: null } : v));
        toast({ title: 'Image URL Removed', description: 'The URL has been removed from the gallery and unassigned from variants.' });
    };

    const handleAssignImage = (sku: string, url: string | null) => {
        setLocalVariants(prev => prev.map(v => v.sku === sku ? { ...v, mediaUrl: url } : v));
    };

    const handleSave = () => {
        onSave(localVariants);
    };

    if (variants.length === 0) {
        return null; // Don't render anything if the dialog is closing or has no variants
    }

    const productTitle = variants[0]?.name || 'New Product';

    return (
        <DialogContent className="max-w-5xl">
            <DialogHeader>
                <DialogTitle>Manage Media for: {productTitle}</DialogTitle>
                <DialogDescription>
                    Add, remove, and assign images for this new product before creating it in Shopify. Changes are saved locally until you create the product.
                </DialogDescription>
            </DialogHeader>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-h-[70vh] overflow-hidden">
                {/* Left side: Image Gallery & Add */}
                <div className="flex flex-col gap-4 overflow-y-auto pr-2">
                    <h3 className="font-semibold text-lg border-b pb-2">Image Gallery ({imageUrls.length})</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {imageUrls.map(url => (
                            <div key={url} className="relative group border rounded-md overflow-hidden">
                                 <Image
                                    src={url}
                                    alt={`Product image`}
                                    width={150}
                                    height={150}
                                    className="object-cover w-full aspect-square"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                   <a href={url} target="_blank" rel="noopener noreferrer" className="p-2 inline-flex items-center justify-center rounded-md bg-secondary/80 text-secondary-foreground hover:bg-secondary">
                                      <Link className="h-4 w-4" />
                                   </a>
                                   <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                             <Button size="icon" variant="destructive" className="h-8 w-8">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Remove this image URL?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will remove the image from the gallery and unassign it from any variants. This does not delete the image from its source.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDeleteImageUrl(url)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                    Yes, remove URL
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>
                        ))}
                    </div>
                     <div className="p-4 border rounded-md mt-4 bg-muted/20 sticky bottom-0">
                        <Label htmlFor="new-image-url" className="text-base font-medium">Add New Image from URL</Label>
                        <div className="flex gap-2 mt-2">
                            <Input 
                              id="new-image-url"
                              placeholder="https://example.com/image.jpg"
                              value={newImageUrl}
                              onChange={(e) => setNewImageUrl(e.target.value)}
                            />
                            <Button onClick={handleAddImageUrl}>
                                Add
                            </Button>
                        </div>
                    </div>
                </div>
                {/* Right side: Variant Assignments */}
                <div className="flex flex-col gap-4 overflow-y-auto pr-2">
                    <h3 className="font-semibold text-lg border-b pb-2">Variant Assignments</h3>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>SKU</TableHead>
                                <TableHead>Options</TableHead>
                                <TableHead>Assigned Image</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {localVariants.map(variant => (
                                <TableRow key={variant.sku}>
                                    <TableCell className="font-medium">{variant.sku}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {[variant.option1Value, variant.option2Value, variant.option3Value].filter(Boolean).join(' / ')}
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            value={variant.mediaUrl || 'none'}
                                            onValueChange={(value) => handleAssignImage(variant.sku, value === 'none' ? null : value)}
                                        >
                                            <SelectTrigger className="w-[200px]">
                                                <SelectValue placeholder="Select image..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No Image</SelectItem>
                                                {imageUrls.map((url, index) => (
                                                     <SelectItem key={url} value={url}>
                                                        <div className="flex items-center gap-2">
                                                            <Image src={url} alt="" width={20} height={20} className="rounded-sm object-cover" />
                                                            <span>Image {index + 1}</span>
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
                <Button variant="outline" onClick={onCancel}>Cancel</Button>
                <Button onClick={handleSave}>Save Assignments</Button>
            </DialogFooter>
        </DialogContent>
    );
}
