## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-02-01 - Credential Exposure in Server Actions
**Vulnerability:** The `getFtpCredentials` server action returned the plaintext FTP password to the client to pre-fill a login form.
**Learning:** Server actions, while convenient, are public API endpoints. Returning sensitive secrets (like passwords) to the client—even for UI convenience—exposes them to anyone who can invoke the action.
**Prevention:** Return a boolean indicator (e.g., `hasPassword`) instead of the secret itself. Handle the actual secret server-side by substituting a placeholder value (e.g., `********`) with the environment variable only when trusted conditions (like a matching host) are met.
