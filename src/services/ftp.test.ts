import { getCsvStreamFromFtp } from './ftp';
import { Client } from 'basic-ftp';

// Mock basic-ftp
jest.mock('basic-ftp');

// Mock logger to avoid console noise
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('ftp service security', () => {
  const mockFtpData = new FormData();
  mockFtpData.append('host', 'ftp.example.com');
  mockFtpData.append('username', 'user');
  mockFtpData.append('password', 'pass');

  let mockClientInstance: any;

  beforeEach(() => {
    mockClientInstance = {
      access: jest.fn().mockResolvedValue(undefined),
      cd: jest.fn().mockResolvedValue(undefined),
      downloadTo: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      closed: false,
    };
    (Client as unknown as jest.Mock).mockImplementation(() => mockClientInstance);
  });

  it('should prevent path traversal with ".." in filename', async () => {
    const maliciousPath = '../etc/passwd';

    await expect(getCsvStreamFromFtp(maliciousPath, mockFtpData))
      .rejects
      .toThrow(/Invalid filename.*Path traversal characters detected/);

    expect(mockClientInstance.downloadTo).not.toHaveBeenCalled();
    // It should also not have connected
    expect(mockClientInstance.access).not.toHaveBeenCalled();
  });

  it('should prevent path traversal with "/" in filename', async () => {
    const maliciousPath = 'subdir/secret.txt';

    await expect(getCsvStreamFromFtp(maliciousPath, mockFtpData))
      .rejects
      .toThrow(/Invalid filename.*Path traversal characters detected/);

    expect(mockClientInstance.downloadTo).not.toHaveBeenCalled();
  });
});
