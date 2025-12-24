
import { getFtpClient } from '@/services/ftp';
import { Client } from 'basic-ftp';

// Create mock functions outside to reference them easily
const mockAccess = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn();

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        access: mockAccess,
        close: mockClose,
        ftp: { verbose: false }
      };
    }),
  };
});

describe('FTP Security Logic', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks(); // Clear call history
    process.env = { ...ORIGINAL_ENV };
    process.env.FTP_PASSWORD = 'env-password';
    process.env.ALLOW_INSECURE_FTP = 'false';
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('should use environment password when input is masked', async () => {
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', '********'); // Masked password

    try {
      await getFtpClient(formData);
    } catch (e) {
      // Ignore connection errors if any (though we mocked access to resolve)
    }

    // Check what access was called with
    expect(mockAccess).toHaveBeenCalledWith(expect.objectContaining({
      password: 'env-password'
    }));
  });

  it('should use provided password when input is NOT masked', async () => {
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'user-provided-password');

    await getFtpClient(formData);

    // Check if access was called with the user-provided password
    expect(mockAccess).toHaveBeenCalledWith(expect.objectContaining({
      password: 'user-provided-password'
    }));
  });
});
