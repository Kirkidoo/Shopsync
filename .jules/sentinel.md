## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2024-05-24 - Sensitive Data Exposure in Server Actions
**Vulnerability:** The `getFtpCredentials` server action was returning the unmasked FTP password to the client component, exposing it to potential leakage via XSS or network inspection.
**Learning:** Even if data is used to pre-fill a form, sensitive credentials should never be sent to the client. The client should only know *that* a value exists (e.g., boolean flag) or use a masked placeholder that the server recognizes.
**Prevention:** Mask sensitive data (e.g., `********`) before returning it from Server Actions. Implement server-side logic to detect this mask and substitute the actual secure credential from environment variables.
