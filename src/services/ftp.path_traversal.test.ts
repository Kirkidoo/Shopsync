
import { getCsvStreamFromFtp } from './ftp';
import { Client } from 'basic-ftp';
import { Readable } from 'stream';

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      access: jest.fn().mockResolvedValue(undefined),
      cd: jest.fn().mockResolvedValue(undefined),
      downloadTo: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      closed: false,
    })),
  };
});

// Mock logger to avoid cluttering test output
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('FTP Service - Path Traversal Security', () => {
  let mockClient: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockClient = new (require('basic-ftp').Client)();
    (Client as unknown as jest.Mock).mockImplementation(() => mockClient);
  });

  it('should throw an error if csvFileName contains path traversal characters (..)', async () => {
    const maliciousFileName = '../../etc/passwd';
    const ftpData = new FormData();
    ftpData.append('host', 'ftp.example.com');
    ftpData.append('username', 'user');
    ftpData.append('password', 'pass');

    await expect(getCsvStreamFromFtp(maliciousFileName, ftpData))
      .rejects
      .toThrow('Invalid CSV filename');

    // Verify downloadTo was NOT called
    expect(mockClient.downloadTo).not.toHaveBeenCalled();
  });

  it('should throw an error if csvFileName contains forward slash (/)', async () => {
    const maliciousFileName = '/etc/passwd';
    const ftpData = new FormData();
    ftpData.append('host', 'ftp.example.com');
    ftpData.append('username', 'user');
    ftpData.append('password', 'pass');

    await expect(getCsvStreamFromFtp(maliciousFileName, ftpData))
      .rejects
      .toThrow('Invalid CSV filename');

    expect(mockClient.downloadTo).not.toHaveBeenCalled();
  });

  it('should throw an error if csvFileName contains backslash (\\)', async () => {
    const maliciousFileName = '..\\windows\\system32';
    const ftpData = new FormData();
    ftpData.append('host', 'ftp.example.com');
    ftpData.append('username', 'user');
    ftpData.append('password', 'pass');

    await expect(getCsvStreamFromFtp(maliciousFileName, ftpData))
      .rejects
      .toThrow('Invalid CSV filename');

    expect(mockClient.downloadTo).not.toHaveBeenCalled();
  });

  it('should allow valid filenames', async () => {
    const validFileName = 'products.csv';
    const ftpData = new FormData();
    ftpData.append('host', 'ftp.example.com');
    ftpData.append('username', 'user');
    ftpData.append('password', 'pass');

    // We expect this to resolve to a stream (or throw a different error if mocks aren't perfect, but NOT 'Invalid CSV filename')
    // Since we mocked downloadTo to resolve, this should return a stream.
    const stream = await getCsvStreamFromFtp(validFileName, ftpData);
    expect(stream).toBeInstanceOf(Readable);

    // Verify downloadTo WAS called with the valid filename
    expect(mockClient.downloadTo).toHaveBeenCalledWith(expect.anything(), validFileName);
  });
});
