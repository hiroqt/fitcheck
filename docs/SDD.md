# Software Design Description

## Runtime

1. Load the FitCheck interface without requesting camera access.
2. Validate the selected garment's declared PNG/JPEG/WebP type and encoded size (maximum 10 MiB); decode locally, cap dimensions at 4096×4096, and re-encode to WebP before preview/provider use.
3. Before camera activation, show the provider data-use disclosure.
4. On explicit start, request video at Lucy 2.6's documented dimensions/frame rate with audio disabled.
5. The Decart SDK calls the same-origin `/api/realtime-token` route before each connection/reconnection. The local Vite middleware issues a short-lived model- and origin-restricted token using the permanent server-side key.
6. Connect using Lucy 2.6 with the prompt and reference image in initial state; render the returned remote stream.
7. Replacing the garment or applying a prompt calls `set()` with the complete desired state.
8. Stop, disconnect, failure, or unmount disconnects the session and stops all camera tracks; revoke the local thumbnail object URL when the garment changes or the app unmounts.

## Components

- `src/App.tsx`: picker, prompt, remote/local video elements, consent and status copy, realtime client lifecycle.
- `src/lib/garment.ts`: encoded type/size checks, decoded-dimension bounds, and safe raster re-encoding to WebP before provider submission.
- `vite.config.ts`: Vite local-dev and preview token middleware. Not a production deployment backend.
- `@decartai/sdk`: realtime WebRTC client and server-side token minting API.

## Token endpoint controls

- `POST /api/realtime-token` only; require a same-origin loopback Origin matching Host and `X-FitCheck-Request: 1`.
- No CORS headers; reject cross-site fetch metadata.
- Rate limit to 20 token requests per minute per direct client address.
- Mint tokens with 60-second expiration, `allowedModels: ["lucy-2.6"]`, `allowedOrigins: [origin]`, and a 600-second maximum realtime session.
- Return `Cache-Control: no-store`; return generic upstream errors. Never log credentials, token bodies, or user media.
- Load `DECART_API_KEY` from `.env` using Vite's server-only `loadEnv`; the frontend requests a fresh token through the SDK's `apiKeyProvider`.

## Limits

The app is a local development experience. Vite's production static build does not deploy this token API. Production requires an equivalent serverless/backend route and a deployment-specific security review. Input dimensions and encoded bytes are bounded locally, but provider-side limits and usage/cost controls should also be confirmed before production.
