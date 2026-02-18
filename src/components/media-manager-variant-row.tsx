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
  onAssign: (id: string, imageId: number | null) => void;
  idType?: 'variantId' | 'sku';
}

const ImageSelectContent = memo(({ images }: { images: ShopifyProductImage[] }) => {
  return (
    <SelectContent>
      <SelectItem value="none">No Image</SelectItem>
      {images.map((image) => (
        <SelectItem key={image.id} value={image.id.toString()}>
          <div className="flex items-center gap-2">
            <Image
              src={image.src}
              alt=""
              width={20}
              height={20}
              className="rounded-sm"
            />
            <span>{image.isFtpSource ? 'FTP: ' : ''}Image #{image.id}</span>
          </div>
        </SelectItem>
      ))}
    </SelectContent>
  );
});

ImageSelectContent.displayName = 'ImageSelectContent';

export const VariantRow = memo(
  ({ variant, images, isSubmitting, onAssign, idType = 'variantId' }: VariantRowProps) => {
    const id = idType === 'variantId' ? variant.variantId! : variant.sku!;

    return (
      <Select
        value={variant.imageId?.toString() ?? 'none'}
        onValueChange={(value) =>
          onAssign(id, value === 'none' ? null : parseInt(value))
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
