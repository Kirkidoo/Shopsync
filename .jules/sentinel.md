## 2024-05-23 - Downgrade Attack in FTP Client

**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2025-05-30 - Path Traversal in FTP File Retrieval

**Vulnerability:** The `getCsvStreamFromFtp` function accepted a filename argument directly from user input without validation, allowing path traversal characters (`..`, `/`) to access unauthorized files on the FTP server relative to the working directory.
**Learning:** Even when interacting with external services like FTP, user input (filenames) must be strictly validated. Relying on "it's just a filename" is insufficient if the underlying library or server supports paths.
**Prevention:** Strictly validate file names to ensure they do not contain directory separators or traversal sequences. Whitelisting allowed characters (e.g., alphanumeric and specific extensions) is often safer than blacklisting.
