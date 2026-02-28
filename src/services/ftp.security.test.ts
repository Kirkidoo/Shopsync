
import { getCsvStreamFromFtp } from './ftp';
import * as basicFtp from 'basic-ftp';

// Mock basic-ftp
jest.mock('basic-ftp');

describe('FTP Security', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      access: jest.fn().mockResolvedValue(undefined),
      cd: jest.fn().mockResolvedValue(undefined),
      downloadTo: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      closed: false,
    };
    (basicFtp.Client as unknown as jest.Mock).mockImplementation(() => mockClient);
  });

  it('should prevent path traversal in filename', async () => {
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    const maliciousFileName = '../../etc/passwd';

    await expect(getCsvStreamFromFtp(maliciousFileName, formData))
      .rejects.toThrow('Invalid filename: Path traversal characters detected.');

    // Ensure downloadTo was NOT called
    expect(mockClient.downloadTo).not.toHaveBeenCalled();
  });

  it('should allow valid filenames', async () => {
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    const validFileName = 'valid_file.csv';

    await getCsvStreamFromFtp(validFileName, formData);

    expect(mockClient.downloadTo).toHaveBeenCalledWith(expect.anything(), validFileName);
  });
});
