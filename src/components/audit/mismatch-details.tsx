import { MismatchDetail } from '@/lib/types';
import { AlertTriangle, Check, Wrench, ArrowRight } from 'lucide-react';
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
        <div className="flex flex-col gap-1.5 mt-1.5 w-full">
            {mismatches.map((mismatch, index) => {
                const canBeFixed =
                    mismatch.field !== 'duplicate_in_shopify' && mismatch.field !== 'heavy_product_flag';

                return (
                    <div
                        key={`${sku}-${mismatch.field}-${index}`}
                        className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-y-2 rounded-md bg-muted/30 px-3 py-2 text-sm border border-muted/50 transition-colors hover:bg-muted/50"
                    >
                        <div className="flex items-center gap-3 overflow-hidden">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />
                            <span className="font-medium text-foreground capitalize truncate w-[160px] shrink-0">
                                {mismatch.field.replace(/_/g, ' ')}
                            </span>

                            <div className="flex items-center gap-2 overflow-hidden">
                                {mismatch.field === 'h1_tag' && (
                                    <span className="text-muted-foreground text-xs truncate">
                                        Product description contains an H1 tag.
                                    </span>
                                )}
                                {mismatch.field === 'duplicate_in_shopify' && (
                                    <span className="text-muted-foreground text-xs truncate">SKU exists multiple times in Shopify.</span>
                                )}
                                {mismatch.field === 'heavy_product_flag' && (
                                    <span className="text-muted-foreground text-xs truncate">
                                        Product is over 50lbs ({mismatch.csvValue}).
                                    </span>
                                )}
                                {mismatch.field === 'clearance_price_mismatch' && (
                                    <span className="text-muted-foreground text-xs truncate">
                                        Price equals Compare At Price. Not a valid clearance item.
                                    </span>
                                )}
                                {mismatch.field !== 'h1_tag' &&
                                    mismatch.field !== 'duplicate_in_shopify' &&
                                    mismatch.field !== 'heavy_product_flag' &&
                                    mismatch.field !== 'clearance_price_mismatch' && (
                                        <div className="flex items-center gap-3 text-xs font-mono shrink-0">
                                            <span className="text-red-500 line-through decoration-red-500/50 decoration-2">
                                                {mismatch.shopifyValue ?? 'N/A'}
                                            </span>
                                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-green-500 font-semibold bg-green-500/10 px-1.5 py-0.5 rounded">
                                                {mismatch.csvValue ?? 'N/A'}
                                            </span>
                                        </div>
                                    )}
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 ml-auto shrink-0 pl-2">
                            {canBeFixed && (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 text-xs px-3"
                                    onClick={() => onFix(mismatch.field)}
                                    disabled={disabled}
                                >
                                    <Wrench className="mr-1.5 h-3 w-3" />
                                    Fix
                                </Button>
                            )}
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 w-7 p-0"
                                            onClick={() => onMarkAsFixed(mismatch.field)}
                                            disabled={disabled}
                                            aria-label="Mark as fixed"
                                        >
                                            <Check className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Mark as fixed (hide from report)</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
