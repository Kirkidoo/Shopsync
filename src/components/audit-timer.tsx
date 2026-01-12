import { useState, useEffect, memo } from 'react';

interface AuditTimerProps {
  isRunning: boolean;
}

export const AuditTimer = memo(function AuditTimer({ isRunning }: AuditTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      setElapsed(0);
      return;
    }

    const start = Date.now();
    setElapsed(0);

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mb-6 flex flex-col items-center gap-1">
      <div className="text-3xl font-bold font-mono text-foreground">
        {formatTime(elapsed)}
      </div>
      <span className="text-xs uppercase tracking-widest text-muted-foreground">Time Elapsed</span>
    </div>
  );
});
