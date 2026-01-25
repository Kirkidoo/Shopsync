import { getCsvStreamFromFtp } from './ftp';
import { Client } from 'basic-ftp';

jest.mock('basic-ftp');
jest.mock('@/lib/logger');

describe('FTP Service Security', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      access: jest.fn().mockResolvedValue(undefined),
      cd: jest.fn().mockResolvedValue(undefined),
      downloadTo: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      closed: false,
    };
    (Client as unknown as jest.Mock).mockImplementation(() => mockClient);
  });

  it('should prevent path traversal in filename', async () => {
    const formData = new FormData();
    formData.append('host', 'localhost');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    const maliciousFilename = '../etc/passwd';

    // We expect this to throw an error due to validation
    await expect(getCsvStreamFromFtp(maliciousFilename, formData)).rejects.toThrow(
      /Invalid filename|Path traversal/
    );

    // Ensure downloadTo was NOT called
    expect(mockClient.downloadTo).not.toHaveBeenCalled();
  });

  it('should allow valid filenames', async () => {
    const formData = new FormData();
    formData.append('host', 'localhost');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    const validFilename = 'inventory.csv';

    // This should succeed (resolve to a stream)
    await expect(getCsvStreamFromFtp(validFilename, formData)).resolves.toBeDefined();

    expect(mockClient.downloadTo).toHaveBeenCalledWith(expect.any(Object), validFilename);
  });
});
