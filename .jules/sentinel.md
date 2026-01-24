## 2024-05-23 - Downgrade Attack in FTP Client

**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-01-24 - FTP Path Traversal Vulnerability

**Vulnerability:** The `getCsvStreamFromFtp` function in `src/services/ftp.ts` allowed unvalidated user input (`csvFileName`) to be passed directly to the FTP client's `downloadTo` method. This could allow an attacker to traverse directories (e.g., `../sensitive.txt`) and download files outside the intended folder.
**Learning:** Even when using a library that might abstract file operations, verify how it handles paths. Relying on `client.cd()` is not enough if the subsequent file operation allows relative paths that can escape the current directory.
**Prevention:** Always validate and sanitize file paths coming from user input. Explicitly check for directory traversal characters (`..`, `/`, `\`) before using them in file system or network operations.
