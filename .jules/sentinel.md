## 2025-12-21 - Secure Handling of Pre-filled Credentials
**Vulnerability:** The server action `getFtpCredentials` was returning the raw FTP password to the client to pre-fill the connection form. This exposed the password in the network response and potentially the DOM.
**Learning:** Never send raw secrets to the client, even for "convenience" features like form pre-filling. The client is an untrusted environment.
**Prevention:**
1.  **Mask on Read:** When sending configuration to the client, replace sensitive values with a mask (e.g., `'********'`).
2.  **Unmask on Write:** In the server action that receives the form data (`getFtpClient`), check for the mask. If present, use the secure server-side environment variable. If the user provided a new value (not the mask), use that instead.
