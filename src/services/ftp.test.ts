
import { getFtpClient } from './ftp';
import { Client } from 'basic-ftp';
import { logger } from '@/lib/logger';

// Mock basic-ftp
jest.mock('basic-ftp');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('getFtpClient', () => {
  const mockAccess = jest.fn();
  const mockClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (Client as unknown as jest.Mock).mockImplementation(() => ({
      access: mockAccess,
      close: mockClose,
      ftp: { verbose: false },
    }));
    process.env.FTP_PASSWORD = 'env-password';
    process.env.NEXT_PUBLIC_FTP_PASSWORD = 'next-public-password';
  });

  afterEach(() => {
    delete process.env.FTP_PASSWORD;
    delete process.env.NEXT_PUBLIC_FTP_PASSWORD;
  });

  it('should use provided password if not masked', async () => {
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'plain-password');

    mockAccess.mockResolvedValue(undefined);

    await getFtpClient(formData);

    expect(mockAccess).toHaveBeenCalledWith({
      host: 'ftp.example.com',
      user: 'user',
      password: 'plain-password',
      secure: true,
    });
  });

  it('should use environment password if masked password is provided', async () => {
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', '********');

    mockAccess.mockResolvedValue(undefined);

    await getFtpClient(formData);

    expect(mockAccess).toHaveBeenCalledWith({
      host: 'ftp.example.com',
      user: 'user',
      password: 'env-password',
      secure: true,
    });
  });

  it('should use NEXT_PUBLIC environment password if masked password is provided and FTP_PASSWORD is missing', async () => {
    delete process.env.FTP_PASSWORD;

    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', '********');

    mockAccess.mockResolvedValue(undefined);

    await getFtpClient(formData);

    expect(mockAccess).toHaveBeenCalledWith({
      host: 'ftp.example.com',
      user: 'user',
      password: 'next-public-password',
      secure: true,
    });
  });

  it('should throw error if masked password provided but no env var set', async () => {
    delete process.env.FTP_PASSWORD;
    delete process.env.NEXT_PUBLIC_FTP_PASSWORD;

    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', '********');

    await expect(getFtpClient(formData)).rejects.toThrow('Authentication failed: Missing credentials.');
  });
});
