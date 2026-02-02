import { MismatchDetail } from '@/lib/types';
import { AlertTriangle, Check, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MismatchDetailsProps {
  mismatches: MismatchDetail[];
  onFix: (fixType: MismatchDetail['field']) => void;
  onMarkAsFixed: (fixType: MismatchDetail['field']) => void;
  disabled: boolean;
  sku: string;
}

export const MismatchDetails = ({
  mismatches,
  onFix,
  onMarkAsFixed,
  disabled,
  sku,
}: MismatchDetailsProps) => {
  return (
    <div className="mt-2 flex flex-col gap-2">
      {mismatches.map((mismatch, index) => {
        const canBeFixed =
          mismatch.field !== 'duplicate_in_shopify' && mismatch.field !== 'heavy_product_flag';

        return (
          <div
            key={`${sku}-${mismatch.field}-${index}`}
            className="flex items-center gap-2 rounded-md bg-yellow-50 p-2 text-xs dark:bg-yellow-900/20"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
            <div className="flex-grow">
              <span className="font-semibold capitalize">
                {mismatch.field.replace(/_/g, ' ')}:{' '}
              </span>
              {mismatch.field === 'h1_tag' && (
                <span className="text-muted-foreground">
                  Product description contains an H1 tag.
                </span>
              )}
              {mismatch.field === 'duplicate_in_shopify' && (
                <span className="text-muted-foreground">SKU exists multiple times in Shopify.</span>
              )}
              {mismatch.field === 'heavy_product_flag' && (
                <span className="text-muted-foreground">
                  Product is over 50lbs ({mismatch.csvValue}).
                </span>
              )}

              {mismatch.field === 'clearance_price_mismatch' && (
                <span className="text-muted-foreground">
                  Price equals Compare At Price. Not a valid clearance item.
                </span>
              )}
              {mismatch.field !== 'h1_tag' &&
                mismatch.field !== 'duplicate_in_shopify' &&
                mismatch.field !== 'heavy_product_flag' &&
                mismatch.field !== 'clearance_price_mismatch' && (
                  <>
                    <span className="mr-2 text-red-500 line-through">
                      {mismatch.shopifyValue ?? 'N/A'}
                    </span>
                    <span className="text-green-500">{mismatch.csvValue ?? 'N/A'}</span>
                  </>
                )}
            </div>
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => onMarkAsFixed(mismatch.field)}
                      disabled={disabled}
                      aria-label="Mark as fixed"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Mark as fixed (hide from report)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {canBeFixed && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => onFix(mismatch.field)}
                  disabled={disabled}
                >
                  <Wrench className="mr-1.5 h-3.5 w-3.5" />
                  Fix
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
