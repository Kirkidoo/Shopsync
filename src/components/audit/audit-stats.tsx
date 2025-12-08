import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, Siren, AlertTriangle, XCircle, PlusCircle, Copy } from 'lucide-react';
import { DuplicateSku, Summary } from '@/lib/types';

interface AuditStatsProps {
    reportSummary: Summary;
    duplicates: DuplicateSku[];
    filter: string;
    isFixing: boolean;
    isAutoRunning: boolean;
    isAutoCreating: boolean;
    fileName: string;
}

export function AuditStats({ reportSummary, duplicates, filter, isFixing, isAutoRunning, isAutoCreating, fileName }: AuditStatsProps) {
    return (
        <CardHeader>
            <div className="flex items-start justify-between">
                <div>
                    <CardTitle>Audit Report</CardTitle>
                    <CardDescription>
                        {filter === 'duplicate_in_shopify'
                            ? 'SKUs that are incorrectly used across multiple products in your Shopify store.'
                            : 'Comparison of product data between your CSV file and Shopify. Products are grouped by handle.'}
                    </CardDescription>
                    <div className="mt-2 flex items-center text-sm text-muted-foreground">
                        <span className="font-medium">Auditing File:</span>
                        <code className="ml-2 rounded-md bg-primary/10 px-2 py-1 text-primary">
                            {fileName}
                        </code>
                    </div>
                </div>
                {isFixing && !isAutoRunning && !isAutoCreating && (
                    <div className="flex items-center gap-2 rounded-md bg-card-foreground/5 p-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Applying changes...
                    </div>
                )}
                {isAutoRunning && (
                    <div className="flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/10 p-2 text-sm text-green-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Auto-Fix is running...
                    </div>
                )}
                {isAutoCreating && (
                    <div className="flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/10 p-2 text-sm text-blue-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Auto-Create is running...
                    </div>
                )}
            </div>

            {duplicates.length > 0 && filter !== 'duplicate_in_shopify' && (
                <Alert variant="destructive" className="mt-4">
                    <Siren className="h-4 w-4" />
                    <AlertTitle>Duplicate SKUs Found in Shopify!</AlertTitle>
                    <AlertDescription>
                        Your Shopify store contains {duplicates.length} SKUs that are assigned to multiple
                        products. This can cause issues with inventory and order fulfillment. View them in
                        the &apos;Duplicate in Shopify&apos; tab.
                    </AlertDescription>
                </Alert>
            )}
            <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-4">
                <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                    <AlertTriangle className="h-6 w-6 shrink-0 text-yellow-500" />
                    <div>
                        <div className="text-xl font-bold">{reportSummary.mismatched}</div>
                        <div className="text-xs text-muted-foreground">SKUs Mismatched</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                    <XCircle className="h-6 w-6 shrink-0 text-red-500" />
                    <div>
                        <div className="text-xl font-bold">{reportSummary.missing_in_shopify}</div>
                        <div className="text-xs text-muted-foreground">SKUs Missing in Shopify</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                    <PlusCircle className="h-6 w-6 shrink-0 text-blue-500" />
                    <div>
                        <div className="text-xl font-bold">{reportSummary.not_in_csv}</div>
                        <div className="text-xs text-muted-foreground">SKUs Not in CSV</div>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                    <Copy className="h-6 w-6 shrink-0 text-purple-500" />
                    <div>
                        <div className="text-xl font-bold">{reportSummary.duplicate_in_shopify || 0}</div>
                        <div className="text-xs text-muted-foreground">Duplicate SKUs in Shopify</div>
                    </div>
                </div>
            </div>
        </CardHeader>
    );
}
