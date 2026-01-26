import { getCsvStreamFromFtp } from './ftp';

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        access: jest.fn().mockResolvedValue(undefined),
        cd: jest.fn().mockResolvedValue(undefined),
        downloadTo: jest.fn().mockResolvedValue(undefined),
        close: jest.fn(),
      };
    }),
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

describe('getCsvStreamFromFtp Security', () => {
  it('should throw an error if csvFileName contains path traversal characters', async () => {
    const maliciousFileName = '../secret.txt';
    const ftpData = new FormData();
    ftpData.append('host', 'test-host');
    ftpData.append('username', 'user');
    ftpData.append('password', 'pass');

    // Currently this will likely fail (it won't throw), or it will throw a different error if mocked poorly.
    // But since we mocked downloadTo to succeed, it should succeed, so expect(...).rejects will fail.
    await expect(getCsvStreamFromFtp(maliciousFileName, ftpData))
      .rejects
      .toThrow(/Invalid filename|Path traversal/);
  });

  it('should throw an error if csvFileName contains slashes', async () => {
     const maliciousFileName = 'subdir/file.csv';
     const ftpData = new FormData();
     ftpData.append('host', 'test-host');
     ftpData.append('username', 'user');
     ftpData.append('password', 'pass');

     await expect(getCsvStreamFromFtp(maliciousFileName, ftpData))
       .rejects
       .toThrow(/Invalid filename|Path traversal/);
  });
});
