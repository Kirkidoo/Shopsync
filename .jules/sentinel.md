## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-01-20 - Path Traversal in FTP Service
**Vulnerability:** The FTP service accepted unsanitized filenames for download, allowing path traversal sequences (e.g., `../secret.txt`) to access files outside the intended directory.
**Learning:** Trusting user input (even indirectly) as a filename without validation allows attackers to traverse the filesystem. Libraries like `basic-ftp` often execute commands relative to the current directory, respecting `..`.
**Prevention:** Explicitly validate all filenames. Reject input containing directory separators (`/`, `\`) or traversal sequences (`..`) when the intent is to access a file in a specific directory.
