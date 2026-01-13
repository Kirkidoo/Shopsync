## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2024-05-24 - Missing Path Traversal Validation in FTP Service
**Vulnerability:** `getCsvStreamFromFtp` accepted unvalidated filenames, allowing `../` traversal to access files outside the intended directory.
**Learning:** Documentation or "memory" stated validation existed, but the code did not implement it. Trust code over documentation. Input validation must happen at the service boundary.
**Prevention:** Validate all file path inputs immediately before use in file system or network operations (the "sink"), checking for `..` and directory separators.
