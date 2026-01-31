## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-01-31 - FTP Credential Exposure in Client-Side Code
**Vulnerability:** The `getFtpCredentials` server action returned the plaintext FTP password to the client to pre-fill a connection form. This exposed the secret to any user with access to the UI (XSS risk, history, etc.).
**Learning:** Never send secrets to the client just to "autofill" them. If the server already knows the secret, it should keep it.
**Prevention:** Implement a "Masked Placeholder" pattern. Return `********` to the client to indicate a password exists. On the server, detect this placeholder and strictly substitute it with the stored secret *only* if the target host matches the authorized environment host (preventing SSRF/Credential Leaks).
