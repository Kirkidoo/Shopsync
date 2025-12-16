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
import { Product } from '@/lib/types';

interface PreCreationVariantRowProps {
  variant: Product;
  imageUrls: string[];
  onAssign: (sku: string, url: string | null) => void;
}

const ImageSelectContent = memo(({ imageUrls }: { imageUrls: string[] }) => {
  return (
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
  );
});

ImageSelectContent.displayName = 'ImageSelectContent';

export const PreCreationVariantRow = memo(
  ({ variant, imageUrls, onAssign }: PreCreationVariantRowProps) => {
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
            value={variant.mediaUrl || 'none'}
            onValueChange={(value) =>
              onAssign(variant.sku, value === 'none' ? null : value)
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select image..." />
            </SelectTrigger>
            <ImageSelectContent imageUrls={imageUrls} />
          </Select>
        </TableCell>
      </TableRow>
    );
  }
);

PreCreationVariantRow.displayName = 'PreCreationVariantRow';
