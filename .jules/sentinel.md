## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-01-06 - Path Traversal in FTP Download
**Vulnerability:** The `getCsvStreamFromFtp` function blindly trusted the `csvFileName` input, allowing attackers to use `..` or `/` to access files outside the intended directory.
**Learning:** Even when `client.cd()` is called, many FTP clients and servers allow subsequent commands with absolute or relative paths to override the current working directory context. Input validation is strictly required at the application boundary.
**Prevention:** Explicitly validate all file path inputs to ensure they contain only the expected filename and no directory separators or traversal sequences.
