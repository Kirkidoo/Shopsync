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
            <span>Image #{image.id}</span>
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
      <TableRow>
        <TableCell className="font-medium">{variant.sku}</TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {[variant.option1Value, variant.option2Value, variant.option3Value]
            .filter(Boolean)
            .join(' / ')}
        </TableCell>
        <TableCell>
          <Select
            value={variant.imageId?.toString() ?? 'none'}
            onValueChange={(value) =>
              onAssign(id, value === 'none' ? null : parseInt(value))
            }
            disabled={isSubmitting}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select image..." />
            </SelectTrigger>
            <ImageSelectContent images={images} />
          </Select>
        </TableCell>
      </TableRow>
    );
  }
);

VariantRow.displayName = 'VariantRow';
