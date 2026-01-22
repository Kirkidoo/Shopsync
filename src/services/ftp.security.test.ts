import { getCsvStreamFromFtp } from './ftp';
import { Client } from 'basic-ftp';

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

// Mock logger to avoid clutter
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('FTP Service Security', () => {
  const mockFtpData = new FormData();
  mockFtpData.append('host', 'ftp.example.com');
  mockFtpData.append('username', 'user');
  mockFtpData.append('password', 'pass');

  it('should reject filenames with directory traversal characters (..)', async () => {
    const maliciousFileName = '../secret.txt';
    await expect(getCsvStreamFromFtp(maliciousFileName, mockFtpData))
      .rejects
      .toThrow(/Invalid CSV filename/);
  });

  it('should reject filenames with absolute paths (/)', async () => {
    const maliciousFileName = '/etc/passwd';
    await expect(getCsvStreamFromFtp(maliciousFileName, mockFtpData))
      .rejects
      .toThrow(/Invalid CSV filename/);
  });

  it('should reject filenames with backslashes (\\)', async () => {
    const maliciousFileName = '..\\windows\\system32';
    await expect(getCsvStreamFromFtp(maliciousFileName, mockFtpData))
      .rejects
      .toThrow(/Invalid CSV filename/);
  });

  it('should allow valid simple filenames', async () => {
    const validFileName = 'inventory.csv';
    // It should not throw the validation error.
    // It might throw connection error if mock isn't perfect, but we check for specific error message.
    // With our mock, it should actually succeed and return a stream.
    const stream = await getCsvStreamFromFtp(validFileName, mockFtpData);
    expect(stream).toBeDefined();
  });
});
