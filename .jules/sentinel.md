## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-02-05 - Path Traversal in FTP Client
**Vulnerability:** The `getCsvStreamFromFtp` function accepted a filename directly from the caller without sanitization, allowing path traversal (e.g., `../secret.txt`) in the FTP download request.
**Learning:** Even when operations are seemingly "chrooted" or directory-specific (like `client.cd(DIR)`), relative paths in subsequent commands can still traverse directories. Input validation is the primary defense.
**Prevention:** Explicitly validate all file path inputs to ensure they do not contain directory separators (`/`, `\`) or traversal sequences (`..`), enforcing strict filename-only inputs where appropriate.
