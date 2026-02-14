import { Client } from 'basic-ftp';
import { Readable, Writable } from 'stream';
import { logger } from '@/lib/logger';
import * as dns from 'dns';
import * as net from 'net';

const FTP_DIRECTORY = process.env.FTP_DIRECTORY || '/Gamma_Product_Files/Shopify_Files/';

export async function getFtpClient(data: FormData) {
  const host = data.get('host') as string;
  const user = data.get('username') as string;
  const password = data.get('password') as string;

  await validateFtpHost(host);

  // Sentinel Security Fix: Allow insecure FTP only if explicitly enabled.
  const allowInsecure = process.env.ALLOW_INSECURE_FTP === 'true';

  const client = new Client(30000); // 30 second timeout
  // client.ftp.verbose = true;
  try {
    // First, try a secure connection
    logger.info('Attempting secure FTP connection...');
    await client.access({ host, user, password, secure: true });
    logger.info('Secure FTP connection successful.');
  } catch (secureErr) {
    logger.info('Secure FTP connection failed.', secureErr);

    // Sentinel Security Fix: Removed automatic fallback to non-secure FTP.
    // Downgrade attacks can intercept the secure handshake and force the client
    // to send credentials in cleartext.

    if (allowInsecure) {
      logger.warn('⚠️ SECURITY WARNING: Falling back to non-secure FTP because ALLOW_INSECURE_FTP is enabled.');
      // If secure fails, close the potentially broken connection and try non-secure
      client.close();
      const nonSecureClient = new Client(30000); // 30 second timeout
      try {
        logger.info('Attempting non-secure FTP connection...');
        await nonSecureClient.access({ host, user, password, secure: false });
        logger.info('Non-secure FTP connection successful.');
        return nonSecureClient;
      } catch (nonSecureErr) {
        logger.error('Non-secure FTP connection also failed.', nonSecureErr);
        throw new Error('Invalid FTP credentials or failed to connect (Secure & Insecure).');
      }
    }

    client.close();
    throw new Error('Secure FTP connection failed. Automatic fallback to insecure FTP is disabled for security.');
  }
  return client;
}

export async function connectToFtp(data: FormData) {
  const client = await getFtpClient(data);
  client.close();
  return { success: true };
}

export async function listCsvFiles(data: FormData) {
  logger.info('Listing CSV files from FTP...');
  const client = await getFtpClient(data);
  try {
    await client.cd(FTP_DIRECTORY);
    const files = await client.list();
    const csvFiles = files
      .filter((file: any) => file.name.toLowerCase().endsWith('.csv'))
      .map((file: any) => ({
        name: file.name,
        size: file.size,
        modifiedAt: file.modifiedAt,
      }));
    logger.info(`Found ${csvFiles.length} CSV files.`);
    return csvFiles;
  } catch (error) {
    logger.error('Failed to list CSV files:', error);
    throw error;
  } finally {
    if (!client.closed) {
      client.close();
    }
  }
}

/**
 * Sentinel Security: Validates the FTP host to prevent SSRF and internal network access.
 * Rejects localhost, link-local, and private IP ranges.
 * Uses DNS resolution to detect if a domain or shorthand IP resolves to a private address.
 */
async function validateFtpHost(host: string): Promise<void> {
  // 1. Basic format checks
  if (host.startsWith('file://') || host.includes('..')) {
      throw new Error('Security Error: Invalid host format.');
  }

  // 2. Resolve DNS (Handles domains, IP shorthands like 127.1, hex, etc.)
  // We resolve to IPv4 first, then IPv6 if needed.
  // Note: basic-ftp might connect to IPv6 if available.

  let addresses: string[] = [];
  try {
      // Use dns.promises.lookup which respects OS resolution (including /etc/hosts, but we care more about where it goes)
      // lookup returns the first IP. basic-ftp relies on OS resolution via net.connect.
      // To be safe, we should check what it resolves to.
      const resolved = await dns.promises.lookup(host, { all: true });
      addresses = resolved.map(r => r.address);
  } catch (err) {
      // If it fails to resolve, basic-ftp will also fail, so technically safe from SSRF but better to let it fail naturally or throw.
      // However, if we can't resolve it, we can't validate it.
      // Let's assume if it doesn't resolve, it's not reachable.
      return;
  }

  for (const ip of addresses) {
      if (isPrivateIP(ip)) {
          throw new Error(`Security Error: Host ${host} resolves to restricted IP ${ip}.`);
      }
  }
}

function isPrivateIP(ip: string): boolean {
  if (ip === '::1') return true; // IPv6 Loopback

  if (net.isIPv6(ip)) {
      // Simple check for Unique Local Address (fc00::/7) or Link-Local (fe80::/10)
      // and Loopback (::1)
      if (ip.toLowerCase() === '::1') return true;
      if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return true;
      if (ip.toLowerCase().startsWith('fe80')) return true;
      // Mapped IPv4
      if (ip.toLowerCase().startsWith('::ffff:')) {
          return isPrivateIP(ip.substring(7));
      }
      return false;
  }

  if (net.isIPv4(ip)) {
      const parts = ip.split('.').map(Number);
      const [a, b] = parts;

      // 0.0.0.0/8
      if (a === 0) return true;
      // 127.0.0.0/8 (Loopback)
      if (a === 127) return true;
      // 10.0.0.0/8 (Private)
      if (a === 10) return true;
      // 172.16.0.0/12 (Private)
      if (a === 172 && b >= 16 && b <= 31) return true;
      // 192.168.0.0/16 (Private)
      if (a === 192 && b === 168) return true;
      // 169.254.0.0/16 (Link-local)
      if (a === 169 && b === 254) return true;
  }

  return false;
}

export async function getCsvStreamFromFtp(
  csvFileName: string,
  ftpData: FormData
): Promise<Readable> {
  const client = await getFtpClient(ftpData);
  try {
    logger.info('Navigating to FTP directory:', FTP_DIRECTORY);
    await client.cd(FTP_DIRECTORY);
    logger.info(`Downloading file: ${csvFileName}`);

    // Create a PassThrough stream to pipe the download into
    const passThrough = new Readable({
      read() { },
    });

    // We need to keep the client open while the stream is being read.
    // However, basic-ftp doesn't support returning a stream directly easily without closing the client too early if we await downloadTo.
    // The strategy here is to not await downloadTo fully before returning, OR use a different approach.
    // basic-ftp's downloadTo accepts a Writable.

    // Better approach for basic-ftp to ensure client stays open:
    // We can't easily return a stream and close the client *after* the stream is consumed in this function scope.
    // We will rely on the caller to handle the stream, but we need to manage the client lifecycle.
    // A common pattern is to pass a callback or return a cleanup function, but let's try to adapt to the existing signature.

    // Actually, basic-ftp has a `trackProgress` which might not be enough.
    // Let's use a PassThrough stream and pipe data to it.
    // BUT, we must not close the client until the download is finished.
    // If we return the stream, the download happens asynchronously.

    const { PassThrough } = await import('stream');
    const stream = new PassThrough();

    // Start the download asynchronously
    client.downloadTo(stream, csvFileName).then(
      () => {
        logger.info('File download completed.');
        client.close();
      },
      (err) => {
        logger.error('File download failed:', err);
        stream.destroy(err);
        client.close();
      }
    );

    return stream;
  } catch (error) {
    client.close();
    throw error;
  }
}
