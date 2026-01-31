/**
 * @jest-environment node
 */
import { getFtpClient } from './ftp';
import { Client } from 'basic-ftp';

// Setup mock functions outside so we can export/use them
const mockAccess = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn();

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      access: mockAccess,
      close: mockClose,
    })),
  };
});

// Mock logger to suppress noise
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Security: getFtpClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    mockAccess.mockClear();
    mockClose.mockClear();
    (Client as unknown as jest.Mock).mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use stored password when placeholder is provided and host matches', async () => {
    process.env.FTP_HOST = 'secure.ftp.com';
    process.env.FTP_PASSWORD = 'real-password';

    const formData = new FormData();
    formData.append('host', 'secure.ftp.com');
    formData.append('username', 'user');
    formData.append('password', '********');

    await getFtpClient(formData);

    expect(mockAccess).toHaveBeenCalledWith(expect.objectContaining({
      host: 'secure.ftp.com',
      password: 'real-password', // Should be substituted
    }));
  });

  it('should NOT use stored password when host does not match', async () => {
    process.env.FTP_HOST = 'secure.ftp.com';
    process.env.FTP_PASSWORD = 'real-password';

    const formData = new FormData();
    formData.append('host', 'evil.ftp.com'); // Mismatch
    formData.append('username', 'user');
    formData.append('password', '********');

    try {
        await getFtpClient(formData);
    } catch (e) {
        // access might fail, that's expected
    }

    expect(mockAccess).toHaveBeenCalledWith(expect.objectContaining({
      host: 'evil.ftp.com',
      password: '********', // Should NOT be substituted
    }));
  });

  it('should use provided password if not placeholder', async () => {
    process.env.FTP_HOST = 'secure.ftp.com';
    process.env.FTP_PASSWORD = 'real-password';

    const formData = new FormData();
    formData.append('host', 'secure.ftp.com');
    formData.append('username', 'user');
    formData.append('password', 'user-provided-password');

    await getFtpClient(formData);

    expect(mockAccess).toHaveBeenCalledWith(expect.objectContaining({
      host: 'secure.ftp.com',
      password: 'user-provided-password', // Should match input
    }));
  });
});
