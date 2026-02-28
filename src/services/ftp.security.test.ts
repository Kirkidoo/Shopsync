
import { getCsvStreamFromFtp } from './ftp';

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      access: jest.fn().mockResolvedValue(undefined),
      cd: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([]),
      downloadTo: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
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

describe('FTP Service Security', () => {
  let mockFormData: FormData;

  beforeAll(() => {
    mockFormData = new FormData();
    mockFormData.append('host', 'ftp.example.com');
    mockFormData.append('username', 'user');
    mockFormData.append('password', 'pass');
  });

  it('should throw an error for filenames with path traversal characters (..)', async () => {
    const maliciousFileName = '../secret.txt';
    await expect(getCsvStreamFromFtp(maliciousFileName, mockFormData)).rejects.toThrow(
      /Invalid filename/
    );
  });

  it('should throw an error for filenames with forward slashes (/)', async () => {
    const maliciousFileName = 'folder/secret.txt';
    await expect(getCsvStreamFromFtp(maliciousFileName, mockFormData)).rejects.toThrow(
      /Invalid filename/
    );
  });

  it('should throw an error for filenames with backslashes (\\)', async () => {
    const maliciousFileName = 'folder\\secret.txt';
    await expect(getCsvStreamFromFtp(maliciousFileName, mockFormData)).rejects.toThrow(
      /Invalid filename/
    );
  });

  it('should accept valid filenames', async () => {
    const validFileName = 'valid-file.csv';
    const stream = await getCsvStreamFromFtp(validFileName, mockFormData);
    expect(stream).toBeDefined();
  });
});
