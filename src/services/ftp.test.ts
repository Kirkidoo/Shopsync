import { getFtpClient } from './ftp';
import { Client } from 'basic-ftp';

// Mock basic-ftp
const mockAccess = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn();

jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      access: mockAccess,
      close: mockClose,
      ftp: { verbose: false },
    })),
  };
});

// Mock logger to avoid console noise
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('getFtpClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use provided password if not masked', async () => {
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'password123');

    await getFtpClient(formData);

    expect(mockAccess).toHaveBeenCalledWith({
      host: 'ftp.example.com',
      user: 'user',
      password: 'password123',
      secure: true,
    });
  });

  it('should use environment variable password if input is masked', async () => {
    process.env.FTP_PASSWORD = 'env-password';

    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', '********');

    await getFtpClient(formData);

    expect(mockAccess).toHaveBeenCalledWith({
      host: 'ftp.example.com',
      user: 'user',
      password: 'env-password',
      secure: true,
    });
  });

  it('should use environment variable password if input is empty', async () => {
    process.env.FTP_PASSWORD = 'env-password';

    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', '');

    await getFtpClient(formData);

    expect(mockAccess).toHaveBeenCalledWith({
      host: 'ftp.example.com',
      user: 'user',
      password: 'env-password',
      secure: true,
    });
  });

  it('should use NEXT_PUBLIC environment variable password if input is masked and standard env var is missing', async () => {
    delete process.env.FTP_PASSWORD;
    process.env.NEXT_PUBLIC_FTP_PASSWORD = 'public-env-password';

    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', '********');

    await getFtpClient(formData);

    expect(mockAccess).toHaveBeenCalledWith({
      host: 'ftp.example.com',
      user: 'user',
      password: 'public-env-password',
      secure: true,
    });
  });
});
