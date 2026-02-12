import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, Siren, AlertTriangle, XCircle, PlusCircle, Copy, CheckCircle2 } from 'lucide-react';
import { DuplicateSku, Summary } from '@/lib/types';

interface AuditStatsProps {
    reportSummary: Summary;
    duplicates: DuplicateSku[];
    filter: string;
    isFixing: boolean;
    isAutoRunning: boolean;
    isAutoCreating: boolean;
    fileName: string;
    autoFixProgress?: { done: number; total: number } | null;
    autoCreateProgress?: { done: number; total: number } | null;
}

export function AuditStats({ reportSummary, duplicates, filter, isFixing, isAutoRunning, isAutoCreating, fileName, autoFixProgress, autoCreateProgress }: AuditStatsProps) {
    const totalIssues = reportSummary.mismatched + reportSummary.missing_in_shopify +
        reportSummary.not_in_csv + (reportSummary.duplicate_in_shopify || 0);
    const totalAudited = totalIssues + reportSummary.matched;
    const healthPercent = totalAudited > 0 ? Math.round((reportSummary.matched / totalAudited) * 100) : 100;

    const pct = (n: number) => totalAudited > 0 ? ((n / totalAudited) * 100).toFixed(1) : '0';

    const healthColor = healthPercent >= 95 ? 'text-green-500' : healthPercent >= 80 ? 'text-yellow-500' : 'text-red-500';
    const healthBg = healthPercent >= 95 ? 'bg-green-500' : healthPercent >= 80 ? 'bg-yellow-500' : 'bg-red-500';

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
                    <div className="min-w-[200px] rounded-md border border-green-500/20 bg-green-500/10 p-3">
                        <div className="flex items-center gap-2 text-sm text-green-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Auto-Fix running
                        </div>
                        {autoFixProgress && (
                            <div className="mt-2">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-green-500/20">
                                    <div
                                        className="h-full rounded-full bg-green-500 transition-all duration-300"
                                        style={{ width: `${autoFixProgress.total > 0 ? (autoFixProgress.done / autoFixProgress.total) * 100 : 0}%` }}
                                    />
                                </div>
                                <p className="mt-1 text-xs text-green-500/80">
                                    Fixed {autoFixProgress.done} of {autoFixProgress.total}
                                </p>
                            </div>
                        )}
                    </div>
                )}
                {isAutoCreating && (
                    <div className="min-w-[200px] rounded-md border border-blue-500/20 bg-blue-500/10 p-3">
                        <div className="flex items-center gap-2 text-sm text-blue-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Auto-Create running
                        </div>
                        {autoCreateProgress && (
                            <div className="mt-2">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-500/20">
                                    <div
                                        className="h-full rounded-full bg-blue-500 transition-all duration-300"
                                        style={{ width: `${autoCreateProgress.total > 0 ? (autoCreateProgress.done / autoCreateProgress.total) * 100 : 0}%` }}
                                    />
                                </div>
                                <p className="mt-1 text-xs text-blue-500/80">
                                    Created {autoCreateProgress.done} of {autoCreateProgress.total}
                                </p>
                            </div>
                        )}
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

            {/* Health Score Bar */}
            <div className="mt-4 rounded-lg border bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className={`h-5 w-5 ${healthColor}`} />
                        <span className="font-medium">Store Health</span>
                    </div>
                    <span className={`text-2xl font-bold ${healthColor}`}>{healthPercent}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${healthBg}`}
                        style={{ width: `${healthPercent}%` }}
                    />
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>{reportSummary.matched.toLocaleString()} matched</span>
                    <span>{totalIssues.toLocaleString()} issues</span>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 pt-3 md:grid-cols-4">
                <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-500" />
                    <div>
                        <div className="text-xl font-bold">{reportSummary.mismatched.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">
                            Mismatched <span className="opacity-60">({pct(reportSummary.mismatched)}%)</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                    <XCircle className="h-5 w-5 shrink-0 text-red-500" />
                    <div>
                        <div className="text-xl font-bold">{reportSummary.missing_in_shopify.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">
                            Missing <span className="opacity-60">({pct(reportSummary.missing_in_shopify)}%)</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                    <PlusCircle className="h-5 w-5 shrink-0 text-blue-500" />
                    <div>
                        <div className="text-xl font-bold">{reportSummary.not_in_csv.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">
                            Not in CSV <span className="opacity-60">({pct(reportSummary.not_in_csv)}%)</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
                    <Copy className="h-5 w-5 shrink-0 text-purple-500" />
                    <div>
                        <div className="text-xl font-bold">{(reportSummary.duplicate_in_shopify || 0).toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">
                            Duplicates <span className="opacity-60">({pct(reportSummary.duplicate_in_shopify || 0)}%)</span>
                        </div>
                    </div>
                </div>
            </div>
        </CardHeader>
    );
}
