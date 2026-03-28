
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock Shopify API dependencies to avoid ESM/runtime issues in tests
jest.mock('@shopify/shopify-api');
jest.mock('@shopify/shopify-api/adapters/node');

// Mock logger to suppress errors during tests
jest.mock('./logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import { getBulkOperationResult, downloadBulkOperationResultToFile } from './shopify';

// Mock global fetch
const mockFetch = jest.fn() as jest.Mock;
global.fetch = mockFetch;

describe('Shopify SSRF Protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('mock data'),
      body: {
        // Minimal stream mock if needed, though we rely on validation failing first
      },
    });
  });

  const ALLOWED_URLS = [
    'https://shopify.com/result.jsonl',
    'https://subdomain.shopify.com/result.jsonl',
    'https://cdn.shopify.com/files/result.jsonl',
    'https://storage.googleapis.com/shopify-bulk-exports/result.jsonl',
  ];

  const BLOCKED_URLS = [
    'http://shopify.com/result.jsonl', // HTTP not allowed
    'https://example.com/result.jsonl', // External domain
    'https://google.com/search', // External domain
    'https://localhost:3000/secret', // Localhost
    'http://127.0.0.1/metadata', // IP address
    'https://169.254.169.254/latest/meta-data/', // Cloud metadata
    'ftp://shopify.com/file', // Wrong protocol
    'https://malicious-shopify.com/file', // Phishing domain
    'https://shopify.com.evil.com/file', // Subdomain trick
  ];

  describe('getBulkOperationResult', () => {
    it('should accept allowed URLs', async () => {
      for (const url of ALLOWED_URLS) {
        await expect(getBulkOperationResult(url)).resolves.toBe('mock data');
        expect(mockFetch).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: 'error' }));
      }
    });

    it('should reject blocked URLs', async () => {
      for (const url of BLOCKED_URLS) {
        await expect(getBulkOperationResult(url)).rejects.toThrow(/Invalid Shopify Bulk URL/);
      }
    });
  });

  describe('downloadBulkOperationResultToFile', () => {
    // We only test rejection here to avoid mocking file system internals
    it('should reject blocked URLs before attempting download', async () => {
      for (const url of BLOCKED_URLS) {
        await expect(downloadBulkOperationResultToFile(url, '/tmp/file')).rejects.toThrow(/Invalid Shopify Bulk URL/);
        expect(mockFetch).not.toHaveBeenCalled(); // Fetch should not be called
      }
    });
  });
});
