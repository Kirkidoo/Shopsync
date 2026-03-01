'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getProductWithImages,
    assignImageToVariant,
    addImageFromUrl,
    deleteImage
} from '@/app/actions/media-actions';
import { Product, ShopifyProductImage } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export const mediaKeys = {
    all: ['media'] as const,
    product: (productId: string) => [...mediaKeys.all, productId] as const,
};

export function useProductMedia(productId: string) {
    return useQuery({
        queryKey: mediaKeys.product(productId),
        queryFn: async () => {
            const result = await getProductWithImages(productId);
            if (!result.success || !result.data) {
                throw new Error(result.message || 'Failed to fetch media');
            }
            return result.data;
        },
        enabled: !!productId,
    });
}

export function useAssignImageMutation(productId: string) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ variantId, imageId }: { variantId: string; imageId: string | null }) => {
            const result = await assignImageToVariant(productId, variantId, imageId);
            if (!result.success) throw new Error(result.message);
            return result;
        },
        onMutate: async ({ variantId, imageId }) => {
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: mediaKeys.product(productId) });

            // Snapshot the previous value
            const previousData = queryClient.getQueryData<{ variants: Product[]; images: ShopifyProductImage[] }>(
                mediaKeys.product(productId)
            );

            // Optimistically update to the new value
            if (previousData) {
                queryClient.setQueryData(mediaKeys.product(productId), {
                    ...previousData,
                    variants: previousData.variants.map((v) =>
                        v.variantId === variantId ? { ...v, imageId } : v
                    ),
                });
            }

            return { previousData };
        },
        onError: (err, variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(mediaKeys.product(productId), context.previousData);
            }
            toast({
                title: 'Error',
                description: err.message,
                variant: 'destructive',
            });
        },
        onSuccess: () => {
            toast({ title: 'Success', description: 'Image assigned to variant.' });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: mediaKeys.product(productId) });
        },
    });
}

export function useAddImageMutation(productId: string) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (imageUrl: string) => {
            const result = await addImageFromUrl(productId, imageUrl);
            if (!result.success || !result.image) throw new Error(result.message);
            return result.image;
        },
        onSuccess: (newImage) => {
            toast({ title: 'Success', description: 'Image added successfully.' });
            queryClient.setQueryData<{ variants: Product[]; images: ShopifyProductImage[] }>(
                mediaKeys.product(productId),
                (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        images: [...old.images, newImage],
                    };
                }
            );
        },
        onError: (err) => {
            toast({
                title: 'Error',
                description: err.message,
                variant: 'destructive',
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: mediaKeys.product(productId) });
        },
    });
}

export function useDeleteImageMutation(productId: string) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (imageId: string) => {
            const result = await deleteImage(productId, imageId);
            if (!result.success) throw new Error(result.message);
            return result;
        },
        onMutate: async (imageId) => {
            await queryClient.cancelQueries({ queryKey: mediaKeys.product(productId) });

            const previousData = queryClient.getQueryData<{ variants: Product[]; images: ShopifyProductImage[] }>(
                mediaKeys.product(productId)
            );

            if (previousData) {
                queryClient.setQueryData(mediaKeys.product(productId), {
                    ...previousData,
                    images: previousData.images.filter((img) => img.id !== imageId),
                });
            }

            return { previousData };
        },
        onError: (err, imageId, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(mediaKeys.product(productId), context.previousData);
            }
            toast({
                title: 'Error',
                description: err.message,
                variant: 'destructive',
            });
        },
        onSuccess: () => {
            toast({ title: 'Success', description: 'Image deleted successfully.' });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: mediaKeys.product(productId) });
        },
    });
}
