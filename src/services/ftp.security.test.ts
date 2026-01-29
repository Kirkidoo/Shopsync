import { getFtpClient, DEFAULT_FTP_HOST } from './ftp';
import { Client } from 'basic-ftp';

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      access: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      ftp: { verbose: false },
    })),
  };
});

describe('getFtpClient Security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    (Client as unknown as jest.Mock).mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use environment password when password is empty and host/user match defaults', async () => {
    process.env.FTP_HOST = DEFAULT_FTP_HOST;
    process.env.FTP_USER = 'testuser';
    process.env.FTP_PASSWORD = 'env-password';

    const formData = new FormData();
    formData.append('host', DEFAULT_FTP_HOST);
    formData.append('username', 'testuser');
    formData.append('password', ''); // Empty password

    const client = await getFtpClient(formData);
    // The returned client is the mocked object we defined
    expect(client.access).toHaveBeenCalledWith({
      host: DEFAULT_FTP_HOST,
      user: 'testuser',
      password: 'env-password', // Should be populated
      secure: true,
    });
  });

  it('should NOT use environment password when host does not match', async () => {
    process.env.FTP_HOST = DEFAULT_FTP_HOST;
    process.env.FTP_USER = 'testuser';
    process.env.FTP_PASSWORD = 'env-password';

    const formData = new FormData();
    formData.append('host', 'other.ftp.com');
    formData.append('username', 'testuser');
    formData.append('password', '');

    const client = await getFtpClient(formData);
    expect(client.access).toHaveBeenCalledWith({
      host: 'other.ftp.com',
      user: 'testuser',
      password: '', // Should NOT be populated
      secure: true,
    });
  });

    it('should NOT use environment password when user does not match', async () => {
    process.env.FTP_HOST = DEFAULT_FTP_HOST;
    process.env.FTP_USER = 'testuser';
    process.env.FTP_PASSWORD = 'env-password';

    const formData = new FormData();
    formData.append('host', DEFAULT_FTP_HOST);
    formData.append('username', 'otheruser');
    formData.append('password', '');

    const client = await getFtpClient(formData);
    expect(client.access).toHaveBeenCalledWith({
      host: DEFAULT_FTP_HOST,
      user: 'otheruser',
      password: '', // Should NOT be populated
      secure: true,
    });
  });
});
