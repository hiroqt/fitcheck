# Evidence-backed Lessons

## 2026-11-09 — Short-lived tokens protect credentials, not user media

- **Trigger:** Replaced local-only preview with Decart Lucy realtime processing.
- **Evidence:** Decart's client-token flow keeps the permanent API key server-side, while its realtime path still sends camera video and reference images to the provider. Its published API terms permit use of inputs/outputs for service improvement and model training.
- **Action:** Treat token security and media privacy as separate controls; disclose remote processing before camera start and review provider terms before production.
- **Status:** Confirmed from current Decart docs; local app has disclosure and scoped token controls, but no production service review.

## 2026-11-09 — Route the cropped collar anchor through the active mesh

- **Trigger:** In the live preview, shoulder placement looked plausible while the garment collar sat too low on the wearer.
- **Evidence:** The upload path passed `necklineX`/`necklineY` to `drawGarmentOnTorso`, but the active mesh builder mapped vertices from fixed normalized coordinates and ignored both values. The focused neckline regression failed by 67.76 px before the fix.
- **Action:** Map the detected source neckline to the 2D body's canonical neck point in the mesh builder itself, and keep a regression at that production seam.
- **Limit:** This anchors a 2D image point; it does not simulate cloth or guarantee fit.

## 2026-11-09 — Anatomical acromion shoulder seating, smooth adduction skinning, and silhouette symmetry

- **Trigger:** In `media_1794220047457_0b1b2b19.jpg` and `media_1794220026579_a2de7129.jpg`, the black polo displayed sharp 90° boxy Minecraft shoulder pads floating above the clavicle, raising an arm created an angular hump outside the body, and resting arms caused the underarm fabric to pinch and fold inside the chest.
- **Evidence:** 1) `shoulderHalfWidth` was inflated up to `0.67 × shoulderWidth` by segmentation noise, placing the shoulder seam 40+ px in thin air outside the acromion landmark (at $0.50 W$). 2) `measuredDrop` double-counted spine progression from $topSpine$, holding the seam 25 px above the shoulder line. 3) Discrete silhouette profile lookups (`torsoLeftU`/`torsoRightU`) had minor sub-pixel raster asymmetries that led to asymmetric sleeve rest angles. 4) A step-change in adduction skinning weight ($w=1.0$ at col 4 and $w=0.0$ at col 5) caused 10 px underarm cells to compress by 36 px during $19^\circ$ adduction, folding quads over the ribcage seam.
- **Action:** 1) Bound `shoulderHalfWidth` strictly to `Math.max(0.50, Math.min(0.53, segmentedHalfSpan * 0.94)) * shoulderWidth`, seating the seam directly on the wearer's real acromion joint with 0.5-inch tailored ease. 2) Account for spine vertical displacement in `measuredDrop` so the shoulder seam drops naturally onto the segmented trapezius contour ($\le 222$ px). 3) Symmetrize torso seam bounds and silhouette profiles about placket center ($0.5$). 4) Apply a graduated adduction weight transition across sleeve columns ($w = 1.0 \to 0.70 \to 0.35 \to 0$ at seam), allowing full $8^\circ$ resting arm tuck without mesh folding or inward chest pinch.

## 2026-11-09 — Continuous Linear Blend Skinning (LBS) across armscye, dynamic armpit detection, and natural trapezius shoulder slope

- **Trigger:** In `media_1794217146564_da2754f9.jpg`, raising an arm opened a gaping hole separating the sleeve from the torso, the shoulders formed exaggerated 90s boxy peaked corners, and the collar sat unnaturally on the neck.
- **Evidence:** 1) Skipping split columns during mesh rendering created a complete geometric tear between sleeve columns and torso columns whenever arms were raised. 2) Hardcoding `armpitV = 0.32` prematurely cut off the sleeve seam, leaving lower sleeve rows ($v \in [0.35, 0.54]$) to shear or invert against stationary ribcage fabric. 3) Discrepancies between top spine height (`0.30 W`) and shoulder drop (`0.14 W`) held outer seams ~48 px above the real acromion, creating sharp boxy shoulder pads.
- **Action:** 1) Enforce continuous monotonic mesh columns with no skipped quads across the armscye. 2) Dynamically detect the vertical armpit boundary (`bottomV` at `uLeft`/`uRight`) so skinning blends from the shoulder top down to the true armpit (~0.53). 3) Coordinate `topSpine` (`0.28 W`) and `defaultDrop` (`0.24 W`) to match natural human trapezius slope, landing the outer seams directly on the wearer's real acromion landmarks (`sl`/`sr`).

## 2026-11-09 — Split the 2D garment mesh at the underarm seam and clamp torso profile lookups to `[uLeft, uRight]`

- **Trigger:** Diagnostic sweeps (`-45°` to `170°` arm angles, independent arms, shoulder-top offsets) and resting-arm inspection showed: 1) inverted upper-torso/underarm triangles when sleeves rotated on a single connected grid, 2) sleeve cuffs shearing into two spikes on resting arms when inner-cuff vertices near `uLeft` received low rotation weights while outer-cuff vertices received full rotation, 3) outer sleeve edges kinking because `topV` (`bakedShoulderSlopeV`) and `segColTopY` (`trapDrop`) were sampled for `|s| > 1`, 4) torso half-widths (`0.62–0.64 × shoulderWidth`) covering hanging arms, and 5) two `smoothGarmentPlacement` passes on top of `PoseSmoother` increasing 90% step response at 30 FPS from `167 ms` to `567 ms`.
- **Evidence:** On a flat-lay shirt, the inner sleeve cuff (`u ≈ 0.21, v ≈ 0.54`) sits adjacent to the torso side seam (`u ≈ 0.23`), separated only by the underarm notch. Any continuous weight field $w(u)$ that vanishes at `u = 0.23` gives differential rotation across the cuff and shears it, or folds triangles connecting the sleeve to the ribcage at large arm angles. Meanwhile, rigid rotation (`det R = 1`) on a seam-split sleeve sub-mesh preserves triangle areas identically at all angles while keeping 100% source pixel coverage via zero-width source split columns.
- **Action:** 1) Place zero-width source split columns just outside the lower-torso span (`getTorsoSeamBounds` / `getColumnLayout`) and rotate sleeve columns rigidly around the shoulder pivot. 2) Clamp `topV`, `segColTopY`, and waist taper to `[uLeft, uRight]` (`|s| <= 1`). 3) Keep default and segmented torso half-widths within `~0.48–0.55 × shoulderWidth`. 4) Use `blendBodyMeasurements` in `src/App.tsx` so `PoseSmoother` is the single filter on joint landmarks while segmentation contours remain smoothed.

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
- **Action:** Read PNG/JPEG/WebP dimensions from embedded data URIs or GLB buffer views, follow the loader's WebP source override, BasisU fallback, and image/sampler cache key, and reject models with invalid samplers, more than 64 texture entries, or a combined decoded texture budget above 4096 × 4096 pixels before calling `GLTFLoader`; cover URI, buffer-view, sampler, extension, and aggregate-size cases with regression tests.

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


## 2026-11-09 — Source coverage is not body coverage

- **Trigger:** User's prepared-polo comparison reported zero garment-source samples outside the mesh, while the preview still read as a flat overlay.
- **Evidence:** The metric inspects source alpha against mesh cells; the camera was off, the output crop hid the hem, and neither target-space holes nor clothing replacement was measured. Current renderer warps existing pixels and has no fabric reconstruction model.
- **Action:** Name that metric source-texture containment, and gate try-on acceptance on visible body coverage, target-space continuity, replacement, articulated occlusion, and an observed complete garment boundary. Do not treat a high source coverage percentage as evidence of realistic dressing.
- **Status:** Validated by screenshot/UI inspection and renderer code review.

## 2026-11-09 — From-scratch try-on needs paired targets

- **Trigger:** User requested a FitCheck-trained generator with no pretrained try-on model.
- **Evidence:** The repository contains pose/segmentation helpers and geometric rendering only; it has no person/garment/target training triples. Public paired VTON datasets checked have noncommercial or restricted terms.
- **Action:** Before implementing training, secure a commercially usable paired corpus with explicit participant consent, define a split by person and garment, and approve a training environment. Never use production webcam imagery for training by default; evaluate realism and edge/detail quality separately rather than a single 99% score.
- **Status:** Validated by repository inventory and primary dataset/training source review.


## 2026-11-09 — Dataset license labels do not clear embedded third-party images

- **Trigger:** Screening Garments2Look as a possible commercial training corpus.
- **Evidence:** Its dataset card declares Apache-2.0 while identifying Mytheresa/Polyvore sources and requiring retention of third-party notices; the reviewed release does not state participant consent or item-level rights.
- **Action:** Before dataset download or model training, verify rights for image source, depicted people, generated targets, and trained weights separately. Treat unclear candidates as leads, not cleared data.


## 2026-11-09 — Landmark model tier changes need device-level retesting

- **Trigger:** Upgraded FitCheck from MediaPipe Pose Landmarker Lite to Full to improve live pose landmarks.
- **Evidence:** Google's published benchmark shows a higher PCK for Full than Lite, but its latency numbers are from older reference hardware and do not predict this app's end-to-end frame time.
- **Action:** Recheck actual shoulder/elbow placement and total frame latency on the target device before describing the preview as more accurate.
