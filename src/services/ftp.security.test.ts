import { getFtpClient } from './ftp';
import { Client } from 'basic-ftp';

// Define mocks outside to access them
const mockAccess = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn();

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        access: mockAccess,
        close: mockClose,
        trackProgress: jest.fn(),
        ftp: { verbose: false }
      };
    }),
  };
});

describe('getFtpClient Security', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks(); // Clear call history
    process.env = { ...OLD_ENV }; // Make a copy
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  it('should use the environment password when placeholder is provided and host matches', async () => {
    // Setup Env
    process.env.FTP_HOST = 'test.host.com';
    process.env.FTP_PASSWORD = 'super_secret_password';
    process.env.ALLOW_INSECURE_FTP = 'false';

    const formData = new FormData();
    formData.append('host', 'test.host.com');
    formData.append('username', 'user');
    formData.append('password', '********');

    await getFtpClient(formData);

    // EXPECTATION: It should substitute the password
    expect(mockAccess).toHaveBeenCalledWith({
      host: 'test.host.com',
      user: 'user',
      password: 'super_secret_password',
      secure: true,
    });
  });

  it('should NOT use the environment password when host does not match', async () => {
    process.env.FTP_HOST = 'test.host.com';
    process.env.FTP_PASSWORD = 'super_secret_password';

    const formData = new FormData();
    formData.append('host', 'evil.host.com');
    formData.append('username', 'user');
    formData.append('password', '********');

    await getFtpClient(formData);

    expect(mockAccess).toHaveBeenCalledWith({
      host: 'evil.host.com',
      user: 'user',
      password: '********', // Should remain placeholder
      secure: true,
    });
  });

  it('should use provided password if it is not the placeholder', async () => {
    process.env.FTP_HOST = 'test.host.com';
    process.env.FTP_PASSWORD = 'super_secret_password';

    const formData = new FormData();
    formData.append('host', 'test.host.com');
    formData.append('username', 'user');
    formData.append('password', 'user_provided_password');

    await getFtpClient(formData);

    expect(mockAccess).toHaveBeenCalledWith({
      host: 'test.host.com',
      user: 'user',
      password: 'user_provided_password',
      secure: true,
    });
  });
});
