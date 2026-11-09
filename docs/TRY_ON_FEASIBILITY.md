# Lucy 2.6 Integration and Release Gate

## Current direction

FitCheck uses Decart Lucy 2.6 for realtime camera-based garment/style previews. The provider docs describe 1280×720, WebRTC, prompt/reference-image editing, auto-reconnect, and VTON as supported; Decart describes Lucy VTON as the dedicated optimized model. The product owner has selected Lucy 2.6.

## Current local implementation

- User starts camera explicitly; video only, no audio.
- SDK connects to Lucy 2.6 with the prompt and garment reference image in initial state.
- Garment/prompt can be updated during the stream.
- Local Vite middleware mints short-lived tokens restricted to model, origin, and session duration.
- Stop/failure/unmount cleanup is implemented for realtime and media tracks.
- User notice discloses that video and garment image go to Decart and references Decart's current input/output improvement/training terms.

## Before production

1. Select a hosting/runtime target and implement the token endpoint there; do not deploy Vite middleware as a production API.
2. Protect token issuance with suitable user/session authorization and abuse controls; cap concurrent sessions and usage/cost.
3. Verify model capabilities, rates, account settings, current terms, retention and training practices with Decart; update user notice accordingly.
4. Add decoded image dimension/signature validation and behavior-focused tests for token security, camera lifecycle, update, stop, denial, and provider errors.
5. Review HTTPS, CSP and required provider network destinations; complete privacy/legal review for target jurisdictions.
6. Test on supported desktop and mobile browsers, including camera denial, reconnect, model errors, and stop while connecting.

## Known limits

Lucy output depends on network, provider availability, prompt/reference quality, framing, and model behavior. It is an illustrative style preview; no size, fit, fabric, or purchase outcome is guaranteed. Fast mode is intentionally omitted because provider docs state that it costs 2× standard realtime rate.
