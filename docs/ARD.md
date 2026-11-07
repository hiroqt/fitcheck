# Architecture Decision Record

## ADR-001: Browser-first platform-agnostic try-on

- **Status:** Accepted for MVP
- **Date:** 2026-11-07
- **Decision owners:** Product owner and implementation owner

### Context

The user wants shoppers to search/select clothes and see them on their own body, ultimately matching a live webcam demo. The user chose live webcam and asked for a widget usable with any shop. A specific shop/catalog was not available; the user selected uploading the selected garment image as the platform-agnostic path. The user wants commercial use to remain possible.

### Decision

Build a standalone responsive browser app/widget in React, TypeScript, and Vite. The shopper provides a garment image from disk. Pose tracking and overlay run in the browser using MediaPipe Tasks Vision and Canvas/WebGL as needed. Keep captured camera frames and uploaded garment pixels out of application-server requests and persistent storage. Start with one supported upper-body garment and one visible person.

### Consequences

- No retailer credentials, API integration, DOM scraping, extension permission, backend, or image hosting is required for the MVP.
- A shopper can use an image from any source, but must obtain/prepare the image themselves and must have rights to use it.
- Input quality and garment cut-out strongly affect results. A model-worn source image may not yield a clean garment overlay.
- Shoulder landmarks set garment width and tilt. A neck anchor is estimated from the shoulder midpoint and visible nose landmark; shoppers can adjust the garment image's neckline anchor. MediaPipe Pose does not directly detect the neck in this implementation.
- Pose alignment can look plausible without indicating actual size or fit; UI must not make fit claims or promise 99%/100% accuracy. A single 2D camera view lacks calibrated body measurements, garment patterns, depth, and fabric simulation.
- Runtime code/models are delivered to the browser. Their hosting, version pinning, license, and integrity are supply-chain concerns even though user media stays local.
- The supported browser/device matrix and image-size limit must be measured and documented before release.

### Alternatives considered

1. **Retailer catalog integration:** rejected for MVP because no merchant/platform or access was selected and it would not cover arbitrary shops.
2. **Browser extension that reads any shop page:** deferred because broad site permissions, cross-origin image access, and retailer layout changes expand scope and risk.
3. **Remote virtual try-on API:** rejected for MVP because it transmits user imagery and adds a vendor/license/cost dependency; it also changes the privacy promise.
4. **3D garment simulation:** deferred because per-garment 3D assets, rigging, and fit calibration are not available.
5. **Generated still image:** deferred as a separate mode; it does not provide the live interaction selected by the user.

### Security and privacy notes

- The browser prompts for camera only after the user activates try-on.
- Stop/unmount must call `MediaStreamTrack.stop()` on every track.
- Do not persist image/video frames, canvas captures, or camera recordings.
- Keep file parsing at an allowlisted raster-image boundary; reject SVG/HTML and cap resource use.
- No telemetry of image content. If remote telemetry/provider processing is proposed later, revise this ADR and the privacy data flow before implementation.
- Self-improvement context may record only non-sensitive summaries, technical decisions, and reviewed lessons; never retain a user's garment or camera image.

### Revisit when

A target retailer, actual product catalog, photo-based generation, production-grade fit claim, external inference service, or browser-extension interaction becomes part of accepted scope.

