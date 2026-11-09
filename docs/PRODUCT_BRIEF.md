# FitCheck Product Brief

**Direction update, 2026-11-09:** The app now targets live garment previews through Decart Lucy 2.6. This replaces the local browser overlay and from-scratch still-generation direction. The app is a local-development prototype; production hosting and privacy disclosures must be reviewed before release.

## User and outcome

Shoppers want to see a selected clothing item on themselves in a live camera preview. FitCheck lets a shopper select one garment image, optionally describe the desired look, grant camera permission, and receive Lucy 2.6's transformed realtime stream.

## Product behavior

- One garment image at a time: PNG, JPEG, or WebP up to 10 MiB.
- Camera starts only after the shopper selects **Start virtual try-on**; FitCheck requests video without audio.
- Lucy 2.6 receives the camera stream and the selected garment image/prompt. The returned remote stream is shown in the preview.
- The garment can be changed or removed during a session; the user can apply an updated prompt or stop the session.
- Stop, connection failure, or unmount disconnects the realtime client and stops all camera tracks.
- Output is an illustrative style preview, not a size, fit, material, or purchase guarantee.

## Data and trust

This app sends live camera video and the selected garment image to Decart during a session. The API key remains on the token-minting server; the browser receives a short-lived token limited to Lucy 2.6, the current origin, and a maximum session duration. Decart's published API terms state that it may use inputs and outputs to operate and improve/train its services. The UI must explain this before the user starts. See [Security and privacy](SECURITY.md).

The current token endpoint runs only in Vite's local development/preview server. Static production hosting is not supported until a reviewed server endpoint and deployment configuration exist.

## Out of scope

- Retailer scraping, browser extensions, product catalogs, accounts, checkout, or payments.
- Fit/size recommendations, body measurements, garment physics, or a guaranteed likeness.
- Local model training, user image persistence, or FitCheck-owned media processing services.
- Production deployment until the endpoint, key management, user disclosures, usage limits, and privacy terms are reviewed.

## Acceptance

1. Camera is not requested before the user starts a session.
2. A supported garment image and prompt are passed to Lucy 2.6; its returned stream is displayed.
3. Replacing the garment and applying a prompt updates the active session.
4. Stop, errors, and unmount disconnect the provider and stop every camera track.
5. The permanent key is never included in browser assets; local tokens are short-lived and scoped.
6. UI and docs accurately disclose remote processing and provider terms.
