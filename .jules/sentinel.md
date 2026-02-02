## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-02-02 - Path Traversal in FTP Download
**Vulnerability:** The `getCsvStreamFromFtp` function accepted a filename directly from user input without validation, allowing path traversal characters (`../`, `/`) to potentially access files outside the intended directory.
**Learning:** Even when interacting with "internal" services like an FTP server, input parameters that define file paths must be strictly validated to prevent unauthorized access, as the service itself might not prevent traversal relative to the working directory.
**Prevention:** Whitelist valid characters for filenames or strictly reject directory separators (`/`, `\`) and traversal sequences (`..`) before passing user input to file system or network APIs.
