## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-01-17 - SSRF in Bulk Operation Download
**Vulnerability:** The `downloadBulkOperationResultToFile` function accepted arbitrary URLs, allowing Server-Side Request Forgery (SSRF). Attackers could potentially probe internal networks or download malicious files.
**Learning:** Functions that accept URLs from external sources (even indirectly via client-side params) must validate the protocol and hostname. `fetch` follows redirects by default, which can bypass initial validation.
**Prevention:**
1. Validate protocol (HTTPS only).
2. Allowlist trusted hostnames (`storage.googleapis.com`, `shopify.com`).
3. Disable redirects (`{ redirect: 'error' }`) in `fetch` to prevent protocol downgrades or redirection to internal services.
