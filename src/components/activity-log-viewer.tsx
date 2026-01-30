'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { fetchActivityLogs, clearActivityLogs } from '@/app/actions';
import { Loader2, Trash2, RefreshCw, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { logger } from '@/lib/logger';
import { LogEntry } from '@/lib/types';

const getIcon = (level: string) => {
  switch (level) {
    case 'ERROR':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'SUCCESS':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'WARN':
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
};

const getVariant = (level: string) => {
  switch (level) {
    case 'ERROR':
      return 'destructive';
    case 'SUCCESS':
      return 'default'; // Greenish usually, or use custom class
    case 'WARN':
      return 'secondary';
    default:
      return 'outline';
  }
};

const ActivityLogItem = memo(({ log }: { log: LogEntry }) => {
  return (
    <div className="flex flex-col gap-1 border-b pb-2 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getIcon(log.level)}
          <span className="text-sm font-semibold">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <Badge variant={getVariant(log.level) as any}>{log.level}</Badge>
        </div>
      </div>
      <p className="pl-6 text-sm text-foreground/90">{log.message}</p>
      {log.details && (
        <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 pl-6 text-xs">
          {JSON.stringify(log.details, null, 2)}
        </pre>
      )}
    </div>
  );
});

ActivityLogItem.displayName = 'ActivityLogItem';

export function ActivityLogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const logsRef = useRef(logs); // Optimization: Store latest logs for polling without stale closures

  // Keep ref in sync
  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  const loadLogs = useCallback(
    async (isPoll = false) => {
      if (!isPoll) setLoading(true);
      try {
        const lastId = isPoll ? logsRef.current[0]?.id : undefined;
        const result = await fetchActivityLogs(lastId);

        if (!result) return; // No changes or null

        if (Array.isArray(result)) {
          // Full replace
          setLogs(result as LogEntry[]);
        } else if (result && 'method' in result) {
          if (result.method === 'replace') {
            setLogs(result.logs as LogEntry[]);
          } else if (result.method === 'incremental') {
            // Deduplicate by ID when merging incrementally
            setLogs((prev) => {
              const existingIds = new Set(prev.map(log => log.id));
              const newLogs = (result.logs as LogEntry[]).filter(log => !existingIds.has(log.id));
              return [...newLogs, ...prev];
            });
          }
        }
      } catch (error) {
        logger.error('Failed to load logs', error);
      } finally {
        if (!isPoll) setLoading(false);
      }
    },
    [] // Dependencies are intentionally empty or stable; using ref for mutable data
  );

  const handleClearLogs = async () => {
    await clearActivityLogs();
    setLogs([]);
  };

  useEffect(() => {
    loadLogs();
    const interval = setInterval(() => {
      if (autoRefresh) {
        loadLogs(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadLogs]);

  return (
    <Card className="mt-8 w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-medium">Activity Logs</CardTitle>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'bg-green-100 dark:bg-green-900' : ''}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refresh On' : 'Auto-refresh Off'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => loadLogs(false)} disabled={loading}>
            Refresh
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all logs?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to clear all logs? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearLogs}>Clear Logs</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full rounded-md border p-4">
          {logs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No logs found.
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <ActivityLogItem key={log.id} log={log} />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
