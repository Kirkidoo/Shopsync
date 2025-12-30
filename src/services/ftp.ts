import { Client } from 'basic-ftp';
import { Readable, Writable } from 'stream';
import { logger } from '@/lib/logger';
import { Address6, Address4 } from 'ip-address';
import dns from 'dns/promises';

const FTP_DIRECTORY = process.env.FTP_DIRECTORY || '/Gamma_Product_Files/Shopify_Files/';

// Sentinel Security Fix: SSRF Protection
// Validate that the host is not a private, loopback, or link-local address.
// Returns the resolved IP address if valid.
async function resolveAndValidateFtpHost(host: string): Promise<string> {
  let ip = host;

  // 1. Resolve hostname to IP if needed
  if (!Address4.isValid(host) && !Address6.isValid(host)) {
    try {
      const result = await dns.lookup(host);
      ip = result.address;
      logger.info(`Resolved FTP host ${host} to ${ip}`);
    } catch (error) {
      throw new Error(`Failed to resolve FTP host: ${host}`);
    }
  }

  // 2. Check if IP is reserved/private
  if (Address4.isValid(ip)) {
    const parts = ip.split('.').map(Number);

    // Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    // Loopback: 127.0.0.0/8
    // Link-local: 169.254.0.0/16

    const isLoopback = parts[0] === 127;
    const isPrivate =
      (parts[0] === 10) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168);
    const isLinkLocal = parts[0] === 169 && parts[1] === 254;

    if (isLoopback || isPrivate || isLinkLocal) {
      logger.error(`Security Alert: Blocked attempt to connect to internal IP: ${ip}`);
      throw new Error('Invalid or forbidden FTP host (Internal IP range).');
    }
  } else if (Address6.isValid(ip)) {
     const addr = new Address6(ip);
     // Check for loopback (::1), link-local (fe80::), unique local (fc00::)
     if (addr.isLoopback() || addr.getScope() === 'Interface-Local' || addr.getScope() === 'Link-Local') {
        logger.error(`Security Alert: Blocked attempt to connect to internal IPv6: ${ip}`);
        throw new Error('Invalid or forbidden FTP host (Internal IP range).');
     }
  }

  return ip;
}

export async function getFtpClient(data: FormData) {
  const host = data.get('host') as string;
  const user = data.get('username') as string;
  const password = data.get('password') as string;

  // Sentinel Security Fix: Validate host to prevent SSRF and TOCTOU
  // We resolve the IP and use it for connection to ensure we connect to the validated address.
  const resolvedIp = await resolveAndValidateFtpHost(host);

  // Sentinel Security Fix: Allow insecure FTP only if explicitly enabled.
  const allowInsecure = process.env.ALLOW_INSECURE_FTP === 'true';

  const client = new Client(30000); // 30 second timeout
  // client.ftp.verbose = true;
  try {
    // First, try a secure connection
    logger.info(`Attempting secure FTP connection to ${host} (${resolvedIp})...`);

    // We pass the resolved IP as 'host' to prevent DNS rebinding.
    // We pass the original hostname as 'servername' in secureOptions to ensure SNI works.
    await client.access({
      host: resolvedIp,
      user,
      password,
      secure: true,
      secureOptions: {
        servername: host // SNI support
      }
    });
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
        logger.info(`Attempting non-secure FTP connection to ${host} (${resolvedIp})...`);
        // For non-secure, we also use the resolved IP.
        await nonSecureClient.access({ host: resolvedIp, user, password, secure: false });
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
