
import { Client } from 'basic-ftp';

// Mock dependencies BEFORE importing the module under test
jest.mock('@/lib/shopify', () => ({
  // Mock any exports used by actions.ts
  getShopifyProductsBySku: jest.fn(),
  updateProduct: jest.fn(),
  updateProductVariant: jest.fn(),
  inventorySetQuantities: jest.fn(),
  createProduct: jest.fn(),
  addProductVariant: jest.fn(),
  connectInventoryToLocation: jest.fn(),
  linkProductToCollection: jest.fn(),
  getCollectionIdByTitle: jest.fn(),
  getShopifyLocations: jest.fn(),
  disconnectInventoryFromLocation: jest.fn(),
  publishProductToSalesChannels: jest.fn(),
  deleteProduct: jest.fn(),
  deleteProductVariant: jest.fn(),
  startProductExportBulkOperation: jest.fn(),
  checkBulkOperationStatus: jest.fn(),
  getBulkOperationResult: jest.fn(),
  parseBulkOperationResult: jest.fn(),
  getFullProduct: jest.fn(),
  addProductImage: jest.fn(),
  deleteProductImage: jest.fn(),
  getProductImageCounts: jest.fn(),
  getProductByHandle: jest.fn(),
  addProductTags: jest.fn(),
  removeProductTags: jest.fn(),
  downloadBulkOperationResultToFile: jest.fn(),
}));

jest.mock('@/services/audit', () => ({
  runAudit: jest.fn(),
  runBulkAuditComparison: jest.fn(),
}));

jest.mock('@/services/csv', () => ({
  getCsvProducts: jest.fn(),
}));

// We need to store a reference to the mocked instance to inspect it
const mockClientInstance = {
  access: jest.fn().mockResolvedValue(undefined),
  close: jest.fn(),
  ftp: {
    verbose: false
  },
  cd: jest.fn(),
  list: jest.fn().mockResolvedValue([]),
  downloadTo: jest.fn().mockResolvedValue(undefined),
  trackProgress: jest.fn(),
  closed: false
};

jest.mock('basic-ftp', () => {
  return {
    Client: jest.fn().mockImplementation(() => mockClientInstance),
  };
});

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock next/cache
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

// Set up globals for JSDOM env if needed
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Now import the modules under test
import { getFtpCredentials } from '../app/actions';
import { getFtpClient } from './ftp';

// Mock process.env
const originalEnv = process.env;

describe('FTP Security', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Clear mock calls
    mockClientInstance.access.mockClear();
    mockClientInstance.close.mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getFtpCredentials', () => {
    it('should mask the password when returning credentials', async () => {
      process.env.FTP_PASSWORD = 'super_secret_password';
      process.env.FTP_HOST = 'ftp.example.com';
      process.env.FTP_USER = 'user';

      const credentials = await getFtpCredentials();

      expect(credentials.password).toBe('********');
      expect(credentials.host).toBe('ftp.example.com');
      expect(credentials.username).toBe('user');
    });

    it('should return empty string if no password is set', async () => {
      delete process.env.FTP_PASSWORD;
      delete process.env.NEXT_PUBLIC_FTP_PASSWORD;

      const credentials = await getFtpCredentials();

      expect(credentials.password).toBe('');
    });
  });

  describe('getFtpClient', () => {
    it('should use environment password when input is masked', async () => {
      process.env.FTP_PASSWORD = 'env_secret_password';
      const formData = new FormData();
      formData.append('host', 'ftp.example.com');
      formData.append('username', 'user');
      formData.append('password', '********'); // Masked input

      await getFtpClient(formData);

      const accessCall = mockClientInstance.access.mock.calls[0][0];

      expect(accessCall.password).toBe('env_secret_password');
    });

    it('should use provided password when input is NOT masked', async () => {
      process.env.FTP_PASSWORD = 'env_secret_password';
      const formData = new FormData();
      formData.append('host', 'ftp.example.com');
      formData.append('username', 'user');
      formData.append('password', 'user_provided_password');

      await getFtpClient(formData);

      const accessCall = mockClientInstance.access.mock.calls[0][0];

      expect(accessCall.password).toBe('user_provided_password');
    });
  });
});
