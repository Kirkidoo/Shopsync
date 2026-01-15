
import { getCsvStreamFromFtp } from './ftp';
import { Client } from 'basic-ftp';

jest.mock('basic-ftp');
// Mock the logger to avoid cluttering test output
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('FTP Service Path Traversal', () => {
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
      closed: false,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should prevent path traversal in csvFileName', async () => {
    // Mock FormData
    const ftpData = {
      get: (key: string) => {
        if (key === 'host') return 'test-host';
        if (key === 'username') return 'user';
        if (key === 'password') return 'pass';
        return null;
      },
    } as unknown as FormData;

    const maliciousFileName = '../../etc/passwd';
    const maliciousFileName2 = 'folder/file.csv';
    const maliciousFileName3 = 'folder\\file.csv';

    await expect(getCsvStreamFromFtp(maliciousFileName, ftpData))
      .rejects
      .toThrow(/Invalid filename/);

    await expect(getCsvStreamFromFtp(maliciousFileName2, ftpData))
      .rejects
      .toThrow(/Invalid filename/);

    await expect(getCsvStreamFromFtp(maliciousFileName3, ftpData))
      .rejects
      .toThrow(/Invalid filename/);

    // Verify that downloadTo was NOT called
    expect(mockDownloadTo).not.toHaveBeenCalled();
  });

  it('should allow valid filenames', async () => {
     // Mock FormData
     const ftpData = {
      get: (key: string) => {
        if (key === 'host') return 'test-host';
        if (key === 'username') return 'user';
        if (key === 'password') return 'pass';
        return null;
      },
    } as unknown as FormData;

    const validFileName = 'products.csv';

    await getCsvStreamFromFtp(validFileName, ftpData);

    expect(mockDownloadTo).toHaveBeenCalledWith(expect.anything(), validFileName);
  });
});
