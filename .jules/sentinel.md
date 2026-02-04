## 2024-05-23 - Downgrade Attack in FTP Client

**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-02-04 - Path Traversal in FTP Download

**Vulnerability:** The `getCsvStreamFromFtp` function passed user-provided filenames directly to the FTP client's `downloadTo` method without validation.
**Learning:** Third-party FTP clients (like `basic-ftp`) may not automatically sanitize file paths, assuming the input is trusted or the server handles it. This allows attackers to traverse directories (e.g., `../../`) if the server is permissive.
**Prevention:** Implement strict allowlist-based input validation for filenames (e.g., alphanumeric only) or explicitly reject path traversal sequences (`..`, `/`, `\`) before passing them to file system or protocol adapters.
