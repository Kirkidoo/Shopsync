import { downloadBulkOperationResultToFile } from '@/lib/shopify';

// Mocks must be hoisted to work with imports
jest.mock('@shopify/shopify-api', () => ({
  shopifyApi: jest.fn(() => ({
    clients: {
      Graphql: jest.fn(),
      Rest: jest.fn(),
    },
  })),
  LATEST_API_VERSION: '2024-01',
  Session: jest.fn(),
}));
jest.mock('@shopify/shopify-api/adapters/node', () => ({}));

// Mock stream/promises and fs
jest.mock('stream/promises', () => ({
  pipeline: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('fs', () => ({
  createWriteStream: jest.fn(() => ({
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  })),
}));
jest.mock('stream', () => ({
  Readable: {
    fromWeb: jest.fn(() => 'mock-stream'),
  }
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

global.fetch = jest.fn();

describe('SSRF Protection in downloadBulkOperationResultToFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject non-Shopify domains', async () => {
    const maliciousUrl = 'https://malicious.com/hack.jsonl';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: 'mock-body',
    });

    await expect(downloadBulkOperationResultToFile(maliciousUrl, 'dummy.jsonl'))
      .rejects.toThrow(/Invalid bulk operation URL/);
  });

  it('should reject non-HTTPS URLs', async () => {
    const insecureUrl = 'http://storage.googleapis.com/shopify-tier/file.jsonl';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: 'mock-body',
    });

    await expect(downloadBulkOperationResultToFile(insecureUrl, 'dummy.jsonl'))
      .rejects.toThrow(/Invalid bulk operation URL/);
  });

  it('should allow valid Shopify bulk URLs and prevent redirects', async () => {
    const validUrl = 'https://storage.googleapis.com/shopify-tier/file.jsonl';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: 'mock-body',
    });

    await downloadBulkOperationResultToFile(validUrl, 'dummy.jsonl');
    expect(global.fetch).toHaveBeenCalledWith(validUrl, expect.objectContaining({ redirect: 'error' }));
  });
});
