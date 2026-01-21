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

export interface ImageOption {
  id: number;
  src: string;
}

interface VariantRowProps {
  id: string;
  sku: string;
  optionDisplay: string;
  imageId: number | null | undefined;
  imageOptions: ImageOption[];
  isSubmitting: boolean;
  onAssign: (id: string, imageId: number | null) => void;
}

const ImageSelectContent = memo(({ imageOptions }: { imageOptions: ImageOption[] }) => {
  return (
    <SelectContent>
      <SelectItem value="none">No Image</SelectItem>
      {imageOptions.map((image) => (
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
  ({ id, sku, optionDisplay, imageId, imageOptions, isSubmitting, onAssign }: VariantRowProps) => {
    return (
      <TableRow>
        <TableCell className="font-medium">{sku}</TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {optionDisplay}
        </TableCell>
        <TableCell>
          <Select
            value={imageId?.toString() ?? 'none'}
            onValueChange={(value) =>
              onAssign(id, value === 'none' ? null : parseInt(value))
            }
            disabled={isSubmitting}
          >
            <SelectTrigger
              className="w-[180px]"
              aria-label={`Assign image for variant ${sku}`}
            >
              <SelectValue placeholder="Select image..." />
            </SelectTrigger>
            <ImageSelectContent imageOptions={imageOptions} />
          </Select>
        </TableCell>
      </TableRow>
    );
  }
);

VariantRow.displayName = 'VariantRow';
