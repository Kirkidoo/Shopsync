'use server';

import * as ftpService from '@/services/ftp';
import { getShopifyLocations } from '@/lib/shopify';

export async function connectToFtp(data: FormData) {
    return await ftpService.connectToFtp(data);
}

export async function listCsvFiles(data: FormData) {
    return await ftpService.listCsvFiles(data);
}

export async function getFtpCredentials() {
    const defaultHost = 'ftp.gammapowersports.com';
    return {
        host: process.env.FTP_HOST || process.env.NEXT_PUBLIC_FTP_HOST || defaultHost,
        username: process.env.FTP_USER || process.env.NEXT_PUBLIC_FTP_USERNAME || '',
        password: process.env.FTP_PASSWORD || process.env.NEXT_PUBLIC_FTP_PASSWORD || '',
    };
}

export async function getAvailableLocations() {
    return await getShopifyLocations();
}
