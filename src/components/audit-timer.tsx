'use client';

import { useState, useEffect } from 'react';

interface AuditTimerProps {
  startTime: number;
}

export function AuditTimer({ startTime }: AuditTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    // Initial update
    setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mb-6 flex flex-col items-center gap-1">
      <div className="text-3xl font-bold font-mono text-foreground">
        {formatTime(elapsedSeconds)}
      </div>
      <span className="text-xs uppercase tracking-widest text-muted-foreground">Time Elapsed</span>
    </div>
  );
}
