'use server';

import { getLogs, getLogsSince, clearLogs } from '@/services/logger';

export async function fetchActivityLogs(lastKnownId?: string) {
    if (lastKnownId) {
        return await getLogsSince(lastKnownId);
    }
    return await getLogs();
}

export async function clearActivityLogs() {
    return await clearLogs();
}
