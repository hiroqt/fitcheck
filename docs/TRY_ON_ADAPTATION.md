# Drakit0/Try-On adaptation

User direction on 2026-11-07: adapt Drakit0/Try-On into FitCheck rather than launching a separate Streamlit app. This is an implemented improvement to the overlay prototype; the [worn-garment feasibility contract](TRY_ON_FEASIBILITY.md) still has unpassed requirements.

## Source and corrections

The reviewed upstream revision is `64a8f5d3ae394b246e1ba9ab1e250fd12e0094da`. See [third-party notices](../THIRD_PARTY_NOTICES.md) for attribution and the full MIT license.

- Adopt the adaptive One Euro filtering behavior for image-space pose coordinates. Use actual elapsed time for position and velocity smoothing, with reset after tracking gaps; do not copy the fixed-FPS alpha calculation.
- Normalize garment geometry to image-left/image-right, matching corresponding hip indices. Construct missing hips along the shoulders' downward perpendicular. The previous anatomical/image-side mismatch could cross torso edges when hips were out of frame.
- Retain one source-to-camera-space TPS/Canvas warp. Do not copy the reference app's missing `warp_rgba` argument, forward mapping passed to an inverse sampler, or second affine transformation/composite over a previously warped result.
- Load the pinned six-class SelfieMulticlass model using the installed MediaPipe SDK. Mask the existing garment canvas once, exposing the underlying live video in foreground head/hand regions. Never restore the whole person, all bare torso skin, or existing clothes over the selected garment.
- Restrict hair/face predictions to the head side of the shoulder line, preventing isolated hair/face misclassifications from opening holes in the torso. Body-skin restoration uses confidence-gated wrist/finger points and, when enabled, estimated crossed forearm segments; this heuristic can miss or misclassify arms and does not establish reliable sleeve coverage.
- Require acquisition stability, but do not hide the garment merely because a previously locked person continues moving. Hide on bounded pose loss or missing video frames; stop the session on inference failure or prolonged frame starvation. Release both trackers and result masks, and ignore model-load completions from cancelled sessions.

## Browser and privacy behavior

Start/Cancel/Stop remain explicit user actions. Only model/WASM assets are fetched; frame and garment pixels remain in browser memory. No upload endpoint, new npm dependency, capture, recording, or imagery persistence is added. The head/hand mask is transient and discarded with the session. A category mismatch or inference error stops the camera and displays an error; there is no whole-person binary fallback.

## Evidence

- `npm run check`: TypeScript, 15 synthetic regression checks and Vite production build passed after the fixes.
- The synthetic checks cover mirrored anatomical labels with missing hips, matching hip correspondence, adaptive jitter/motion response, gap/reset behavior, category/depth/visibility gating, head-class false positives on the chest, and preserving covered forearms/old-clothing pixels under the selected garment.
- Authorized live preview: both models initialized; the shirt torso remained covered after head-region gating, and tracked hand regions appeared in front. Some hand edges were rough/partial. The UI returned to Camera off after Stop. No user imagery was saved as a fixture or artifact.
- The Cancel control was visible during startup, but models completed loading before the attempted cancellation, so cancellation during an active load was not established by that live attempt. Session cancellation is guarded in code; the final review checks that path statically.

## Unmet requirements

This is still a 2D warp with heuristic source controls. It does not automatically extract clothing from a model-worn product photo, remove existing loose clothing outside the overlay, articulate sleeves along elbows/wrists, reconstruct fabric/body/background, or provide reliable foreground forearm/sleeve occlusion. Hand masking depends on pose depth and skin segmentation and can fail in poor light or occlusion. The 3–5-second preparation and 24–30 newly processed FPS targets have not been benchmarked. An intact overlay is not proof that the user appears physically dressed in it.
