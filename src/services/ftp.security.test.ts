
import { getCsvStreamFromFtp } from './ftp';
import { Client } from 'basic-ftp';
import { Readable } from 'stream';

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn(() => ({
      access: jest.fn(),
      cd: jest.fn(),
      downloadTo: jest.fn().mockImplementation((stream) => {
          // Simulate data to satisfy the stream
          stream.push('header,row\nval1,val2');
          stream.push(null);
          return Promise.resolve();
      }),
      close: jest.fn(),
      closed: false,
    })),
  };
});

// Mock logger
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

  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Get the instance of the mock client
    mockClient = new (require('basic-ftp').Client)();
  });

  it('should allow valid filenames', async () => {
    const validFile = 'products.csv';
    const stream = await getCsvStreamFromFtp(validFile, mockFtpData);
    expect(stream).toBeDefined();
    // Wait for stream to end to ensure async operations complete if needed,
    // though the mock resolves immediately.
  });

  it('should reject path traversal attempts with "../"', async () => {
    const maliciousFile = '../../etc/passwd';

    // We expect this to fail once we implement the security check.
    // Currently, it passes (meaning it calls downloadTo with the malicious path).
    // So we assert that it throws an error.
    await expect(getCsvStreamFromFtp(maliciousFile, mockFtpData))
      .rejects
      .toThrow(/Invalid filename/);
  });

  it('should reject absolute paths', async () => {
     const maliciousFile = '/etc/passwd';
     await expect(getCsvStreamFromFtp(maliciousFile, mockFtpData))
       .rejects
       .toThrow(/Invalid filename/);
  });

  it('should reject path traversal attempts with "..\\"', async () => {
    const maliciousFile = '..\\windows\\system32';
    await expect(getCsvStreamFromFtp(maliciousFile, mockFtpData))
      .rejects
      .toThrow(/Invalid filename/);
  });
});
