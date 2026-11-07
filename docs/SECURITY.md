# Security and Privacy Model

The 2026-11-07 [replacement-pipeline assessment](TRY_ON_FEASIBILITY.md) permits evaluating browser or same-computer inference. No local service has been integrated; the browser-only controls below still describe current media handling. Remote inference and persistent user imagery remain outside the agreed scope. A future local-service data flow must be reviewed before integration, including loopback access, allowed origins, cancellation, and media lifetime.

**Status:** design requirements for the MVP. Controls below are planned until verified in the implementation.

## Scope and protected data

FitCheck accepts a shopper-selected garment image and requests access to a live camera stream to render a visual try-on. The agreed design processes both inputs in the browser and does not upload or persist either image or video. No account, retailer API, checkout, or arbitrary-site access is in the MVP.

Treat both inputs as sensitive even though the selected garment image is usually public product imagery: a shopper can select the wrong file, and camera frames can reveal identity, surroundings, or other people. Protect user control over camera access, prevent active image content from executing, and avoid leaking imagery through logs, analytics, network requests, or saved artifacts.

## Trust boundaries and data flow

```text
Shopper file picker ── raster garment image ──┐
                                              ├─> browser decode / pose tracking / canvas preview
Shopper camera ── permissioned MediaStream ───┘                  │
                                                                  └─> display only
```

The browser, its same-origin application code, the hosting origin, package/model delivery sources, and the operating system camera are separate trust boundaries. A compromised application origin or dependency could access the stream while permission is active; client-side processing alone does not protect against malicious JavaScript.

## Required controls

### Camera and user imagery

- Request camera access only after the shopper activates **Start camera**; explain its purpose before the browser prompt.
- Use `getUserMedia` on HTTPS (localhost for development), request video only, and never request audio.
- Stop every `MediaStreamTrack` when the shopper stops the camera, leaves the try-on view, or the component is disposed. A visible active-camera state and a clear stop control are required.
- Keep frames in memory for the live preview. Do not send them to a backend, analytics, crash-reporting service, or third-party API; do not save screenshots or retain frames after stopping.
- Keep pose results and garment compositing in browser memory; release each pose result after rendering.
- On permission denial or missing hardware, explain the state and recovery path. Never retry permission prompts in a loop.

### Uploaded garment files

- Accept only explicitly supported raster formats (PNG, JPEG, and WebP up to 10 MiB / 4096×4096) or self-contained binary glTF 2.0 models (`.glb` up to 15 MiB); reject SVG, HTML, unknown formats, and any `.glb` containing external `buffers[].uri` or `images[].uri` references so uploaded 3D models cannot trigger outbound network requests.
- Validate declared type and decoded type, plus maximum file size and image dimensions, before allocating a large canvas or processing pixels. Show a useful error and allow replacement.
- Decode locally, downscale to a bounded working size, and release object URLs, image bitmaps, and temporary canvas resources when the item is replaced or cleared.
- Treat filenames and image metadata as untrusted. Do not render filenames as HTML, fetch embedded URLs, or execute image-provided content.
- Use transparent cut-out imagery for the MVP. Do not silently upload an image to a background-removal service.

### Web code, models, and dependencies

- Avoid raw HTML injection and dynamic code evaluation. Render user-controlled labels as text.
- Pin dependencies with a committed lockfile and audit dependency changes in CI. Review licensing and provenance for model files and non-code assets independently from package licenses.
- Prefer serving pose runtime/model files from the same controlled origin. If a CDN is introduced, pin exact versions, document the provider request, and use integrity controls where supported. The CDN must never receive camera or garment bytes.
- Use a restrictive Content Security Policy compatible with the app; limit `connect-src`, `img-src`, `media-src`, and `script-src` to required origins. Do not enable broad wildcard CORS or third-party script injection.
- Do not include camera frames, garment data, image-derived identifiers, blob URLs, or personal content in logs or telemetry.

## Abuse and resource limits

The MVP has no server upload endpoint, so its primary abuse risks are malicious image files, browser memory/CPU exhaustion, and dependency compromise. Enforce file-size/dimension limits and bound canvas/model work. Avoid processing more camera frames concurrently than the browser can handle; drop stale frames rather than queueing without limit. Fail closed to a no-preview state when decoding or tracking fails.

## User-facing accuracy and consent

Label the output a **style preview**, not a fit, size, fabric, or purchase guarantee. Do not infer or store body measurements. Camera use must remain optional; the app must explain that denying access leaves the live preview unavailable while still allowing the shopper to remove the garment or leave the page.

## Future browser extension boundary

Automatic detection on arbitrary shops is explicitly out of scope. If added later, request the narrowest host access possible and only after clear user action; prefer a user-invoked current-tab action over persistent all-site access. Read only the selected product image needed for preview, explain when cross-origin image access is unavailable, and keep the extracted image local. Do not scrape pages in the background, collect browsing history, inject remote code, or transmit page/user imagery. Reassess permissions, privacy notices, store policies, and extension-store rules before implementation.

## Residual risks and review checklist

- A compromised same-origin deployment or dependency can still observe the camera stream after permission is granted.
- Camera quality, lighting, pose, occlusion, and garment image quality can make alignment poor; pose alignment is not evidence of real-world fit.
- A selected product photo may contain a model, background, watermark, or protected image. MVP support is limited to suitable garment cut-outs, and shoppers must have rights to use the image.
- Browser permission behavior, HTTPS deployment, CSP, dependency/model provenance, and network requests require verification against the final implementation and deployment.

Before release, verify camera denial/start/stop/unmount behavior, confirm no image/video payload leaves the browser, test malformed/oversized raster files and SVG rejection, review production CSP and asset origins, run dependency auditing, and check that logs/analytics contain no image data. These are acceptance checks, not claims that they have already passed.
