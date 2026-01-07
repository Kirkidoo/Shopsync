import { getFtpClient } from './ftp';
import { Client } from 'basic-ftp';

// Mock dependencies
jest.mock('basic-ftp');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('FTP Security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use environment password when input is masked', async () => {
    process.env.FTP_PASSWORD = 'super-secret-password';
    process.env.ALLOW_INSECURE_FTP = 'false';

    const formData = new FormData();
    formData.append('host', 'example.com');
    formData.append('username', 'user');
    formData.append('password', '********');

    // Mock Client behavior
    const MockClient = Client as unknown as jest.Mock;
    const mockAccess = jest.fn().mockResolvedValue(undefined);
    MockClient.mockImplementation(() => ({
      access: mockAccess,
      close: jest.fn(),
      ftp: { verbose: false },
    }));

    await getFtpClient(formData);

    // Verify that access was called with the actual environment password, not the mask
    expect(mockAccess).toHaveBeenCalledWith(expect.objectContaining({
      password: 'super-secret-password'
    }));
  });

  it('should throw error if masked password is provided but env var is missing', async () => {
    delete process.env.FTP_PASSWORD;
    delete process.env.NEXT_PUBLIC_FTP_PASSWORD;

    const formData = new FormData();
    formData.append('host', 'example.com');
    formData.append('username', 'user');
    formData.append('password', '********');

    const MockClient = Client as unknown as jest.Mock;
    MockClient.mockImplementation(() => ({
      access: jest.fn(),
      close: jest.fn(),
    }));

    await expect(getFtpClient(formData)).rejects.toThrow('Environment password not found for masked input.');
  });
});
