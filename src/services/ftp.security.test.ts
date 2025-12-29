import { getFtpClient } from './ftp';
import { Client } from 'basic-ftp';

// Mock functions
const mockAccess = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn();

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      access: mockAccess,
      close: mockClose,
      ftp: { verbose: false } // getFtpClient sets verbose
    })),
  };
});

// Mock logger to avoid console spam during tests
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('FTP Security - Password Masking', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('should use environment variable password when mask "********" is provided', async () => {
    process.env.FTP_PASSWORD = 'super_secret_env_password';
    process.env.ALLOW_INSECURE_FTP = 'false';

    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', '********');

    await getFtpClient(formData);

    // This checks if the access method was called with the UNMASKED password
    expect(mockAccess).toHaveBeenCalledWith(expect.objectContaining({
      password: 'super_secret_env_password',
      secure: true
    }));
  });

  it('should use provided password when it is not the mask', async () => {
    process.env.FTP_PASSWORD = 'super_secret_env_password';

    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'provided_password');

    await getFtpClient(formData);

    expect(mockAccess).toHaveBeenCalledWith(expect.objectContaining({
      password: 'provided_password',
      secure: true
    }));
  });

  it('should fallback to NEXT_PUBLIC_FTP_PASSWORD if FTP_PASSWORD is missing', async () => {
      delete process.env.FTP_PASSWORD;
      process.env.NEXT_PUBLIC_FTP_PASSWORD = 'public_env_password';

      const formData = new FormData();
      formData.append('host', 'ftp.example.com');
      formData.append('username', 'user');
      formData.append('password', '********');

      await getFtpClient(formData);

      expect(mockAccess).toHaveBeenCalledWith(expect.objectContaining({
        password: 'public_env_password',
        secure: true
      }));
  });
});
