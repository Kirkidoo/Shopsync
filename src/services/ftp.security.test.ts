import { getCsvStreamFromFtp } from './ftp';

// Mock basic-ftp
const mockAccess = jest.fn();
const mockCd = jest.fn();
const mockDownloadTo = jest.fn();
const mockClose = jest.fn();

jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      access: mockAccess,
      cd: mockCd,
      downloadTo: mockDownloadTo,
      close: mockClose,
      closed: false,
    })),
  };
});

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('FTP Security - Path Traversal Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue(undefined);
    mockCd.mockResolvedValue(undefined);
    mockDownloadTo.mockResolvedValue(undefined);
  });

  it('should throw an error if csvFileName contains path traversal characters', async () => {
    // Mock FormData
    const formData = {
      get: jest.fn((key) => {
        if (key === 'host') return 'ftp.example.com';
        if (key === 'username') return 'user';
        if (key === 'password') return 'pass';
        return null;
      }),
    } as unknown as FormData;

    const maliciousFilenames = [
      '../passwd',
      '..\\passwd',
      '/etc/passwd',
      'foo/bar.csv', // subdirectories might also be disallowed if we enforce flat structure
      '..',
    ];

    for (const filename of maliciousFilenames) {
      await expect(getCsvStreamFromFtp(filename, formData))
        .rejects
        .toThrow('Invalid filename');

      expect(mockDownloadTo).not.toHaveBeenCalled();
    }
  });

  it('should allow valid filenames', async () => {
    const formData = {
      get: jest.fn((key) => {
        if (key === 'host') return 'ftp.example.com';
        if (key === 'username') return 'user';
        if (key === 'password') return 'pass';
        return null;
      }),
    } as unknown as FormData;

    const filename = 'valid_file-name.csv';
    // We mock downloadTo to resolve instantly so the promise resolves
    mockDownloadTo.mockResolvedValue(undefined);

    // Note: getCsvStreamFromFtp returns a stream, but the download happens async.
    // However, the function returns *after* calling downloadTo (it doesn't await it fully in terms of stream completion,
    // but it sets it up).
    // Actually, looking at the code:
    // client.downloadTo(stream, csvFileName).then(...)
    // return stream;
    // So it returns immediately.

    await expect(getCsvStreamFromFtp(filename, formData)).resolves.toBeDefined();
    expect(mockDownloadTo).toHaveBeenCalledWith(expect.anything(), filename);
  });
});
