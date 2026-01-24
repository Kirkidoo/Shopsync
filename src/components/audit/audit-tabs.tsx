import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Download } from 'lucide-react';
import { FilterType } from '@/hooks/use-audit-data';
import { Summary } from '@/lib/types';

interface AuditTabsProps {
  filter: FilterType;
  setFilter: (f: FilterType) => void;
  reportSummary: Summary;
  handleKeysLength: number;
  onReset: () => void;
  onRefresh: () => void;
  handleDownload: () => void;
  showRefresh: boolean;
  isFixing: boolean;
  isAutoRunning: boolean;
  isAutoCreating: boolean;
}

export function AuditTabs({
  filter,
  setFilter,
  reportSummary,
  handleKeysLength,
  onReset,
  onRefresh,
  handleDownload,
  showRefresh,
  isFixing,
  isAutoRunning,
  isAutoCreating,
}: AuditTabsProps) {
  return (
    <div className="mb-4 flex flex-col items-center justify-between gap-4 sm:flex-row">
      <Tabs
        value={filter}
        onValueChange={(v) => setFilter(v as FilterType)}
        className="w-full sm:w-auto"
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="all">All Items ({handleKeysLength})</TabsTrigger>
          <TabsTrigger value="mismatched" className="relative">
            Mismatched
            {reportSummary.mismatched > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
                {reportSummary.mismatched}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="missing_in_shopify" className="relative">
            Missing
            {reportSummary.missing_in_shopify > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
                {reportSummary.missing_in_shopify}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="not_in_csv" className="relative">
            Not in CSV
            {reportSummary.not_in_csv > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {reportSummary.not_in_csv}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="duplicate_in_shopify" className="relative">
            Duplicates
            {reportSummary.duplicate_in_shopify > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {reportSummary.duplicate_in_shopify}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="tag_updates" className="relative">
            Tag Manager
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={onReset}
          disabled={isFixing || isAutoRunning || isAutoCreating}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          New Audit
        </Button>
        {showRefresh && (
          <Button
            variant="secondary"
            onClick={onRefresh}
            disabled={isFixing || isAutoRunning || isAutoCreating}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Data
          </Button>
        )}
        <Button onClick={handleDownload} disabled={isFixing || isAutoRunning || isAutoCreating}>
          <Download className="mr-2 h-4 w-4" />
          Download Report
        </Button>
      </div>
    </div>
  );
}
