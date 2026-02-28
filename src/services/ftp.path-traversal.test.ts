import { getCsvStreamFromFtp } from './ftp';
import { Client } from 'basic-ftp';
import { Readable } from 'stream';

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        access: jest.fn().mockResolvedValue(undefined),
        cd: jest.fn().mockResolvedValue(undefined),
        downloadTo: jest.fn().mockResolvedValue(undefined),
        close: jest.fn(),
        closed: false,
      };
    }),
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

describe('getCsvStreamFromFtp Path Traversal Vulnerability', () => {
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Access the mock instance
    mockClient = new (Client as any)();
    (Client as unknown as jest.Mock).mockClear();
    (Client as unknown as jest.Mock).mockImplementation(() => mockClient);
  });

  it('should THROW error for path traversal characters in filename (FIX VERIFICATION)', async () => {
    const maliciousFileName = '../secret_file.txt';
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    // Expect the function to throw an error due to the security check
    await expect(getCsvStreamFromFtp(maliciousFileName, formData))
      .rejects
      .toThrow('Invalid filename: Path traversal characters are not allowed.');

    // Ensure downloadTo was NOT called
    expect(mockClient.downloadTo).not.toHaveBeenCalled();
  });

  it('should allow valid filenames', async () => {
    const validFileName = 'data.csv';
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    await getCsvStreamFromFtp(validFileName, formData);

    expect(mockClient.downloadTo).toHaveBeenCalledWith(expect.any(Readable), validFileName);
  });
});
