
import { getCsvStreamFromFtp } from './ftp';
import { Client } from 'basic-ftp';
import { Readable } from 'stream';

jest.mock('basic-ftp');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('FTP Service - Path Traversal Vulnerability', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      access: jest.fn().mockResolvedValue(undefined),
      cd: jest.fn().mockResolvedValue(undefined),
      downloadTo: jest.fn().mockImplementation((stream, remotePath) => {
          return Promise.resolve();
      }),
      close: jest.fn(),
      closed: false,
    };
    (Client as unknown as jest.Mock).mockImplementation(() => mockClient);
  });

  it('should REJECT path traversal characters', async () => {
    const maliciousFileName = '../../etc/passwd';
    const ftpData = new FormData();
    ftpData.append('host', 'ftp.example.com');
    ftpData.append('username', 'user');
    ftpData.append('password', 'pass');

    await expect(getCsvStreamFromFtp(maliciousFileName, ftpData))
      .rejects
      .toThrow('Invalid filename. Path traversal characters are not allowed.');

    // Ensure the vulnerability is MITIGATED: downloadTo must NOT be called
    expect(mockClient.downloadTo).not.toHaveBeenCalled();
  });

  it('should allow valid filenames', async () => {
    const validFileName = 'valid-file.csv';
    const ftpData = new FormData();
    ftpData.append('host', 'ftp.example.com');
    ftpData.append('username', 'user');
    ftpData.append('password', 'pass');

    const stream = await getCsvStreamFromFtp(validFileName, ftpData);

    expect(mockClient.downloadTo).toHaveBeenCalledWith(expect.anything(), validFileName);
    stream.destroy();
  });
});
