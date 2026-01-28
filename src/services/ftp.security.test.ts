import { getCsvStreamFromFtp } from './ftp';
import { Readable } from 'stream';

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      access: jest.fn().mockResolvedValue(undefined),
      cd: jest.fn().mockResolvedValue(undefined),
      downloadTo: jest.fn().mockImplementation((stream, remotePath) => {
          return Promise.resolve();
      }),
      close: jest.fn(),
      ftp: {
          verbose: false
      }
    })),
  };
});

// Mock logger to avoid console noise
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('FTP Security', () => {
  const mockFormData = new FormData();
  mockFormData.append('host', 'ftp.example.com');
  mockFormData.append('username', 'user');
  mockFormData.append('password', 'pass');

  it('should accept a valid filename', async () => {
    const validFilename = 'products.csv';
    const stream = await getCsvStreamFromFtp(validFilename, mockFormData);
    expect(stream).toBeInstanceOf(Readable);
  });

  it('should reject a filename with directory traversal (../)', async () => {
    const maliciousFilename = '../secret.txt';
    await expect(getCsvStreamFromFtp(maliciousFilename, mockFormData))
      .rejects
      .toThrow(/Invalid filename/);
  });

  it('should reject a filename with absolute path (/)', async () => {
    const maliciousFilename = '/etc/passwd';
    await expect(getCsvStreamFromFtp(maliciousFilename, mockFormData))
      .rejects
      .toThrow(/Invalid filename/);
  });

   it('should reject a filename with backslash (\\)', async () => {
    const maliciousFilename = '..\\secret.txt';
    await expect(getCsvStreamFromFtp(maliciousFilename, mockFormData))
      .rejects
      .toThrow(/Invalid filename/);
  });
});
