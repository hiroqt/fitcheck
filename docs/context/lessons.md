# Evidence-backed Lessons

## 2026-11-07 — Normalize against the garment's intrinsic alpha silhouette (`GarmentSilhouetteProfile`), allow full downward sleeve rotation, and contain within the dilated body mask

- **Trigger:** In `media_1794057914020_e2232b1a.jpg` (black polo shirt), bare shoulders were exposed above the shirt, sleeves stuck out horizontally at `~38°` into the background wall while the user's real arms hung straight down at `~82°`, and diagonal triangle seams were visible on dark fabric.
- **Evidence:** 1) Collared garments have `15%–20%` of transparent air (`topV ≈ 0.18`) above the shoulder seams because the collar stand occupies `v = 0.00..0.15`; mapping `v = 0` to `segColTopY` subtracted the shoulder slope twice (`~95 px` drop). 2) Clamping downward sleeve rotation at `±0.20 rad` (`11.4°`) prevented a `39°` flat-lay sleeve from rotating down by the required `~40°` (`0.70 rad`) onto a resting human arm (`~80°`). 3) Without masking outside the dilated `cat === 2 || cat === 4` silhouette, any unaligned sleeve tip bled onto `cat === 0` background pixels.
- **Action:** 1) Precompute `GarmentSilhouetteProfile` (`topV`, `bottomV`, `torsoLeftU`, `torsoRightU`) on load so `(u, v = topV[u])` maps directly to `segColTopY[u]`. 2) Allow full physiological downward sleeve rotation (`±0.82 rad`) around the acromion pivot with fallback upper-arm angle estimation from the outer segmentation contour (`segArmAngleLeft`/`Right`). 3) Enable Chebyshev distance-feathered body-silhouette containment (`clipOutsideBodyMask: true`) in `getForegroundAlpha` and apply 3D cylindrical cloth shading.
- **Status:** The later 2026-11-07 2D-fit correction removed synthetic cylindrical shading from raster rendering; keep this historical note from being read as the current raster behavior.

## 2026-11-07 — Match `object-fit: cover` between `<video>` and `<canvas>` overlay and prune transparent 3D grid cells

- **Trigger:** In `media_1794056006554_3fda8bdf.jpg` (with `Seg Mask`, `Landmarks`, `Body Proxy`, and `Wireframe` enabled simultaneously), the green segmentation mask, orange face mask, cyan skeleton, yellow body proxy, and garment wireframe were all horizontally compressed to `~58.5%` of the user's real body width in the `<video>` behind them (`1.04 / 1.778` aspect ratio ratio).
- **Evidence:** `.floating-stage` has `aspect-ratio: 1.04 / 1` while the webcam stream is `16:9` (`1280×720`). `.camera-video` had `object-fit: cover;`, whereas `.garment-overlay` (`<canvas>`) only had `width: 100%; height: 100%` (`object-fit: fill`), causing the browser to horizontally squish the entire `16:9` canvas into the `1.04:1` container while cropping the video. Additionally, `PlaneGeometry` kept transparent background cells outside the garment silhouette, making `Wireframe` mode appear as a rectangular sheet.
- **Action:** 1) Set `object-fit: cover; object-position: center;` on both `.camera-video` and `.garment-overlay` in `src/styles.css` so `<canvas>` and `<video>` share identical 1:1 pixel coordinates. 2) Prune transparent background cells (`alpha < 12`) from the 3D garment `PlaneGeometry` index buffer (`pruneTransparentGarmentCells`) and include 3D upper-arm proxy capsules in `populateDebugVisuals`.

## 2026-11-07 — Use direct skeletal bone skinning, lock front/back 3D shell X, and gate arm occlusion on chest crossover

- **Trigger:** Live 3D wireframe and garment tests showed: 1) Thin-Plate Spline (TPS) matrix inversion spiking when an uploaded polo shirt had a deep neckline (`necklineY >= 0.12`), 2) `DrapedBackMesh` shifting horizontally relative to `DrapedTorsoMesh` when MediaPipe reported shoulder `z` noise on a bent arm, 3) scanning `category === 2` (`body-skin`) across outstretched bare arms inflating torso width, and 4) 3D geometric arm capsules or negative `z` on downward-hanging arms cutting a vertical pill hole through the shirt.
- **Evidence:** Unregularized TPS with inverted vertical control ordering oscillates wildly; applying `+ localZ * sin(yaw)` with opposite-sign `localZ` separates front and back shells in X; MediaPipe reports negative `z` on elbows/wrists resting near a desk even when arms hang down at the sides (`x ≈ shoulder.x`).
- **Action:** 1) Replace TPS in live rendering with analytical skeletal bone skinning (`mapGarmentBoneSkinPoint`) and clamp downward sleeve rotation at the solid deltoid rest angle (`~0.82 rad`). 2) Lock `x3d = center3DX + localX` for both front and back 3D shells with a `0.06` normalized shoulder-Z deadzone. 3) Clamp segmentation torso expansion to anatomical lat/ribcage bounds (`±0.24 * shoulderWidth` outside skeletal shoulder joints). 4) Require wrists/hands to cross medially inside the chest span (`[left.x + 0.08 * span, right.x - 0.08 * span]`) and use the feathered `ImageSegmenter` mask (`getForegroundAlpha`) rather than un-segmented 3D capsule holes during live rendering.

## 2026-11-07 — Run segmentation contour adaptation before garment rendering and pin torso side seams inside opaque fabric

- **Trigger:** User screenshots (`media_1794052717720_da471eaf.jpg`, `media_1794053168229_e50008ac.jpg`) showed uncovered side gaps along the lats/ribcage and side-view collapse when rotating.
- **Evidence:** 1) `App.tsx` previously ran `segmentForVideo` after drawing the garment and never called `adaptPlacementToBodyMask`. 2) In shirts with extended sleeves, mapping full image width (`u in [0..1]`) to the arms without tightening the waist/torso source control points (`sourceWaistRatio`) placed the transparent underarm gap over the user's outer chest. 3) Single-plane geometry has zero thickness at `60°–90°` yaw.
- **Action:** Always run `ImageSegmenter.segmentForVideo` and `adaptPlacementToBodyMask` before 3D/2D garment rendering, tighten `sourceWaistRatio` so control points sit inside the shirt's opaque torso seams, and use a closed 3D front+back shell rotated by foreshortening-compensated 3D `yaw`.

## 2026-11-07 — Evaluate the complete try-on contract

- **Trigger:** The user clarified that an intact shirt overlay still fails without replacement of existing clothing, articulated sleeves, and foreground hand occlusion.
- **Evidence:** The current renderer uses torso targets and garment alpha without a replacement model or elbow/wrist-driven sleeve/foreground masks. Upstream capabilities, hardware benchmarks, and component licenses do not establish this app's local performance.
- **Action:** Evaluate extraction, replacement, articulation, occlusion, temporal behavior, licensing, and complete local frame processing separately. A passing build, tracking guide, display FPS, or generated still does not prove worn-garment behavior.

Add a lesson only when an implementation result, scanner output, or user correction supports it.

## 2026-11-08 — Ignore stale garment-processing completions

- **Trigger:** Independent review of rapid replacement found that asynchronous image/GLB decoding could finish out of selection order.
- **Evidence:** Sample loads already used a request sequence, while file uploads did not check whether a newer sample/upload had superseded them after decode.
- **Action:** Give each upload a sequence ID and verify it after each asynchronous decode before changing renderer or selection state; suppress errors from stale operations.

## 2026-11-08 — Bound embedded GLB texture dimensions before parsing

- **Trigger:** Independent review found that a small uploaded GLB could contain a highly compressed image with excessive decoded dimensions.
- **Evidence:** GLB byte-size validation did not bound embedded image pixel counts before Three.js parsing.
- **Action:** Read PNG/JPEG/WebP dimensions from embedded data URIs or GLB buffer views and reject models whose combined decoded texture budget exceeds 4096 × 4096 pixels before calling `GLTFLoader`; cover URI, buffer-view, and aggregate-size cases with regression tests.

## 2026-11-07 — Shop image access and clean overlays

- **Trigger:** Scope discovery for cross-retailer try-on.
- **Evidence:** User selected upload as the platform-agnostic source; current MVP brief requires transparent/cut-out imagery.
- **Lesson:** A general product photo is not necessarily a garment cut-out. Label the accepted input requirements and test real product image types before promising automatic fitting.
- **Status:** Initial design constraint; validate during prototype evaluation.

## 2026-11-07 — Upstream prototype is reference material only

- **Trigger:** Evaluating Drakit0/Try-On as a starting point.
- **Evidence:** Its MIT repository excludes the shop garment photographs; it uses Python/Streamlit and does not match the requested modern browser stack.
- **Lesson:** Review source, dependencies, and each asset license separately; do not infer product-image rights from the code license.
- **Status:** Validated by repository inspection.

# 2026-11-07 — Keep canvas output between inference ticks

- **Trigger:** Garment overlay flickered because the canvas cleared on every animation frame while pose inference and garment drawing ran only about every 33 ms.
- **Evidence:** `src/App.tsx` had `clearRect` outside the pose-detection interval and drawing inside it.
- **Action:** Retain the latest placement, clear and redraw it on each display frame, and omit it after the pose-miss limit is reached.

