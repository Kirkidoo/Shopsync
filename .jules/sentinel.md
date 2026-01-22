## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-01-22 - Path Traversal in FTP Service
**Vulnerability:** The FTP service's `getCsvStreamFromFtp` function accepted a filename directly from user input (via server action) and passed it to `client.downloadTo` without validation.
**Learning:** Even when `cd`ing into a specific directory, relative paths (`../`) in filenames can still allow access to files outside that directory if the underlying library or server supports it.
**Prevention:** Validate all file paths/names from user input. Reject any input containing directory separators or traversal sequences if only a simple filename is expected.
