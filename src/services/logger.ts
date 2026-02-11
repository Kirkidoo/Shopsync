import fs from 'fs/promises';
import path from 'path';
import { logger } from '@/lib/logger';
import { LogEntry } from '@/lib/types';



const LOG_FILE_PATH = path.join(process.cwd(), '.cache', 'activity-logs.json');

async function ensureLogFile() {
  try {
    await fs.access(LOG_FILE_PATH);
  } catch {
    const dir = path.dirname(LOG_FILE_PATH);
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(LOG_FILE_PATH, JSON.stringify([]));
  }
}

export async function log(level: LogEntry['level'], message: string, details?: any) {
  await ensureLogFile();
  try {
    const content = await fs.readFile(LOG_FILE_PATH, 'utf-8');
    let logs: LogEntry[] = [];
    try {
      logs = JSON.parse(content);
    } catch (e) {
      // If file is corrupted, start fresh
      logs = [];
    }

    const newEntry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
    };

    // Keep only the last 1000 logs to prevent infinite growth
    const updatedLogs = [newEntry, ...logs].slice(0, 1000);

    await fs.writeFile(LOG_FILE_PATH, JSON.stringify(updatedLogs, null, 2));
  } catch (error) {
    logger.error('Failed to write to log file:', error);
  }
}

export async function getLogs(): Promise<LogEntry[]> {
  await ensureLogFile();
  try {
    const content = await fs.readFile(LOG_FILE_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    logger.error('Failed to read logs:', error);
    return [];
  }
}

export async function getLogsSince(lastKnownId: string): Promise<{ logs: LogEntry[], method: 'incremental' | 'replace' } | null> {
  await ensureLogFile();
  try {
    const content = await fs.readFile(LOG_FILE_PATH, 'utf-8');
    const allLogs: LogEntry[] = JSON.parse(content);

    if (allLogs.length === 0) {
      return { logs: [], method: 'replace' };
    }

    if (allLogs[0].id === lastKnownId) {
      return null;
    }

    const lastKnownIndex = allLogs.findIndex(log => log.id === lastKnownId);

    if (lastKnownIndex === -1) {
      return { logs: allLogs, method: 'replace' };
    }

    return { logs: allLogs.slice(0, lastKnownIndex), method: 'incremental' };
  } catch (error) {
    logger.error('Failed to read logs:', error);
    return { logs: [], method: 'replace' };
  }
}

export async function clearLogs() {
  await ensureLogFile();
  await fs.writeFile(LOG_FILE_PATH, JSON.stringify([]));
}
