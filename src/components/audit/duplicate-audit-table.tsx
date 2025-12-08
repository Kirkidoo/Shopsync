import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Product, AuditResult } from '@/lib/types';

interface DuplicateAuditTableProps {
    paginatedHandleKeys: string[];
    groupedBySku: Record<string, Product[]>;
    data: AuditResult[];
    statusConfig: any;
    isFixing: boolean;
    isAutoRunning: boolean;
    handleDeleteProduct: (item: AuditResult, product?: Product) => void;
}

export function DuplicateAuditTable({
    paginatedHandleKeys,
    groupedBySku,
    data,
    statusConfig,
    isFixing,
    isAutoRunning,
    handleDeleteProduct,
}: DuplicateAuditTableProps) {
    return (
        <Accordion type="single" collapsible className="w-full">
            {paginatedHandleKeys.map((sku) => {
                const products = groupedBySku[sku];
                if (!products || products.length === 0) return null;

                const issueItem = data.find(
                    (item) => item.sku === sku && item.status === 'duplicate_in_shopify'
                );
                if (!issueItem) return null;

                const config = statusConfig.duplicate_in_shopify;

                return (
                    <AccordionItem value={sku} key={sku} className="border-b last:border-b-0">
                        <AccordionTrigger className="p-3 text-left" disabled={isFixing || isAutoRunning}>
                            <div className="flex flex-grow items-center gap-4">
                                <config.icon className="h-5 w-5 shrink-0 text-purple-500" />
                                <div className="flex-grow text-left">
                                    <p className="font-semibold">SKU: {sku}</p>
                                    <p className="text-sm text-muted-foreground">
                                        This SKU is used in {products.length} different products.
                                    </p>
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product Title / Handle</TableHead>
                                        <TableHead>Price</TableHead>
                                        <TableHead>Stock</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {products.map((product) => {
                                        const auditInfo = data.find(
                                            (r) => r.shopifyProducts[0]?.variantId === product.variantId
                                        );
                                        const hasMismatches =
                                            auditInfo &&
                                            auditInfo.status === 'mismatched' &&
                                            auditInfo.mismatches.length > 0;

                                        return (
                                            <TableRow
                                                key={product.variantId}
                                                className={hasMismatches ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''}
                                            >
                                                <TableCell>
                                                    <div className="font-medium">{product.name}</div>
                                                    <div className="font-mono text-xs text-muted-foreground">
                                                        {product.handle}
                                                    </div>
                                                </TableCell>
                                                <TableCell>${product.price.toFixed(2)}</TableCell>
                                                <TableCell>{product.inventory ?? 'N/A'}</TableCell>
                                                <TableCell>
                                                    {hasMismatches ? (
                                                        <Badge variant="outline" className={statusConfig.mismatched.badgeClass}>
                                                            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                                                            Mismatched
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline">Matched</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                disabled={isFixing || isAutoRunning}
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" /> Delete Product
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Delete this product?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    This will permanently delete the product &quot;{product.name}&quot; (handle:{' '}
                                                                    {product.handle}) from Shopify. This action cannot be undone.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction
                                                                    onClick={() => handleDeleteProduct(issueItem, product)}
                                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                >
                                                                    Yes, delete product
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </AccordionContent>
                    </AccordionItem>
                );
            })}
        </Accordion>
    );
}
