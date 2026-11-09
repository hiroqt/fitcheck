# Product Requirements Document

**Revision:** 2026-11-09 — Lucy 2.6 realtime integration.

## Summary

FitCheck is a local-development web app that lets a shopper preview a garment on a live camera stream using Decart Lucy 2.6. Lucy is a general realtime editing model with virtual try-on support; Decart also describes Lucy VTON as its dedicated optimized VTON model. The selected implementation uses Lucy 2.6.

## Functional requirements

- **FR-01:** Select one local PNG, JPEG, or WebP garment image up to 10 MiB.
- **FR-01a:** Decode the selected image locally, limit decoded dimensions to 4096×4096, and re-encode as WebP before sending it to the provider.
- **FR-02:** Preview the garment locally before starting the camera.
- **FR-03:** Request camera permission only after explicit start; request video only, no audio.
- **FR-04:** Connect the camera stream to Lucy 2.6 and show its returned remote video stream.
- **FR-05:** Send a descriptive prompt and selected reference image as the initial model state; replace/clear the image or apply an updated prompt without reconnecting.
- **FR-06:** Stop action, provider failure, session end, and component disposal disconnect the provider and stop all local media tracks.
- **FR-07:** Show useful states for missing input, permission errors, token errors, connecting, live, and disconnected.
- **FR-08:** Label output as a style preview and avoid size, fit, fabric, or purchase guarantees.

## Privacy and security requirements

- Explain before start that live video and garment image are sent to Decart, and that its published API terms allow submitted inputs and outputs to be used to operate and improve/train its services.
- Keep the permanent API key server-side. Never expose it through `VITE_*`, frontend code, source maps, or client responses.
- Mint short-lived client tokens per connect/reconnect; restrict each to Lucy 2.6, the exact requesting origin, and a bounded session duration.
- The local token endpoint accepts only same-origin requests from loopback, requires POST and a custom request header, returns no-store responses, and rate-limits issuance.
- Do not log, persist, cache, or otherwise store user imagery in FitCheck.
- Keep camera use explicit and stoppable. Stop every `MediaStreamTrack` on stop, error, permission flow cancellation, and unmount.

## Deployment boundary

The current endpoint is embedded in Vite's development and preview servers. It is for local business/professional evaluation only and does not make a static production bundle deployable. Current Decart API terms do not clear a consumer-facing production service. A production host must provide an equivalent hardened server route, secret management, HTTPS, user abuse controls, usage/cost limits, provider approval for the intended use, and reviewed privacy disclosures before launch.

## Non-goals

Retailer page access, ecommerce/account features, local image generation, storing inputs/outputs, or fit/size advice.
