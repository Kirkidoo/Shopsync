import { getCsvStreamFromFtp } from './ftp';

// Setup mocks before imports
const mockDownloadTo = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn();
const mockAccess = jest.fn().mockResolvedValue(undefined);
const mockCd = jest.fn().mockResolvedValue(undefined);

jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      access: mockAccess,
      cd: mockCd,
      downloadTo: mockDownloadTo,
      close: mockClose,
      ftp: { verbose: false },
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

describe('FTP Path Traversal Vulnerability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should REJECT path traversal characters (fix verification)', async () => {
    const maliciousFileName = '../etc/passwd';
    const ftpData = new FormData();
    ftpData.append('host', 'test.host');
    ftpData.append('username', 'user');
    ftpData.append('password', 'pass');

    // Expect the function to throw an error due to validation
    await expect(getCsvStreamFromFtp(maliciousFileName, ftpData))
      .rejects
      .toThrow('Invalid filename. Path traversal characters are not allowed.');

    // Verify downloadTo was NEVER called
    expect(mockDownloadTo).not.toHaveBeenCalled();
  });

  it('should ALLOW valid filenames', async () => {
    const validFileName = 'products.csv';
    const ftpData = new FormData();
    ftpData.append('host', 'test.host');
    ftpData.append('username', 'user');
    ftpData.append('password', 'pass');

    // Should not throw
    await getCsvStreamFromFtp(validFileName, ftpData);

    // Verify downloadTo WAS called
    expect(mockDownloadTo).toHaveBeenCalledWith(expect.anything(), validFileName);
  });
});
