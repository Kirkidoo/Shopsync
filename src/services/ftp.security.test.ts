
import { getCsvStreamFromFtp } from './ftp';
import { Client } from 'basic-ftp';

// Mock dependencies
jest.mock('basic-ftp');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Polyfill FormData if missing (though jsdom usually has it)
if (typeof FormData === 'undefined') {
  global.FormData = class FormData {
    private data: Record<string, string> = {};
    append(key: string, value: string) {
      this.data[key] = value;
    }
    get(key: string) {
      return this.data[key];
    }
  } as any;
}

describe('FTP Security - Path Traversal', () => {
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      access: jest.fn().mockResolvedValue(undefined),
      cd: jest.fn().mockResolvedValue(undefined),
      downloadTo: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      closed: false,
    };

    (Client as unknown as jest.Mock).mockImplementation(() => mockClient);
  });

  it('should accept a valid filename without path characters', async () => {
    const formData = new FormData();
    formData.append('host', 'test.host');

    // We expect this to resolve successfully (returning a stream)
    // Since we mocked downloadTo, it won't actually write to the stream, but that's fine.
    // getCsvStreamFromFtp returns a PassThrough stream.
    const streamPromise = getCsvStreamFromFtp('valid-file.csv', formData);

    await expect(streamPromise).resolves.toBeDefined();

    // Verify client interactions
    expect(mockClient.access).toHaveBeenCalled();
    expect(mockClient.cd).toHaveBeenCalled();

    // Crucially, it should call downloadTo with the exact filename
    expect(mockClient.downloadTo).toHaveBeenCalledWith(expect.anything(), 'valid-file.csv');
  });

  it('should REJECT a filename with directory traversal (../)', async () => {
    const formData = new FormData();
    formData.append('host', 'test.host');

    // This checks for the VULNERABILITY FIX.
    // Currently, this test is expected to FAIL because the code doesn't throw.
    await expect(getCsvStreamFromFtp('../secret.txt', formData))
      .rejects
      .toThrow(/Invalid filename|Security violation/i);

    // If we implemented the fix, downloadTo should NOT be called.
    // If the test fails (because the code doesn't throw), it means the vulnerability is present.
  });

  it('should REJECT a filename with forward slashes (/)', async () => {
    const formData = new FormData();
    formData.append('host', 'test.host');

    await expect(getCsvStreamFromFtp('subdir/secret.txt', formData))
      .rejects
      .toThrow(/Invalid filename|Security violation/i);
  });

  it('should REJECT a filename with backslashes (\\)', async () => {
    const formData = new FormData();
    formData.append('host', 'test.host');

    await expect(getCsvStreamFromFtp('subdir\\secret.txt', formData))
      .rejects
      .toThrow(/Invalid filename|Security violation/i);
  });
});
