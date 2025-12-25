'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchActivityLogs, clearActivityLogs } from '@/app/actions';
import { Loader2, Trash2, RefreshCw } from 'lucide-react';
import { logger } from '@/lib/logger';
import { LogEntry } from '@/lib/types';
import { ActivityLogItem } from '@/components/activity-log-item';

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
            setLogs((prev) => [...(result.logs as LogEntry[]), ...prev]);
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
    if (confirm('Are you sure you want to clear all logs?')) {
      await clearActivityLogs();
      setLogs([]);
    }
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
          <Button variant="destructive" size="sm" onClick={handleClearLogs}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
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
