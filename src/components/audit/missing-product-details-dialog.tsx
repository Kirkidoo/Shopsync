import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Eye } from 'lucide-react';
import { Product } from '@/lib/types';

export const MissingProductDetailsDialog = ({ product }: { product: Product }) => {
    const dataMap: { label: string; value: any; notes?: string }[] = [
        // Product Level
        { label: 'Shopify Product Title', value: product.name, notes: "From 'Title' column" },
        { label: 'Shopify Product Handle', value: product.handle, notes: "From 'Handle' column" },
        {
            label: 'Product Description',
            value: product.descriptionHtml || 'N/A',
            notes: "From 'Body (HTML)' column. H1 tags will be converted to H2.",
        },
        { label: 'Vendor', value: product.vendor, notes: "From 'Vendor' column" },
        { label: 'Product Type', value: product.productType, notes: "From 'Tags' column (3rd tag)" },
        {
            label: 'Collection',
            value: product.category,
            notes: "From 'Category' column. Will be linked to a collection with this title.",
        },
        {
            label: 'Tags',
            value: 'N/A',
            notes: "'Clearance' tag added if filename contains 'clearance'",
        },

        // Variant Level
        { label: 'Variant SKU', value: product.sku, notes: "From 'SKU' column" },
        {
            label: 'Variant Image',
            value: product.mediaUrl,
            notes: "From 'Variant Image' column. Will be assigned to this variant.",
        },
        {
            label: 'Variant Price',
            value: `$${product.price?.toFixed(2)}`,
            notes: "From 'Price' column",
        },
        {
            label: 'Variant Compare At Price',
            value: product.compareAtPrice ? `$${product.compareAtPrice.toFixed(2)}` : 'N/A',
            notes: "From 'Compare At Price' column",
        },
        {
            label: 'Variant Cost',
            value: product.costPerItem ? `$${product.costPerItem.toFixed(2) ?? 'N/A'}` : 'N/A',
            notes: "From 'Cost Per Item' column",
        },
        {
            label: 'Variant Barcode (GTIN)',
            value: product.barcode || 'N/A',
            notes: "From 'Variant Barcode' column",
        },
        {
            label: 'Variant Inventory',
            value: product.inventory,
            notes: "From 'Variant Inventory Qty'. Will be set at 'Gamma Warehouse' location.",
        },

        // Options
        {
            label: 'Option 1',
            value: product.option1Name ? `${product.option1Name}: ${product.option1Value}` : 'N/A',
            notes: "From 'Option1 Name' and 'Option1 Value'",
        },
        {
            label: 'Option 2',
            value: product.option2Name ? `${product.option2Name}: ${product.option2Value}` : 'N/A',
            notes: "From 'Option2 Name' and 'Option2 Value'",
        },
        {
            label: 'Option 3',
            value: product.option3Name ? `${product.option3Name}: ${product.option3Value}` : 'N/A',
            notes: "From 'Option3 Name' and 'Option3 Value'",
        },
    ];

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7">
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    View Details
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Product Creation Preview</DialogTitle>
                    <DialogDescription>
                        This is the data that will be sent to Shopify to create the new product variant with
                        SKU: <span className="font-bold text-foreground">{product.sku}</span>
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto pr-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-1/3">Shopify Field</TableHead>
                                <TableHead>Value from FTP File</TableHead>
                                <TableHead>Notes / Source Column</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {dataMap.map(({ label, value, notes }) => (
                                <TableRow key={label}>
                                    <TableCell className="font-medium">{label}</TableCell>
                                    <TableCell>
                                        {typeof value === 'string' && value.startsWith('http') ? (
                                            <a
                                                href={value}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block max-w-xs truncate text-primary underline hover:text-primary/80"
                                            >
                                                {value}
                                            </a>
                                        ) : (
                                            <span className="truncate">{value ?? 'N/A'}</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{notes}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>
        </Dialog>
    );
};
