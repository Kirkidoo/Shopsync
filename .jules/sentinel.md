## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-02-03 - Path Traversal in FTP Downloads
**Vulnerability:** The `getCsvStreamFromFtp` function allowed passing unsanitized filenames directly to the FTP client's `downloadTo` method, enabling path traversal (e.g., `../../etc/passwd`).
**Learning:** FTP clients like `basic-ftp` treat the filename argument as a remote path. If user input is passed directly, it allows accessing files outside the intended directory.
**Prevention:** Strictly validate or sanitize filenames to ensure they are basenames only (no `/`, `\`, or `..`) before passing them to file system or transfer operations.
