## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-01-29 - Path Traversal in FTP Filenames
**Vulnerability:** The application accepted user-supplied filenames for FTP downloads without validation, allowing path traversal (e.g., `../secret.txt`).
**Learning:** File system operations (even on remote servers like FTP) must validate filenames to prevent traversing outside the intended directory.
**Prevention:** Validate that filenames do not contain directory separators (`/`, `\`) or traversal sequences (`..`) before passing them to file operations.
