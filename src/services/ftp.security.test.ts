import { getCsvStreamFromFtp } from './ftp';
import { Client } from 'basic-ftp';

// Mock basic-ftp
jest.mock('basic-ftp');

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('FTP Service Security', () => {
  let mockDownloadTo: jest.Mock;
  let mockAccess: jest.Mock;
  let mockCd: jest.Mock;
  let mockClose: jest.Mock;

  beforeEach(() => {
    mockDownloadTo = jest.fn().mockResolvedValue(undefined);
    mockAccess = jest.fn().mockResolvedValue(undefined);
    mockCd = jest.fn().mockResolvedValue(undefined);
    mockClose = jest.fn();

    (Client as unknown as jest.Mock).mockImplementation(() => ({
      access: mockAccess,
      cd: mockCd,
      downloadTo: mockDownloadTo,
      close: mockClose,
      ftp: { verbose: false },
    }));
  });

  it('should block path traversal characters in filename', async () => {
    const ftpData = new FormData();
    ftpData.append('host', 'localhost');
    ftpData.append('username', 'user');
    ftpData.append('password', 'pass');

    const maliciousFilename = '../../etc/passwd';

    // We expect the function to throw due to validation
    await expect(getCsvStreamFromFtp(maliciousFilename, ftpData)).rejects.toThrow(
      'Invalid filename: Path traversal characters detected.'
    );

    // Verify that downloadTo was NOT called
    expect(mockDownloadTo).not.toHaveBeenCalled();

    // Verify that we didn't even try to connect (validation happens before connection)
    expect(mockAccess).not.toHaveBeenCalled();
  });

  it('should allow valid filenames', async () => {
     const ftpData = new FormData();
    ftpData.append('host', 'localhost');
    ftpData.append('username', 'user');
    ftpData.append('password', 'pass');

    const validFilename = 'products.csv';

    try {
        await getCsvStreamFromFtp(validFilename, ftpData);
    } catch (e) {
        // Ignore stream setup errors as we are just checking if it got past validation
    }

    // Connect should have happened
    expect(mockAccess).toHaveBeenCalled();
    // Download should have happened
    expect(mockDownloadTo).toHaveBeenCalledWith(expect.anything(), validFilename);
  });
});
