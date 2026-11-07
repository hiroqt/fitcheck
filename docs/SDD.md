# Software Design Description

## 1. Purpose

Describe the first implementation slice for FitCheck: select a garment image, explicitly start a webcam, track one upper-body pose, and render an aligned visual overlay locally in the browser.

## 2. System boundary

### Inside the browser

- React UI and app state.
- Raster file selection, validation, decode, preview, and cleanup.
- Camera permission request and `MediaStream` lifecycle.
- MediaPipe pose model and landmark tracking.
- Canvas/WebGL composition of camera frame and garment cut-out.
- User-visible loading, support, error, privacy, and limitation text.

### Outside the browser

- Static application bundle and pinned pose model/WASM assets may be fetched from the configured application/model host. These assets must be version-pinned and license-reviewed.
- No user media endpoint, database, analytics service, auth provider, retailer service, or inference provider exists in the MVP.

## 3. Runtime flow

1. App loads with no camera requested.
2. Shopper chooses a raster image. Validate MIME allowlist, encoded size, decoded dimensions, and image decode success before making it active.
3. Render a non-camera preview and image-quality/input instructions.
4. On explicit Start, request video-only camera access. If permission/device fails, show the reason and preserve the selected garment.
5. Initialize one pose tracker; schedule frame analysis without overlapping synchronous inference calls. Timestamp video frames monotonically where required by the runtime.
6. If landmarks meet confidence/visibility criteria, transform garment bounds from shoulder/hip landmarks and render the overlay. If not, hide the overlay and show a no-pose hint.
7. On Replace, update the selected local image; on Clear, revoke its object URL and clear the overlay.
8. On Stop, unmount, or error, cancel frame work, close the tracker, stop every media track, and release canvas/image resources.

## 4. Module responsibilities

| Module | Responsibility | Public boundary |
|---|---|---|
| `App` / page | Compose search/upload, controls, preview, and status | React component state and callbacks |
| `GarmentPicker` | Select, validate, preview, replace, clear garment | `File` in, validated image metadata/URL out |
| `CameraPreview` | Request/start/stop local video | Start/stop actions and status events |
| `PoseTracker` | Initialize MediaPipe, process eligible frames, report landmarks | Landmark result with confidence and timestamp |
| `TryOnCanvas` | Draw camera frame and garment overlay | Video element + image + validated landmarks |
| `useTryOnSession` or equivalent | Own resource lifecycle and error transitions | `idle → requesting → ready → error/stopping` state |

Keep modules at the fewest boundaries needed by the implementation. Avoid adding adapters, backend endpoints, or generalized retailer abstractions without an accepted requirement.

## 5. Key data contracts

### Garment image

- Raster input only: PNG, JPEG, or WebP; no SVG.
- MVP overlay expects a transparent/cut-out upper-body garment.
- Metadata: local object URL, pixel width/height, original file name for display only.
- Do not include file name in markup as HTML or send image bytes outside the page.
- Reject files over a documented provisional cap (recommend 10 MiB) or decoded dimensions above a documented cap (recommend 8192 on either dimension); confirm after memory/performance measurement.

### Pose snapshot

- Normalized image-space coordinates for left/right shoulder and left/right hip.
- Confidence/visibility per required landmark and frame timestamp.
- No pose or insufficient confidence is a normal state, not an exception.
- Stale data must not continue to claim the garment is tracking when frames stop.

### Try-on session state

`idle`, `requesting-camera`, `loading-model`, `tracking`, `no-pose`, `stopping`, `error`.

Allowed transitions are explicit: start from `idle/error`; permission to `loading-model`; model ready to `tracking/no-pose`; stop from all active states to `stopping` then `idle`; recoverable failures to `error`; retry from `error`.

## 6. Rendering approach

- Read video dimensions only after metadata is available.
- Use a 2D canvas for MVP composition unless measured complexity warrants WebGL.
- Derive garment center, width, tilt, and vertical position from shoulder line and shoulder-to-hip distance. Use a small temporal smoothing filter to reduce jitter.
- Handle mirrored preview consistently: either mirror both video and landmark/garment coordinates or mirror only the composed output.
- Keep aspect ratio; never stretch garment pixels independently on x/y.
- Avoid expensive per-frame React state updates; write latest frame/landmark values to refs and draw on animation frames.
- Do not claim physical cloth simulation or true 3D body reconstruction.

## 7. Security, privacy, and reliability

- Serve the camera path only from HTTPS or localhost.
- Call camera only after user action; request `audio: false`.
- Store no user media in localStorage, IndexedDB, logs, or server sessions.
- Use object URLs for selected files and revoke them on replacement/clear/unmount.
- Validate image MIME, byte size, and decoded dimensions; handle decode failure.
- Cancel animation callbacks and dispose MediaPipe resources on every exit path.
- Keep CSP and remote asset origins as narrow as the chosen runtime permits.
- Audit npm dependencies and all model/asset licenses; lock versions.
- Do not execute model/user content as script or HTML.

## 8. Accessibility and UX

- Explicit labeled Start/Stop, Change image, and Remove image controls.
- Keyboard-operable file picker and camera buttons with visible focus.
- Announce camera/model/error status via an accessible live region without announcing every frame.
- Maintain sufficient contrast; do not encode states by color alone.
- Provide concise framing/lighting instructions and a stable fallback when no pose is detected.
- Explain camera permission and local processing before activation.

## 9. Quality strategy

- Unit behavior checks at the visible public boundaries: file validation, session-state transitions/resource cleanup, and garment transform math.
- Component/browser flow: choose image, deny/allow camera, start/stop, replace/clear, and no-pose feedback.
- CI: formatting/lint, type check, unit checks, production build, and dependency audit on PR and MR.
- Manual review: representative desktop/mobile browsers, varied lighting/clothing/body shape, no camera, and camera interruption.
- Measure actual frame rate, model load, and memory; do not turn unmeasured targets into product claims.

## 10. Deployment

Static SPA hosting over HTTPS. No secret is required for the MVP. Pin model/runtime assets, inventory licenses, provide privacy/terms disclosures appropriate for the deployment jurisdiction, and configure repository main protection before release. Rollback is a static deployment rollback to a previously reviewed build.

