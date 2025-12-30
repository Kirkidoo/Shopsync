
import { getFtpClient } from '../ftp';
import { Client } from 'basic-ftp';
import dns from 'dns/promises';

// Mock basic-ftp
jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      access: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
    })),
  };
});

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock dns
jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}));

describe('getFtpClient Security Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should validate host to prevent SSRF (Local IP)', async () => {
    const formData = new FormData();
    formData.append('host', '127.0.0.1');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    await expect(getFtpClient(formData)).rejects.toThrow(/Invalid or forbidden FTP host/);
  });

  it('should validate host to prevent SSRF (Private IP)', async () => {
    const formData = new FormData();
    formData.append('host', '192.168.1.5');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    await expect(getFtpClient(formData)).rejects.toThrow(/Invalid or forbidden FTP host/);
  });

  it('should allow valid public IPs/domains', async () => {
    const formData = new FormData();
    formData.append('host', 'ftp.example.com');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    const mockIp = '93.184.216.34';
    (dns.lookup as jest.Mock).mockResolvedValue({ address: mockIp });

    // Get the client returned by the function
    const client: any = await getFtpClient(formData);

    expect(client).toBeDefined();
    // Check if client.access was called with the RESOLVED IP, not the hostname
    expect(client.access).toHaveBeenCalledWith(expect.objectContaining({
      host: mockIp, // Must use IP
      secure: true,
      secureOptions: expect.objectContaining({
        servername: 'ftp.example.com' // Must preserve hostname for SNI
      })
    }));
  });

  it('should prevent DNS rebinding to private IP', async () => {
    const formData = new FormData();
    formData.append('host', 'evil.com');
    formData.append('username', 'user');
    formData.append('password', 'pass');

    // Mock DNS resolution for evil.com to a PRIVATE IP
    (dns.lookup as jest.Mock).mockResolvedValue({ address: '10.0.0.1' });

    await expect(getFtpClient(formData)).rejects.toThrow(/Invalid or forbidden FTP host/);
  });
});
