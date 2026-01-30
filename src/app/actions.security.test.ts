/**
 * @jest-environment node
 */
import { getFtpCredentials } from '@/app/actions';

describe('Credential Security Verification', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should not return the password', async () => {
    process.env.FTP_PASSWORD = 'super_secret_password';
    process.env.FTP_HOST = 'ftp.test.com';
    process.env.FTP_USER = 'testuser';

    const creds: any = await getFtpCredentials();

    // Check if password is leaked
    if (creds.password) {
        console.warn('VULNERABILITY CONFIRMED: Password is exposed:', creds.password);
    }

    expect(creds.password).toBeUndefined();
    expect(creds.hasPassword).toBe(true);
  });
});
