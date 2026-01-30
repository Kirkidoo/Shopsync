import { getFtpClient } from './ftp';
import { Client } from 'basic-ftp';

// Mock logger to suppress output
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        access: jest.fn().mockResolvedValue(undefined),
        close: jest.fn(),
        cd: jest.fn().mockResolvedValue(undefined),
        downloadTo: jest.fn().mockResolvedValue(undefined),
        list: jest.fn().mockResolvedValue([]),
        ftp: { verbose: false }
      };
    }),
  };
});

describe('FTP Service Security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // jest.resetModules(); // Causing issues with mocks
    process.env = { ...originalEnv };
    (Client as unknown as jest.Mock).mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use environment password when placeholder is provided for matching host', async () => {
    process.env.FTP_HOST = 'ftp.example.com';
    process.env.FTP_PASSWORD = 'secure_env_password';
    process.env.ALLOW_INSECURE_FTP = 'false';

    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', '********');

    try {
        await getFtpClient(formData);
    } catch (e) {
        // Ignore "Invalid FTP credentials" if mocked access fails (it resolves undefined, so should succeed)
    }

    const MockClient = Client as unknown as jest.Mock;
    expect(MockClient).toHaveBeenCalled();

    // Get the instance created by the call
    const mockInstance = MockClient.mock.results[0].value;
    const accessMock = mockInstance.access;

    expect(accessMock).toHaveBeenCalledWith(expect.objectContaining({
      host: 'ftp.example.com',
      user: 'user',
      password: 'secure_env_password', // Should be replaced
      secure: true,
    }));
  });

  it('should NOT use environment password for mismatched host', async () => {
    process.env.FTP_HOST = 'ftp.example.com';
    process.env.FTP_PASSWORD = 'secure_env_password';

    const formData = new FormData();
    formData.append('host', 'malicious.com'); // Mismatched host
    formData.append('username', 'user');
    formData.append('password', '********');

    try {
        await getFtpClient(formData);
    } catch (e) {
        // Expected if we implement throwing, or basic-ftp fails
    }

    const MockClient = Client as unknown as jest.Mock;
    if (MockClient.mock.results.length > 0) {
        const mockInstance = MockClient.mock.results[0].value;
        const accessMock = mockInstance.access;
        // Verify it was NOT called with the secret
        if (accessMock.mock.calls.length > 0) {
             const args = accessMock.mock.calls[0][0];
             expect(args.password).not.toBe('secure_env_password');
             // It might be '********' or undefined depending on implementation,
             // but definitely not the secret.
             // If we throw before calling access, calls will be 0, which is also safe.
        }
    }
  });

  it('should use provided password when not placeholder', async () => {
    process.env.FTP_HOST = 'ftp.example.com';
    process.env.FTP_PASSWORD = 'secure_env_password';

    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'my_custom_password');

    await getFtpClient(formData);

    const MockClient = Client as unknown as jest.Mock;
    const mockInstance = MockClient.mock.results[0].value;
    const accessMock = mockInstance.access;

    expect(accessMock).toHaveBeenCalledWith(expect.objectContaining({
      password: 'my_custom_password',
    }));
  });
});
