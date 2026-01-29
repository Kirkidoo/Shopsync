## 2024-05-23 - Downgrade Attack in FTP Client
**Vulnerability:** The FTP client was configured to automatically retry with an insecure connection (FTP) if the secure connection (FTPS) failed.
**Learning:** Automatic fallback mechanisms to insecure protocols create "downgrade attack" vulnerabilities. Attackers can intentionally block the secure handshake to force the application to transmit credentials in cleartext.
**Prevention:** Always default to "fail-secure". If a secure connection fails, abort the operation. Only allow insecure protocols if explicitly configured by the user (e.g., via an environment variable).

## 2026-01-29 - Server Action Credential Leak
**Vulnerability:** A Next.js Server Action (`getFtpCredentials`) was returning sensitive environment variables (FTP password) to the client component for form pre-filling. This exposed secrets to anyone who could inspect the network request or call the action.
**Learning:** Server Actions are public API endpoints. Never return secrets (passwords, API keys) from a Server Action to the client, even if they are intended for a "settings" form.
**Prevention:** Implement a "hasSecret" flag pattern. Return a boolean indicating the secret exists, and handle the actual secret injection entirely on the server side (e.g., in the service layer) when the action that *uses* the secret is called.
