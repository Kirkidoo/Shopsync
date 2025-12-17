import { memo } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Trash2, Link } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShopifyProductImage } from '@/lib/types';

interface MediaManagerImageCardProps {
  image: ShopifyProductImage;
  isSelected: boolean;
  isAssigned: boolean;
  isMissingVariantMode: boolean;
  isSubmitting: boolean;
  onSelectionChange: (id: number, checked: boolean) => void;
  onDelete: (id: number) => void;
}

export const MediaManagerImageCard = memo(function MediaManagerImageCard({
  image,
  isSelected,
  isAssigned,
  isMissingVariantMode,
  isSubmitting,
  onSelectionChange,
  onDelete,
}: MediaManagerImageCardProps) {
  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-md border"
      onClick={() =>
        !isMissingVariantMode && onSelectionChange(image.id, !isSelected)
      }
    >
      <Image
        src={image.src}
        alt={`Product image ${image.id}`}
        width={150}
        height={150}
        className="aspect-square w-full object-cover"
      />
      <div
        className={cn(
          'absolute inset-0 flex items-start justify-between bg-black/60 p-1.5 transition-opacity',
          isSelected || isSubmitting
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          isSubmitting ? 'pointer-events-none' : 'pointer-events-auto',
          isMissingVariantMode && 'hidden'
        )}
      >
        <Checkbox
          id={`image-select-${image.id}`}
          className="pointer-events-auto bg-white/80 data-[state=checked]:bg-primary"
          checked={isSelected}
          onCheckedChange={(checked) => onSelectionChange(image.id, !!checked)}
          onClick={(e) => e.stopPropagation()}
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="icon"
              className="pointer-events-auto h-6 w-6"
              disabled={isSubmitting}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Delete image ${image.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this image?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription>
              This will permanently delete the image from Shopify. This action
              cannot be undone.
              {isAssigned && (
                <span className="mt-2 block font-bold text-destructive-foreground">
                  Warning: This image is assigned to {image.variant_ids.length}{' '}
                  variant(s).
                </span>
              )}
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(image.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Image
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {isAssigned && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'pointer-events-auto absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-secondary/80 text-secondary-foreground',
                  !isSelected && 'group-hover:hidden group-focus-within:hidden',
                  isMissingVariantMode && 'hidden'
                )}
              >
                <Link className="h-3.5 w-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Assigned to {image.variant_ids.length} variant(s)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
});
