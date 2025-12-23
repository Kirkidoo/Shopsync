
import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'ERROR' | 'WARN' | 'SUCCESS';
  message: string;
  details?: any;
}

interface ActivityLogItemProps {
  log: LogEntry;
}

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
      return 'default';
    case 'WARN':
      return 'secondary';
    default:
      return 'outline';
  }
};

export const ActivityLogItem = memo(({ log }: ActivityLogItemProps) => {
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
