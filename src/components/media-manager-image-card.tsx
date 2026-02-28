import { memo } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
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
import { Trash2, Link, Loader2, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShopifyProductImage } from '@/lib/types';

interface MediaManagerImageCardProps {
  image: ShopifyProductImage;
  isSelected: boolean;
  isAssigned: boolean;
  isMissingVariantMode: boolean;
  isPending?: boolean;
  onSelectionChange: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onAssign?: (id: string) => void;
}

export const MediaManagerImageCard = memo(function MediaManagerImageCard({
  image,
  isSelected,
  isAssigned,
  isMissingVariantMode,
  isPending = false,
  onSelectionChange,
  onDelete,
  onAssign,
}: MediaManagerImageCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={cn(
        "group relative aspect-square rounded-xl border-2 overflow-hidden bg-background transition-colors",
        isSelected ? "border-primary shadow-lg shadow-primary/10" : "border-border/60 hover:border-primary/40"
      )}
    >
      <label
        htmlFor={`image-select-${image.id}`}
        className="block h-full cursor-pointer relative"
        aria-label={`Product image ${image.id}`}
      >
        <Image
          src={image.src}
          alt={`Product image ${image.id}`}
          fill
          className={cn(
            "object-cover transition-transform duration-500 group-hover:scale-110",
            isPending && "blur-[2px] opacity-50"
          )}
        />

        {/* Loading Overlay */}
        <AnimatePresence>
          {isPending && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-sm"
            >
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-[10px] font-bold uppercase text-primary animate-pulse">Processing</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </label>

      {/* Selection Checkbox */}
      {!isMissingVariantMode && (
        <div className="absolute top-2 left-2 z-20">
          <Checkbox
            id={`image-select-${image.id}`}
            checked={isSelected}
            onCheckedChange={(checked) => onSelectionChange(image.id, !!checked)}
            className="h-5 w-5 bg-background/80 data-[state=checked]:bg-primary"
          />
        </div>
      )}

      {/* Top Right Badges */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-20">
        {isAssigned && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white shadow-lg">
                  <Link className="h-3 w-3" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="text-[10px] font-medium">Assigned to variants</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {image.isFtpSource && (
          <span className="bg-blue-600 text-[10px] font-bold text-white px-1.5 py-0.5 rounded shadow-sm">FTP</span>
        )}
      </div>

      {/* Hover Actions Bar */}
      <div className="absolute inset-x-0 bottom-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-20 pointer-events-none group-hover:pointer-events-auto">
        <div className="flex gap-2">
          {onAssign && (
            <Button
              size="sm"
              className="flex-1 h-8 text-[10px] font-bold tracking-tight"
              onClick={() => onAssign(image.id)}
            >
              Quick Assign
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="icon"
                className="h-8 w-8 hover:scale-110 active:scale-95 transition-transform"
                disabled={isPending}
                aria-label="Delete image"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanent Deletion</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the media asset from Shopify.
                  {isAssigned && (
                    <span className="block mt-2 font-bold text-destructive">
                      Warning: This image is currently linked to variants.
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Asset</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(image.id)}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Confirm Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Preview Button (Always visible on hover) */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="h-10 w-10 rounded-full bg-background/20 backdrop-blur-md border border-white/20 flex items-center justify-center scale-75 group-hover:scale-100 transition-transform">
          <Maximize2 className="h-5 w-5 text-white" />
        </div>
      </div>
    </motion.div>
  );
});
