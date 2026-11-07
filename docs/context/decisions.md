# Decisions

## 2026-11-07 — Make raster fit check a 2D body-contour warp
- **Source:** User correction: FitCheck is a 2D fit check; uploaded polo neckline must open around the wearer, and the fabric image must follow body composition rather than float as a tracked overlay.
- **Decision:** Default raster try-on to Canvas 2D mesh warping, fit per-side widths from segmented torso contours, infer a conservative polo collar opening from the uploaded image's symmetric collar notch, and remove the added 3D cylindrical shading. Keep the 3D GLB renderer as an explicit optional mode.
- **Status:** Implemented with silhouette and body-contour regression coverage; live webcam retest with the local WebP still pending.
- **Supersedes:** The earlier decision to default to 3D rendering and map uploaded raster images onto a 3D shell.

## 2026-11-07 — Wrap the selected shirt beyond the wearer silhouette

- **Status:** Implemented; automated checks pass. The source image top now maps to UV V=1 with `CanvasTexture.flipY=true` to keep the front upright; live upload retest is pending.
- **Source:** User clarified that the garment must wrap around shoulder tops, sides, and underarms while the detected body/pose remains intact; a torso cap/block is not the requested result.
- **Decision:** Remove person-silhouette clipping from garment compositing; narrow neck restoration to the neck instead of the broad ear-to-shoulder region that cleared shirt pixels across the upper chest. Retain eligible foreground-arm layers. Map the uploaded garment front onto a closed torso tube and longer, embedded sleeve tubes, with the source image upright on each UV island.
- **Limit:** This is still a geometric shirt shell with a sampled-color unseen side/back, not photorealistic cloth or removal/reconstruction of all existing clothing.
- **Supersedes:** Clipping the garment to the MediaPipe person-mask boundary.

## 2026-11-07 — Begin the staged 3D rendering foundation

- **Status:** Milestone 1 implementation in progress; not visually accepted.
- **Source:** User's master prompt requests the first milestone of a TypeScript/MediaPipe/Three.js, browser-local 3D try-on pipeline.
- **Decision:** Use the existing bundled, first-party GLB garment assets and Three.js loader for the sample wardrobe. Keep uploaded 2D images on the existing draped-relief path until a compatible prepared 3D template and texture mapping are justified. This begins the newly requested staged 3D work; it does not pass the earlier full replacement/speed/quality gate or the master prompt's overall definition of done.
- **Verification boundary:** Static asset loading and geometry can be checked automatically. Camera alignment and visual quality need manual browser review; no photorealism or real-time quality claim is accepted without that evidence.

## 2026-11-07 — Body-Aware Closed-Surface 3D Garment Rendering, 3D Body Proxy, and Hardware Depth Occlusion

- **Status:** Prototype experiment partially implemented; live appearance, representative pose coverage, and end-to-end performance are unverified.
- **Source:** User request to refactor the virtual try-on from a flat 2D overlay into a real-time, body-aware 3D garment rendering system solving uncovered torso edges, side-view collapse (`30°–90°`), foreground arm occlusion, and flat appearance.
- **Decision:** An optional Three.js renderer loads self-contained GLB garments and fits generated closed tube geometry to a heuristic body proxy. A separate feathered 2D segmentation mask restores eligible foreground head/hand/crossed-forearm pixels after rendering. The default raster path remains Canvas 2D; this prototype does not implement a skinned garment, full clothing replacement, or calibrated 3D reconstruction.
- **Supersedes:** The earlier proposed 3D-default architecture; the 2D raster correction keeps that renderer optional.

## 2026-11-07 — Local 2D Canvas + 3D Three.js/GLB Browser AR and Reference Floating Mirror UI

- **Status:** Accepted and implemented for local browser prototype.
- **Source:** User direction to apply the local Browser AR stack (`getUserMedia()`, `MediaPipe Pose Landmarker`, `Three.js`, `WebGL`, `glTF / GLB`, `Canvas 2D`, `Segmentation`, `HTTPS`, no `WebRTC`/`WebSocket`) and match the `@Bober_smart` reference experience (`+ Try-On` pin badges, floating `Try-On + FitCheck` window, and head-and-shoulders `"Step back"` framing silhouette).
- **Decision:** Keep all media processing 100% browser-local in Vite/React/TypeScript. Support both 2D TPS mesh warping (with elbow-driven sleeve articulation) and Three.js WebGL 3D rendering (`.glb` 3D garments with `Torso`/`SleeveLeft`/`SleeveRight` nodes plus 3D draped relief for 2D cutouts), composited with MediaPipe `ImageSegmenter` foreground hand/forearm/head occlusion and gated by a live `"Step back"` / `"Move closer"` / `"Center yourself"` framing check.
- **Limit:** Remains an illustrative local AR preview; does not stream video to a cloud generative VTON model or guarantee physical garment size/fit.

## 2026-11-07 — Worn-garment requirements and feasibility gate

- **Status:** User-confirmed in Q1–Q13; candidate selection has not passed.
- **Decision:** Accept flat-lay and model-worn garment photos; replace existing clothes; align collar/torso/sleeves with the uploaded sleeve length; support front-facing seated/standing movement, raised/bent arms, and hands crossing the chest with correct foreground occlusion. Side/back views are deferred. Hips may remain out of frame; relevant shoulders/elbows/wrists must be visible.
- **Timing/privacy:** Browser or same-computer processing only. Allow one-time model download/setup outside the 3–5-second preparation budget; target 24–30 newly processed live FPS. Plain missing fabric may be reconstructed; flag or reject inputs requiring invented distinctive details.
- **Gate:** Prove one shirt end to end before expanding; report unmet or unverified requirements rather than reducing quality or responsiveness silently. See [accepted brief and evidence](../TRY_ON_FEASIBILITY.md).
- **Supersedes:** Cutout-only overlay behavior as sufficient product acceptance. Earlier mesh/TPS decisions describe prototype experiments, not proof of the newly agreed experience.

## 2026-11-07 — User-supplied garment image and live camera

- **Status:** Accepted for MVP
- **Source:** User clarification during product discovery.
- **Decision:** Shoppers upload/select a garment image from any shop and use live webcam preview. No shop or product catalog was selected.
- **Reason:** Platform-agnostic without retailer credentials, scraping, or APIs.
- **Implications:** Product photo preparation/cut-out is a constraint; arbitrary retailer page reading is deferred.

## 2026-11-07 — Client-side processing and commercial viability

- **Status:** Accepted for MVP
- **Source:** User clarification.
- **Decision:** Keep user media local to the browser and choose code/model/assets with commercial use in mind.
- **Implications:** Every dependency, model/checkpoint, and demo asset license still requires review; avoid assuming the software license covers model weights or images.

## 2026-11-07 — Style preview, not fit promise

- **Status:** Accepted for MVP
- **Source:** Product analysis and user goal.
- **Decision:** Explain that overlay appearance is illustrative and does not predict garment size or fit.
- **Reason:** Pose overlays do not know body measurements, garment pattern, fabric, or actual physical drape.

## 2026-11-07 — Neckline-anchored overlay calibration

- **Status:** Accepted for MVP
- **Source:** User requested shoulder/neck reference points for the most accurate possible garment alignment.
- **Decision:** Use shoulders for width/tilt, estimate neck position from shoulder midpoint and a confidence-gated nose landmark, and provide an adjustable garment neckline anchor (default 17% from the top edge).
- **Limit:** The pose model does not supply a dedicated neck landmark. This heuristic is not calibrated fitting; no 99%/100% accuracy claim is supported.
- **Status update:** Superseded for the placement logic by the local torso-tracking decision below; face landmarks are no longer used to place clothing.

## 2026-11-07 — Local torso-tracked 2D overlay

- **Status:** Accepted for first improvement pass
- **Source:** User approval after reviewing the X reference clip.
- **Decision:** Keep camera and garment processing local; use confidence-gated shoulder/hip landmarks, smooth placement, retain rendering between pose samples, and preserve the existing 2D garment overlay approach.
- **Limit:** This improves tracking stability and torso-aware sizing but does not deform garments around the body or simulate realistic cloth folds. A fuller virtual try-on model requires a separate architecture and privacy review.

## 2026-11-07 — Face-safe torso mesh and person mask

- **Status:** Accepted
- **Source:** User approved implementation after sharing a preview showing the garment covering the face.
- **Decision:** Keep processing local; crop transparent garment bounds, estimate a neckline point from its alpha contour, warp it across shoulder-to-hip torso geometry, and clip it to both the torso region and MediaPipe's person mask.
- **Supersedes:** The prior simple shoulder/hip-scaled image placement; this remains a 2D upper-body overlay without realistic cloth folds.

## 2026-11-07 — Preserve garment silhouette during torso clipping

- **Status:** Accepted after reviewing the user's second preview.
- **Source:** User asked for consistent tracking and supplied a screenshot where person-mask clipping removed much of the shirt.
- **Decision:** Preserve the garment's source alpha silhouette; remove person segmentation mask clipping and the second torso-polygon clipping pass that cut away clothing. Overlap adjacent mesh triangles slightly, use stronger placement smoothing, and retain the last placement through brief detection loss.
- **Limit:** This reduces clipping, seams, and short flickers but does not provide 100% alignment or realistic cloth deformation.
- **Supersedes:** MediaPipe person-mask clipping of garment pixels.

## 2026-11-07 — Reject collapsed hip geometry

- **Status:** Accepted after the live preview showed a pointed, undersized shirt overlay.
- **Source:** User authorized live-camera inspection and requested a more consistent and accurate fix.
- **Decision:** Accept hip landmarks only when their width is 0.7–1.5 times shoulder width, center is below the shoulders and above 92% of frame height, and torso length checks pass; otherwise use a shoulder-width torso fallback. Keep the current local 2D mesh.
- **Limit:** The width bounds are a heuristic; validate across varied camera framing and body poses before making accuracy claims.

## 2026-11-07 — Garment-specific TPS mesh warp

- **Status:** Accepted for local MVP implementation.
- **Source:** User approved proceeding with the local implementation based on Drakit0/Try-On.
- **Decision:** Replace the coarse four-cell affine mesh with a browser-local thin-plate spline using garment-relative shoulder, waist, lower-torso, and neckline controls, rasterized through a 12×16 overlapping triangle grid. Derive torso geometry from hips only when plausible; otherwise estimate it from shoulders.
- **Reference:** Drakit0/Try-On README, `src/tps_mapper.py`, and `assets/garments.json`; its code is MIT, but its README says sample dress photos are separately owned. Implement the mathematical approach independently; do not copy its images or model data.
- **Limit:** This remains 2D image deformation; control points are heuristic and do not create cloth physics or guarantee accurate fit.

## 2026-11-07 — Regular torso mesh mapping

- **Status:** Accepted for the current implementation.
- **Source:** User's preview showed the shirt folding into a narrow point and requested full torso coverage that follows body movement.
- **Decision:** Map the complete garment across a neckline-aligned shoulder/hip quadrilateral using a regular 12×16 mesh; use the source alpha's lower width to keep narrow shirt bodies from collapsing; preserve local processing and source alpha.
- **Supersedes:** TPS control-point deformation, whose extrapolated shirt edges produced folds/pinching in the preview.
- **Limit:** This remains a 2D torso overlay. It does not simulate fabric, model hidden body surfaces, or keep sleeves occluded correctly when arms are raised.

## 2026-11-07 — Reapply TPS with reference waist mapping

- **Status:** Accepted after user asked to copy the reference behavior because the quadrilateral approach still failed.
- **Source:** User directed implementation based on Drakit0/Try-On; live test exposed a folding caused by pairing each shoulder directly with its hip.
- **Decision:** Use torso-center waist interpolation with shoulder-axis offsets, map shoulder/waist/lower-torso/neckline controls through TPS, derive lower source controls from the garment alpha hem ratio, and keep lower target points within the visible frame.
- **Supersedes:** Regular quadrilateral mapping as the primary renderer.
- **Limit:** Browser-local 2D deformation; camera retest confirms a full overlay in the tested seated upper-body framing, but it does not simulate cloth or guarantee universal fit.

