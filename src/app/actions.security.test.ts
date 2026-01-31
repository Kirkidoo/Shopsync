/**
 * @jest-environment node
 */
import { getFtpCredentials } from './actions';

describe('Security: getFtpCredentials', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should not expose the password in plain text', async () => {
    process.env.FTP_PASSWORD = 'super-secret-password';
    process.env.NEXT_PUBLIC_FTP_PASSWORD = 'super-secret-password';

    const creds = await getFtpCredentials();

    expect(creds.password).toBe('********');
    expect(creds.hasPassword).toBe(true);
  });

  it('should handle missing password correctly', async () => {
    process.env.FTP_PASSWORD = '';
    process.env.NEXT_PUBLIC_FTP_PASSWORD = '';

    const creds = await getFtpCredentials();

    expect(creds.password).toBe('');
    expect(creds.hasPassword).toBe(false);
  });
});
