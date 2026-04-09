import { memo } from 'react';
import Image from 'next/image';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableCell, TableRow } from '@/components/ui/table';
import { Product, ShopifyProductImage } from '@/lib/types';

interface VariantRowProps {
  variant: Partial<Product>;
  images: ShopifyProductImage[];
  isSubmitting: boolean;
  onAssign: (id: string, imageId: string | null) => void;
  idType?: 'variantId' | 'sku';
}

// Extracted to defer rendering until SelectContent is open
const VariantImageOptions = memo(({ images }: { images: ShopifyProductImage[] }) => {
  return (
    <>
      <SelectItem value="none">No Image</SelectItem>
      {images.map((image) => (
        <SelectItem key={image.id} value={image.id}>
          <div className="flex items-center gap-2">
            <Image
              src={image.src}
              alt=""
              width={20}
              height={20}
              className="rounded-sm"
            />
            <span className="truncate w-32">{image.isFtpSource ? 'FTP: ' : ''}Image #{image.id}</span>
          </div>
        </SelectItem>
      ))}
    </>
  );
});

VariantImageOptions.displayName = 'VariantImageOptions';

const ImageSelectContent = memo(({ images }: { images: ShopifyProductImage[] }) => {
  return (
    <SelectContent>
      {/*
        Optimization: We render VariantImageOptions as a child of SelectContent.
        SelectContent (Radix UI) only renders its children when the dropdown is open.
        This prevents the expensive mapping of images from executing when the dropdown is closed,
        significantly improving performance when there are many variants/images.
      */}
      <VariantImageOptions images={images} />
    </SelectContent>
  );
});

ImageSelectContent.displayName = 'ImageSelectContent';

export const VariantRow = memo(
  ({ variant, images, isSubmitting, onAssign, idType = 'variantId' }: VariantRowProps) => {
    const id = idType === 'variantId' ? variant.variantId! : variant.sku!;

    const currentImageId = (() => {
      if (variant.imageId) return variant.imageId;
      if (variant.mediaUrl) {
        const matchingImg = images.find(img => img.src === variant.mediaUrl);
        return matchingImg?.id || 'none';
      }
      return 'none';
    })();

    return (
      <Select
        value={currentImageId}
        onValueChange={(value) =>
          onAssign(id, value === 'none' ? null : value)
        }
        disabled={isSubmitting}
      >
        <SelectTrigger
          className="w-[140px] h-8 bg-background/50 border-none ring-1 ring-border/40 focus:ring-primary/40"
          aria-label={`Assign image for variant ${variant.sku}`}
        >
          <SelectValue placeholder="Select image..." />
        </SelectTrigger>
        <ImageSelectContent images={images} />
      </Select>
    );
  }
);

VariantRow.displayName = 'VariantRow';
