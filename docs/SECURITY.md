# Security and Privacy

## Data flow

```text
Local garment file ──> browser ── reference image + prompt ──┐
                                                            ├─> Decart Lucy 2.6
Camera (explicit start) ──> browser ── realtime WebRTC video ┘       │
Browser <──────────── transformed remote video stream ───────────────┘

Browser ── same-origin token request ──> local Vite middleware ── permanent key ──> Decart token API
```

Camera video and garment images leave the browser and are processed by Decart during a session. FitCheck does not save media to disk or send it to its own image-processing server. Decart's published [API terms](https://docs.platform.decart.ai/resources/api-terms) grant rights to use inputs and outputs to operate and improve/train its services and say inputs/outputs are not confidential. The terms limit API use to business and professional purposes, not personal or household consumer use. The UI discloses the data flow and use terms before Start; users should not submit sensitive imagery or content they lack rights to provide.

## Controls in this prototype

- Camera access begins only after the explicit Start action. Audio is disabled.
- The Stop action disconnects the Decart realtime client and stops every local media track. Failures and unmount also clean up resources.
- Garment type and encoded size are checked in the browser (PNG/JPEG/WebP, max 10 MiB). It decodes locally, enforces 4096×4096 dimensions, and re-encodes to WebP before the reference image leaves the page. Temporary object URLs are revoked when replaced or unmounted.
- The permanent `DECART_API_KEY` stays in the Vite server process. Never rename it to `VITE_DECART_API_KEY`, place it in client code, or commit `.env`.
- The local token endpoint requires POST, an exact same-origin loopback request, a custom header, and compatible Fetch Metadata; it has no CORS allowance, is rate-limited, and returns no-store responses.
- Tokens are limited to Lucy 2.6, the requesting origin, and a 10-minute maximum session. The SDK fetches fresh tokens when connecting/reconnecting.
- FitCheck does not log camera/garment bytes or persist generated media. Provider usage/account metadata may be visible to Decart under its terms.

## Deployment and residual risks

The endpoint runs only in Vite's local development/preview server. Do not expose the Vite server to a network or deploy the static build as if it included a secure token API. Production requires a separate backend/serverless implementation, HTTPS, origin controls, user authentication or equivalent abuse prevention, per-user/session usage limits, secret management, and review of current Decart terms, privacy notices, jurisdictional requirements, and pricing. Decart may retain/use submitted media under its current terms; FitCheck cannot enforce provider retention or training choices.

The image is re-encoded locally to prevent active source bytes from being sent, though browser decoder differences remain a residual risk. Production must add stronger file/resource and session abuse controls. Model output can be inaccurate and is not a fit or sizing measurement.
