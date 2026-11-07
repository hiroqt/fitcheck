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
2. Shopper chooses a raster image or self-contained GLB. Validate its allowlisted type and encoded size; for raster images also validate decoded dimensions and decode success before making it active.
3. Reject images larger than 10 MiB or 4096 × 4096 decoded pixels. Downscale accepted images so the longest edge is at most 1600 pixels before compositing.
4. If the optional plain-background cleanup is enabled and the image has no existing transparency, estimate the background color from the four corners and remove edge-connected pixels within the configured color tolerance. Preserve the input image when the user disables cleanup.
5. Render a non-camera preview and image-quality/input instructions.
6. On explicit Start, request video-only camera access. If permission/device fails, show the reason and preserve the selected garment.
7. Load MediaPipe Tasks Vision WASM from the pinned jsDelivr URL and the pinned Lite Pose Landmarker model from Google Storage. Initialize one pose tracker; schedule frame analysis without overlapping synchronous inference calls. Timestamp video frames monotonically where required by the runtime.
8. If pose landmarks meet confidence/visibility criteria, derive a torso frame and chest/waist/hip contours, then fit raster shirts with the 2D mesh warp and fit optional GLB models with the 3D renderer. Preserve raster alpha and allow its fabric boundary to extend beyond segmented skin/clothing contours; use segmentation for eligible foreground hands/arms. A conservative collar heuristic may open a symmetric opaque polo interior; otherwise source alpha is retained. Smooth placement and tolerate brief pose loss before hiding the garment.
9. On Replace, update the selected local image; on Clear, revoke its object URL and clear the overlay.
10. On Stop, unmount, or error, cancel frame work, close the tracker, stop every media track, and release canvas/image resources.

## 4. Module responsibilities

| Module | Responsibility | Public boundary |
|---|---|---|
| `App` / page | Compose search/upload, controls, preview, and status | React component state and callbacks |
| `GarmentPicker` | Select, validate, preview, replace, clear 2D raster or 3D `.glb` garment | `File` in, validated image/GLB metadata out |
| `CameraPreview` | Request/start/stop local video | Start/stop actions and status events |
| `PoseTracker` | Initialize MediaPipe, process eligible frames, report landmarks | Landmark result with confidence and timestamp |
| `FramingGuide` (`src/lib/framing.ts`) | Evaluate head-and-shoulders framing (`step-back`, `come-closer`, `center`, `ready`) | `NormalizedLandmark[]` in, `FramingStatus` out |
| `TryOnCanvas` / `drawGarmentOnTorso` (`src/lib/garment.ts`) | Default to local Canvas 2D mesh warping of uploaded garment pixels using pose, per-row body contours, sleeve articulation, and the garment's own alpha; keep GLB rendering as an explicit optional 3D mode | Video element + raster garment + pose/body segmentation |
| `useTryOnSession` or equivalent | Own resource lifecycle and error transitions | `idle → requesting → ready → error/stopping` state |

Keep modules at the fewest boundaries needed by the implementation. Avoid adding adapters, backend endpoints, or generalized retailer abstractions without an accepted requirement.

## 5. Key data contracts

### Garment image

- Raster input only: PNG, JPEG, or WebP; no SVG.
- Maximum encoded file size: 10 MiB. Maximum decoded width and height: 4096 pixels each.
- Accepted images are downscaled locally before compositing so their longest edge is no more than 1600 pixels; aspect ratio is preserved.
- After optional local background cleanup, trim fully transparent margins and estimate the neckline anchor from the centerline alpha contour in the upper 40% and hem width from the widest alpha row in the lower 30% of the garment. An uncertain centerline falls back to the top center; product cut-outs remain the expected input.
- MVP overlay expects a transparent/cut-out upper-body garment. An optional plain-background cleanup estimates the background from the four corner pixels and removes connected edge pixels within RGB tolerance 42; it is intended for product-only images on a flat, consistent background and can remove garment pixels when their colors resemble the background.
- Metadata: local object URL, pixel width/height, original file name for display only.
- Do not include file name in markup as HTML or send image bytes outside the page.

### Pose snapshot

- Normalized image-space coordinates for left/right shoulders; their visibility is required for clothing placement. Face landmarks are ignored by the garment anchor.
- Confidence/visibility per required landmark and frame timestamp.
- No pose or insufficient confidence is a normal state, not an exception.
- Stale data must not continue to claim the garment is tracking when frames stop.

### Try-on session state

`idle`, `requesting-camera`, `loading-model`, `tracking`, `no-pose`, `stopping`, `error`.

Allowed transitions are explicit: start from `idle/error`; permission to `loading-model`; model ready to `tracking/no-pose`; stop from all active states to `stopping` then `idle`; recoverable failures to `error`; retry from `error`.

## 6. Rendering approach

- Read video dimensions only after metadata is available.
- Use a 2D canvas for MVP composition unless measured complexity warrants WebGL.
- Uploaded raster items use only the Canvas 2D triangulated warp. The mesh follows per-row wearer segmentation contours with a small fabric allowance and articulates sleeves from pose/segmentation. The source image's alpha defines the garment silhouette; a conservative symmetric twin-collar-notch detector opens opaque polo interior pixels so the wearer's neck shows through the item-shaped collar opening. If no confident notch is present, source alpha is preserved. The 2D path applies no synthetic 3D cylindrical shading and does not construct a parallel 3D mesh for raster uploads. Three.js remains an explicit optional GLB mode. A one-time browser console entry on local raster upload reports MIME type, prepared canvas size, 2D renderer/body-fit method, neckline/hem ratios, and inferred collar-opening ratios or that no cutout was applied; it never logs image pixels, filenames, frames, or landmarks.
- This 2D landmark heuristic does not reconstruct the neck/body surface or simulate cloth. Do not promise 99%/100% alignment or garment fit; accuracy must be measured across representative poses, cameras, and garment inputs.
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
- MediaPipe runtime/WASM is fetched from the pinned `@mediapipe/tasks-vision` version on jsDelivr; the pinned Lite Pose Landmarker model is fetched from Google Storage. These requests fetch static runtime/model assets only. Camera frames and garment pixels are processed locally and are not sent to either host or an application server.
- Garment mesh compositing stays in browser memory and pose results are released after each detection.
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

