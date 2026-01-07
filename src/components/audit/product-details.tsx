import { Product } from '@/lib/types';
import { DollarSign, List, MapPin } from 'lucide-react';

export const ProductDetails = ({ product }: { product: Product | null }) => {
  if (!product) return null;
  return (
    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <DollarSign className="h-3.5 w-3.5" /> Price:{' '}
        <span className="font-medium text-foreground">${product.price.toFixed(2)}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <List className="h-3.5 w-3.5" /> Stock:{' '}
        <span className="font-medium text-foreground">{product.inventory ?? 'N/A'}</span>
      </span>
      <span className="flex items-center gap-1.5" title={product.locationIds?.join(', ')}>
        <MapPin className="h-3.5 w-3.5" /> Locs: {product.locationIds?.length || 0}
        {product.locationIds?.includes('gid://shopify/Location/86376317245') && (
          <span className="ml-1 font-bold text-blue-500">(Garage)</span>
        )}
      </span>
    </div>
  );
};
