import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Product } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CsvShopifyComparisonProps {
  csvProduct: Product;
  shopifyProduct?: Product;
}

export function CsvShopifyComparison({ csvProduct, shopifyProduct }: CsvShopifyComparisonProps) {
  if (!csvProduct.rawCsvData) {
    return <div className="p-4 text-muted-foreground">No CSV data available for this item.</div>;
  }

  const rawData = csvProduct.rawCsvData;
  const keys = Object.keys(rawData);

  // Helper to get Shopify value roughly mapping to CSV key (heuristic)
  // This is tricky because CSV keys are arbitrary.
  // We can try to map known keys, or just show Shopify Product JSON dump or specific fields if they match?
  // The user asked: "produce every product in the csv file and compare them with the product in shopify. I would need to see all the column info from the csv file and compare with what I have with shopify."
  // So we assume the user wants to see the CSV column, and IF we can map it, the Shopify value.
  // For now, let's list all CSV columns.
  // We can try to fuzzy match or just show relevant Shopify fields if we know them.

  const getShopifyValue = (key: string): string | number | null | undefined => {
    const k = key.toLowerCase();
    if (!shopifyProduct) return null;

    if (k.includes('sku')) return shopifyProduct.sku;
    if (k.includes('price') && !k.includes('compare')) return shopifyProduct.price;
    if (k.includes('compare')) return shopifyProduct.compareAtPrice;
    if (k.includes('inventory') || k.includes('qty')) return shopifyProduct.inventory;
    if (k === 'title' || k === 'name') return shopifyProduct.name;
    if (k.includes('vendor')) return shopifyProduct.vendor;
    if (k.includes('type')) return shopifyProduct.productType;
    if (k.includes('tags')) return shopifyProduct.tags;
    if (k.includes('barcode')) return shopifyProduct.barcode;
    if (k.includes('weight') || k.includes('grams')) return shopifyProduct.weight;

    return null;
    // We could return "N/A" or leave blank if no direct mapping
  };

  return (
    <div className="mt-4 rounded-md border">
      <div className="border-b bg-muted/50 px-4 py-2 text-sm font-medium">Full CSV Comparison</div>
      <ScrollArea className="h-[300px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">CSV Column</TableHead>
              <TableHead className="w-[300px]">CSV Value</TableHead>
              <TableHead className="w-[300px]">Shopify Value (Mapped)</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => {
              const csvVal = rawData[key];
              const shopifyVal = getShopifyValue(key);

              // Simple check for equality if shopify value exists
              // Note: CSV values are strings usually. Shopify values are mixed.
              let isMatch = true;
              let isMapped = shopifyVal !== null && shopifyVal !== undefined;

              if (isMapped && shopifyProduct) {
                // loose comparison
                if (
                  String(csvVal).trim().toLowerCase() !== String(shopifyVal).trim().toLowerCase()
                ) {
                  // Try numeric comparison if both look like numbers
                  const n1 = parseFloat(String(csvVal));
                  const n2 = parseFloat(String(shopifyVal));
                  if (!isNaN(n1) && !isNaN(n2)) {
                    if (Math.abs(n1 - n2) > 0.01) isMatch = false;
                  } else {
                    isMatch = false;
                  }
                }
              }

              return (
                <TableRow key={key}>
                  <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                    {key}
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate text-sm" title={String(csvVal)}>
                    {csvVal}
                  </TableCell>
                  <TableCell
                    className="max-w-[300px] truncate text-sm text-muted-foreground"
                    title={String(shopifyVal ?? '')}
                  >
                    {isMapped ? String(shopifyVal) : '-'}
                  </TableCell>
                  <TableCell>
                    {isMapped ? (
                      isMatch ? (
                        <Badge
                          variant="outline"
                          className="border-green-200 bg-green-50 text-green-700"
                        >
                          Match
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-yellow-200 bg-yellow-50 text-yellow-700"
                        >
                          Diff
                        </Badge>
                      )
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
