'use server';

import * as ftpService from '@/services/ftp';
import { getShopifyLocations } from '@/lib/shopify';

import { env } from '@/lib/env';

export async function connectToFtp(data: FormData) {
    return await ftpService.connectToFtp(data);
}

export async function listCsvFiles(data: FormData) {
    return await ftpService.listCsvFiles(data);
}

export async function getFtpCredentials() {
    const defaultHost = 'ftp.gammapowersports.com';
    return {
        host: env.FTP_HOST || env.NEXT_PUBLIC_FTP_HOST || defaultHost,
        username: env.FTP_USER || env.NEXT_PUBLIC_FTP_USERNAME || '',
        password: env.FTP_PASSWORD || env.NEXT_PUBLIC_FTP_PASSWORD || '',
    };
}

export async function getAvailableLocations() {
    return await getShopifyLocations();
}
