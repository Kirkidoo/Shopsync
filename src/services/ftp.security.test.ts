import { getCsvStreamFromFtp } from './ftp';
import { Client } from 'basic-ftp';
import { Readable } from 'stream';

jest.mock('basic-ftp');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('FTP Security', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      access: jest.fn().mockResolvedValue(undefined),
      cd: jest.fn().mockResolvedValue(undefined),
      downloadTo: jest.fn().mockImplementation((stream) => {
        stream.end(); // simulate download complete
        return Promise.resolve();
      }),
      close: jest.fn(),
      closed: false,
    };
    (Client as unknown as jest.Mock).mockReturnValue(mockClient);
  });

  it('should allow valid filenames', async () => {
    const formData = new FormData();
    formData.append('host', 'test.host');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    await getCsvStreamFromFtp('valid.csv', formData);

    expect(mockClient.downloadTo).toHaveBeenCalledWith(expect.any(Readable), 'valid.csv');
  });

  it('should reject filenames with directory traversal', async () => {
    const formData = new FormData();
    formData.append('host', 'test.host');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    await expect(getCsvStreamFromFtp('../secret.txt', formData)).rejects.toThrow(
      'Invalid CSV filename'
    );
    await expect(getCsvStreamFromFtp('..\\secret.txt', formData)).rejects.toThrow(
      'Invalid CSV filename'
    );
    await expect(getCsvStreamFromFtp('/etc/passwd', formData)).rejects.toThrow(
      'Invalid CSV filename'
    );
  });
});
