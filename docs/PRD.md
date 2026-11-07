# Product Requirements Document

## 1. Product summary

FitCheck is a browser-first live try-on widget for shoppers who want to preview a garment from any retailer on their own webcam image. The shopper supplies the garment image; FitCheck does not need access to the retailer's page or catalog.

## 2. Problem and user

**Primary user:** a shopper comparing clothing online who wants a quick visual cue for how an item might look on their body.

**Problem:** product photography typically shows an item on another person or on a product-only background. Shoppers have difficulty imagining the item on themselves.

**Desired outcome:** in one short flow, the shopper selects an image, enables the camera, and sees a garment overlay that follows their upper-body pose.

## 3. Product principles

1. Ask for camera access only after the user chooses to start the preview.
2. Keep camera frames and uploaded garment images in the browser; no account or upload endpoint is part of the MVP.
3. Make the quality boundary clear: this is a visual style preview, not sizing, fit, fabric, or purchase advice.
4. Work with a user-supplied image rather than attempting to read arbitrary retailer sites.
5. Make the core experience usable by keyboard and screen reader and provide a non-camera way to inspect the selected image.

## 4. Scope

### In scope

- Responsive web app built with React, TypeScript, and Vite.
- Select one local raster garment image (PNG, JPEG, or WebP); transparent/cut-out upper-body garment images are the supported input for the live overlay.
- Validate file type, decoded dimensions, and file size before using it.
- Preview and replace/remove the selected garment.
- Start/stop the webcam with explicit user action and browser permission.
- Detect a single visible upper-body pose and place/scale/rotate a garment overlay using shoulder/hip landmarks.
- Show clear permission, loading, no-pose, unsupported-image, and runtime failure states.
- Explain local processing, supported images, and visual-preview limits in the UI.

### Out of scope

- Scraping pages, reading retailer DOM, browser extension, bookmarklet, or broad host permissions.
- Retailer APIs, product feed synchronization, product search across merchants, accounts, cart, payments, or checkout.
- User photo uploads, cloud inference, analytics replay, persistent image storage, or server-side camera processing.
- Clothing physics, body measurement, size recommendation, fit prediction, fabric simulation, or guaranteed similarity.
- Multi-garment outfit composition and non-upper-body garment fitting.
- Autonomous agents changing application code, hooks, security policy, or project instructions.

## 5. User stories and requirements

### Garment selection

- **FR-01:** As a shopper, I can choose a garment image from my device so that I can try on items from any shop.
- **FR-02:** As a shopper, I can see a preview and name/type for the selected file before enabling my camera.
- **FR-03:** As a shopper, I can replace or clear the garment without reloading the application.
- **FR-04:** As a shopper, I receive a useful message when the file type, dimensions, size, or image decoding is unsupported.
- **FR-05:** As a shopper, I see input guidance that transparent/cut-out upper-body product imagery gives the best overlay.

### Live try-on

- **FR-06:** As a shopper, I can start the live preview after an explicit action and browser camera permission.
- **FR-07:** As a shopper, I can stop the preview; all acquired media tracks stop promptly.
- **FR-08:** When one upper body is sufficiently visible, the garment overlay follows shoulder position, width, and tilt using the detected pose.
- **FR-09:** When pose landmarks are absent or low-confidence, FitCheck pauses/hides the overlay and tells me how to recover; it does not keep presenting a stale position as current.
- **FR-10:** As a shopper, I receive a clear recovery message when camera access is denied, missing, already in use, or unsupported.
- **FR-11:** Switching or removing a garment updates or clears the overlay without restarting the camera.

### Privacy and trust

- **FR-12:** Camera frames and garment file pixels are not sent to an application server or stored by the app.
- **FR-13:** The app does not request camera access until the shopper starts try-on.
- **FR-14:** The app labels the result as an illustrative style preview and does not make fit or size claims.
- **FR-15:** The app exposes a clear stop-camera and clear-garment action.

### Accessibility and compatibility

- **FR-16:** Every action is keyboard operable, has an accessible name, and shows visible focus.
- **FR-17:** Camera status, loading, and errors are announced through an appropriate live status region.
- **FR-18:** The layout remains usable on common desktop and mobile viewport sizes; camera behavior depends on browser support and a secure context (HTTPS or localhost).
- **FR-19:** If camera permission is unavailable, the user can still inspect the selected garment image and the app explains why live preview is unavailable.

## 6. Nonfunctional requirements

- **Privacy:** local-only media handling for the MVP. No analytics SDK or remote inference service. Any future telemetry requires an explicit reviewed data contract.
- **Security:** allowlisted raster MIME types; verify the decoded image, cap dimensions/bytes, release object URLs/media streams, and never insert image/file names as HTML.
- **Performance:** on supported desktop hardware, target a stable interactive overlay at 15 FPS or better at the chosen camera resolution. Measure before claiming this target. Reduce work or report degraded tracking on weaker devices.
- **Reliability:** camera and model initialization failures must leave the user able to retry or exit; no uncaught failure may leave the camera active after stop/unmount.
- **Compatibility:** current evergreen browsers with `getUserMedia`, WebGL/WASM support as required by the selected pose runtime, and secure-context camera access. Verify the actual target browsers after implementation.
- **Maintainability:** typed boundaries for camera, pose, and overlay; keep MVP free of a backend and vendor catalog coupling.
- **Licensing:** maintain a dependency/model/asset license inventory. Commercial release is blocked until every shipped model, checkpoint, image, and code dependency has been checked for its actual license and terms.

## 7. Acceptance criteria

1. User selects a supported garment image; the UI shows it before camera access.
2. Starting camera requests permission; granting it shows the live image and pose-aligned garment overlay.
3. Replacing/clearing the image updates/clears the overlay while the camera remains under explicit control.
4. Stopping camera stops every media track and clears live rendering.
5. Denied permission, unavailable device, unsupported file, invalid image, and no-pose conditions show recovery guidance.
6. Camera video and garment pixels remain client-side; no code path posts them to a server.
7. Keyboard navigation, accessible labels/status, and visible focus are present across the flow.
8. CI checks formatting/lint, types, behavior checks, build, and dependency vulnerabilities on both pull requests and merge requests.
9. Hosted `main` rejects direct writes and accepts changes through the configured PR/MR process only.

## 8. Success measures

For a later real-user pilot, evaluate: percentage reaching first successful preview, time from file selection to preview, camera start failures, pose-tracking loss, retries, and qualitative garment alignment feedback. Do not collect video or raw garment images for analytics. Purchase conversion and return-rate claims require a separately designed study and retailer data.

## 9. Open questions

- Which browser/device matrix is the release target?
- Should MVP accept only transparent PNG/WebP, or implement a reviewed local background-removal step for ordinary product photos?
- What maximum file size/dimensions are appropriate after testing browser memory use?
- Which organization owns product-image/model license review before a commercial launch?
- What repository owner and GitHub ruleset permissions are available for the private remote?
