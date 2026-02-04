import { getCsvStreamFromFtp } from './ftp';

// Mock setup
const mockAccess = jest.fn();
const mockDownloadTo = jest.fn();
const mockClose = jest.fn();
const mockCd = jest.fn();

jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        access: mockAccess,
        downloadTo: mockDownloadTo,
        close: mockClose,
        cd: mockCd,
        trackProgress: jest.fn(),
        ftp: { verbose: false },
      };
    }),
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

describe('FTP Security - Path Traversal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue(undefined);
    mockCd.mockResolvedValue(undefined);
    // Mock downloadTo to simulate success unless we want it to fail
    mockDownloadTo.mockResolvedValue(undefined);
  });

  it('should reject filenames containing directory traversal ".." sequences', async () => {
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    const maliciousFileName = '../../etc/passwd';

    await expect(getCsvStreamFromFtp(maliciousFileName, formData)).rejects.toThrow(
      /Invalid filename/
    );
  });

  it('should reject filenames containing forward slash "/"', async () => {
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    const maliciousFileName = '/etc/passwd';

    await expect(getCsvStreamFromFtp(maliciousFileName, formData)).rejects.toThrow(
      /Invalid filename/
    );
  });

  it('should reject filenames containing backslash "\\"', async () => {
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    const maliciousFileName = '..\\windows\\system32\\config';

    await expect(getCsvStreamFromFtp(maliciousFileName, formData)).rejects.toThrow(
      /Invalid filename/
    );
  });

  it('should allow valid safe filenames', async () => {
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    const validFileName = 'inventory_report.csv';

    // Should not throw validation error
    await getCsvStreamFromFtp(validFileName, formData);

    expect(mockAccess).toHaveBeenCalled();
    expect(mockCd).toHaveBeenCalled();
    expect(mockDownloadTo).toHaveBeenCalled();
  });
});
