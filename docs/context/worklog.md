# Milestone Worklog

## 2026-11-08 — Review and prepare try-on changes for PR

- **Goal:** Review the accumulated 2D and optional GLB try-on work, group it into reviewable commits, and deliver it through a reviewed PR.
- **Changed:** Guarded asynchronous image/GLB uploads against stale completion; capped GLB uploads at 64 texture entries and a combined 4096 × 4096 pixel budget across unique image/sampler variants before model parsing; corrected architecture, audit, feasibility, adaptation, README, and decision notes to describe the current 2D default and optional GLB renderer without claiming an implemented skinned mesh or unverified timings.
- **Checks:** `npm run check` passed (50 tests and production build); `git diff --check` passed. Independent static reviews found and this change fixed a stale-upload race, unbounded embedded textures (including WebP overrides, BasisU fallback, sampler variants, and empty-URI buffer-view cache keys), and documentation discrepancies. No live webcam/browser visual retest was performed in this delivery.
- **Next:** Update the open PR with the GLB texture bound, wait for its CI check, and merge after final review and required checks pass.

## 2026-11-07 — Keep uploaded raster try-on strictly on the 2D path
- **Goal:** Match the user's explicit 2D fit-check requirement and make the uploaded shirt follow the person rather than creating a hidden 3D cloth shell.
- **Changed:** Removed Three.js torso/sleeve mesh construction and shell telemetry from raster upload. Raster upload selects 2D; its 3D mode control is disabled. Upload diagnostics now identify the Canvas 2D mesh and segmentation-based contour fitting. GLB preview remains separate.
- **Checks:** `npm run check` passed (TypeScript, 49 tests, production build); `git diff --check` passed.
- **Limit:** Actual webcam appearance of the collar opening and contour fit was not retested because the available browser session is on a PDF, not the live app.

## 2026-11-07 — Keep the shirt shell outside the body mask

- **Goal:** Use the user's Downloads polo image and keep the garment wrapping around the person's shoulders, sides, and underarms as the detected pose moves.
- **Changed:** Removed segmentation-based clipping of garment pixels to the wearer's body boundary; narrowed the neck restoration region after finding the previous ear-to-shoulder polygon erased shirt pixels across the upper chest; kept eligible foreground-arm layers. Fixed the uploaded sleeve UV orientation and expanded each sleeve tube with a deeper shoulder overlap and more rings. Regenerated the three bundled GLBs from the same geometry generator so sample assets match source. Added regression checks for un-clipped garment edges, neck-only restoration, upright sleeve UVs, sleeve ring density, and torso/sleeve overlap.
- **Checks:** `npm run check` passed (TypeScript, 45 tests, production build); `git diff --check` passed. In the live browser, loaded the user's local Downloads WebP and started/stopped the actual webcam. Subsequent user screenshots still showed the polo details upside down and skin showing across the upper chest. Reversed the torso/sleeve V mapping based on those frames and narrowed the neck mask. No user imagery was added to the repository or transmitted.
- **Next:** Reload/reselect the local garment and verify the latest UV direction, collar coverage, and wrapped edges in a front-facing pose; assess movement while staying within view.

## 2026-11-07 — Correct raster garment texture orientation and expose build diagnostics

- **Goal:** Fix the uploaded polo appearing upside down/distorted and show what the raster renderer actually builds.
- **Cause:** Tube vertices are ordered from neckline to hem while CanvasTexture with `flipY=true` expects source top at UV V=1; the active V progression sampled the source upside down. The raster path projects one front photo onto a procedural torso tube and sleeve tubes; it does not recover a 3D garment, and unseen surfaces use sampled color.
- **Changed:** Reversed torso and sleeve V progression; added regression assertions for top/bottom UV and actual CanvasTexture flipY. Added one local-upload console record with safe metadata (MIME, canvas dimensions, neckline/hem ratios, built mesh names and ring counts, mapping, hidden-surface method, clipping status), plus a failure-stage/error console record. No filenames, pixels, webcam frames, or landmarks are logged.
- **Checks:** `npm run check` passed (TypeScript, 45 tests, Vite production build); `git diff --check` passed. Browser inspection confirms only the sample tee is selected and camera is idle, so live webcam retest with the Downloads WebP remains pending because reload clears the temporary upload.
- **Next:** Re-select the same local WebP after reload and visually confirm upright front mapping, neckline, sleeves, and movement.

## 2026-11-07 — Let the uploaded collar define the neck opening

- **Goal:** Match the visible neck cutout to the actual transparent outline in the uploaded garment image.
- **Cause:** `getForegroundAlpha` added a fixed pose-derived trapezoid for neck pixels. That operation erased the rendered shirt using body landmarks and produced the rectangular opening in the screenshot, overriding the polo collar shape.
- **Changed:** Removed neck-polygon erasure. The garment image's alpha now defines its collar/neck opening; body segmentation remains for eligible foreground hands/arms. Added a regression assertion that a detected neck does not generate a separate garment cutout and updated the SDD contract.
- **Checks:** Pending `npm run check` and `git diff --check`. The browser still has only the sample shirt selected; actual polo retest needs the local WebP reselected.
- **Next:** Verify the uploaded WebP neckline in the live 3D preview.

## 2026-11-07 — Fit the garment shell around estimated torso depth

- **Goal:** Make the wearer read as occupying the garment shell rather than standing behind a fixed-depth overlay.
- **Cause:** The render path already measured a 3D body proxy but only used it for debug geometry/arm occlusion; the generated garment retained a fixed front-to-back scale and depth center.
- **Changed:** Generated 7-ring shells now set their depth radius to the tracked torso proxy plus 2.5% shoulder-width fabric ease and center depth to the proxy torso center. Screen-space shoulder/chest/waist/hip placement remains the existing pose-mapping source. Added geometry-level regression coverage.
- **Checks:** `npm run check` passed (TypeScript, 46 tests, Vite production build); `git diff --check` passed. Live webcam retest with the uploaded polo remains pending.
- **Limit:** Body depth is inferred from landmarks, not measured by a depth camera; the raster asset remains a front projection with sampled-color hidden surfaces.

## 2026-11-07 — Conform the shell rings and sleeve direction to segmentation

- **Goal:** Address the remaining flat-panel look by using the torso/arm contours already extracted from each camera frame.
- **Cause:** The 3D fit only consumed coarse chest/waist/hip widths, despite `GarmentPlacement` carrying 33 per-row torso contour samples and segmentation-derived arm angles. Those angles were ignored when elbow landmarks were absent.
- **Changed:** Generated torso rings 3–6 now blend calibrated widths with smoothed segmented widths and center corrections, keeping a small fabric ease beyond the body. Sleeve angles fall back to segmentation-derived arm contours when elbow landmarks are unavailable. Added tests at the existing public mesh-fit/transform seam and documented the mapping.
- **Checks:** `npm run check` passed (TypeScript, 47 tests, Vite production build); `git diff --check` passed. Firefox is currently on a local PDF, so no current live preview/webcam is available to validate visually.
- **Limit:** This conforms a procedural shell to 2D segmentation; it does not recover real fabric drape or true garment side/back texture from one front image.

## 2026-11-07 — Make the 2D fit follow body contours and open the polo collar

- **Goal:** Keep the fit check 2D, shape the uploaded garment to the wearer's silhouette, and place the wearer's neck inside the uploaded polo collar.
- **Cause:** The active 2D Canvas path still applied synthetic 3D cylindrical shading and its telemetry claimed a 3D cylinder. The provided WebP has a symmetric polo collar notch but its black inner collar/tag pixels are opaque, so the neck painted over the wearer.
- **Changed:** Canvas 2D is now the default; its HUD/telemetry use 2D language, calibrated 3D chest widths no longer override 2D contours, the 2D warp uses left/right segmented torso widths with fabric ease, and synthetic cylinder shading is removed. Added a conservative twin-collar-notch inference and transparent neck aperture to the local cropped image; logged only normalized aperture geometry. No-confidence assets preserve their source alpha.
- **Checks:** `npm run check` passed (TypeScript, 49 tests, Vite production build); `git diff --check` passed. Firefox was on a local PDF, so actual live webcam/polo retest remains pending.
- **Limit:** The collar aperture is an image-shape heuristic; it does not infer garment construction for every collar style.

## 2026-11-07 — Collar opening and body-loop garment geometry

- **Goal:** Address the user's distinction: neck skin must emerge through the collar opening and the wearer must appear inside torso/sleeve loops; flickering was not the reported defect.
- **Changed:** `src/lib/tryOn.ts` preserves segmented neck pixels within the ear-to-shoulder collar region. `src/lib/garment3d.ts` builds raster garments as a tube torso with separate sleeve tubes, maps the garment cutout onto front-facing regions, fits generated torso rings to body slice estimates, and sizes prepared GLBs from their bounds. Added regression checks in `src/lib/tryOn.test.ts` and `src/lib/garment3d.test.ts`; updated the renderer boundary in `docs/SDD.md`.
- **Checks:** `npm run check` passed (TypeScript, 45 tests, production build); `git diff --check` passed. With the user's explicit authorization, started the actual webcam through the browser UI, observed the live preview, and stopped the camera. The observed pose was hunched/side-facing and partial; telemetry gave chest/waist estimates around 1,700 px and approximately 9–12 FPS. This was not a valid frontal acceptance test and does not establish the corrected collar/loop appearance.
- **Privacy:** No camera frames were saved or transmitted; camera is stopped.
- **Next:** Repeat visual acceptance in a centered, upright, front-facing pose. Do not describe this as a flicker fix or claim photorealistic fit.

## 2026-11-07 — Milestone 1: load prepared sample garments as GLB

- **Goal:** Start the user-requested staged 3D rendering foundation without rewriting the app.
- **Changed:** `src/App.tsx` now loads each sample's bundled first-party `.glb` through the existing validated Three.js loader; 2D Canvas fallback keeps the sample image. Superseded overlapping asynchronous sample/file loads cannot replace the latest selection. Existing GLB parser tests cover the loader; packaged assets are checked directly during this milestone. Updated the renderer boundary in `docs/SDD.md` and recorded scope/verification limits in `docs/context/decisions.md`.
- **Checks:** `npm run check` passed (TypeScript, 43 tests, production Vite build); a Node/Three.js loader check parsed all three shipped GLBs and confirmed their torso and sleeve nodes; `git diff --check` passed.
- **Limit:** No camera was started. This checks packaged mesh parsing, not landmark alignment, visual quality, frame rate, or the full try-on definition of done.

## 2026-11-07 — Intrinsic Garment Alpha-Silhouette Normalization, Full-Range Sleeve Skinning & Body-Mask Containment

- **Goal:** Eliminate bare shoulder gaps, floating horizontal sleeve wings, background bleed, and flat lighting seen in `media_1794057914020_e2232b1a.jpg` so garments wrap suit-like onto and inside the live segmented body silhouette (`cat === 2 || cat === 4`).
- **Changed:** Updated `src/lib/garment.ts`, `src/lib/garment3d.ts`, `src/lib/tryOn.ts`, `src/App.tsx`, `src/lib/garment.test.ts`, `src/lib/tryOn.test.ts`, and `docs/context/lessons.md`.
- **Checks:** `npm run check` (`tsc -b`, 43/43 unit & scenario tests across 5 test files, Vite production build), `npm audit --audit-level=high`, and `git diff --check`.
- **Next:** Ready for live webcam verification on collared polo shirts, tees, and jackets across resting, raised, and crossed arm postures.

## 2026-11-07 — Body-Aware 3D Garment Rendering Refactor, Online Adaptive Body Calibrator & Live Telemetry (Phases 1–10)

- **Goal:** Refactor FitCheck into a body-aware 3D garment rendering system with an online `AdaptiveBodyCalibrator` that learns personal body slice ratios (`deltoid`, `chest`, `waist`, `hip`) in real time from the webcam, classifies the 4 core body states (`standing-still`, `turning-sideways`, `raising-arms`, `crossing-arms`), and displays the 5-stage Browser AR pipeline telemetry (`Webcam` → `MediaPipe` → `Three.js` → `Depth-aware compositing` → `Live 3D virtual fitting room`).
- **Changed:** Added `src/lib/body3d.ts`, `src/lib/body3d.test.ts`, and `docs/3D_REFACTOR_AUDIT.md`; upgraded `src/lib/garment3d.ts`, `src/lib/garment3d.test.ts`, `src/lib/garment.ts`, `src/lib/garment.test.ts`, `src/lib/tryOn.ts`, `src/lib/tryOn.test.ts`, `src/App.tsx`, `src/styles.css`, `public/garments/*.svg`, and `public/garments/*.glb`.
- **Checks:** `npm run check` (`tsc -b`, 41/41 unit & scenario tests across 5 test files, Vite production build), `npm audit --audit-level=high`, and `git diff --check`.
- **Next:** Ready for live webcam verification with calibrated 3D skeletal skinning, multi-slice adaptive wrapping, and live 5-stage pipeline telemetry.

## 2026-11-07 — Local 2D + 3D Three.js/GLB Browser AR & Reference Floating Try-On UI

- **Goal:** Revise FitCheck to implement the full local Browser AR stack (`getUserMedia`, `MediaPipe Pose Landmarker`, `Three.js`, `WebGL`, `glTF/GLB`, `Canvas 2D`, `Segmentation`, `HTTPS`) and replicate the `@Bober_smart` reference UI flow (`+ Try-On` lookbook cards, floating draggable `Try-On + FitCheck` window, head-and-shoulders `"Step back"` silhouette framing guide).
- **Changed:** Added `src/lib/garment3d.ts`, `src/lib/garment3d.test.ts`, `src/lib/framing.ts`, `src/lib/framing.test.ts`, first-party `.glb` assets in `public/garments/`, `licenses/three-MIT.txt`; upgraded `src/lib/garment.ts`, `src/lib/garment.test.ts`, `src/lib/tryOn.ts`, `src/lib/tryOn.test.ts`, `src/App.tsx`, `src/styles.css`, `vite.config.ts`, and project docs.
- **Checks:** `npm run check` (TypeScript, 26 unit tests across 4 suites, Vite production build), `npm audit --audit-level=high`, and `git diff --check`.
- **Privacy:** 100% local in-browser processing; `.glb` validation rejects external URIs; no WebRTC/WebSocket or remote inference endpoints added.

## 2026-11-07 — Worn-garment feasibility gate

- **Goal:** Record Q1–Q13 decisions and assess a local pipeline for clothing replacement, articulated sleeves, hand occlusion, both garment-photo types, 3–5-second preparation and 24–30 FPS.
- **Evidence:** Read-only hardware inspection confirmed Apple M5/arm64/16 GiB; source inspection confirms the current app only warps an image and has no replacement or arm-occlusion model. Reviewed upstream documentation, model cards, Apple-support PR evidence, and streaming research, with independent read-only research review.
- **Result:** No reviewed candidate establishes the full contract. Current application fails required feature scope; no qualifying pipeline was locally benchmarked, so no measured M5 speed failure is claimed. No new application behavior was implemented.
- **Changed:** Added `docs/TRY_ON_FEASIBILITY.md`; linked the revised target from README/product/PRD/architecture/security docs and recorded user decisions. Preserved existing uncommitted app changes.
- **Checks:** `git diff --check` passed. Independent document review found one P3 wording issue about an unverified deployment claim; corrected to describe the local prototype. No model installation/download, camera activation, imagery processing, or inference benchmark. App tests/build not rerun for this documentation-only milestone.
- **Next:** Report the unpassed gate before expanding; resume only when a suitable released local pipeline or user-confirmed scope revision makes the gate testable.

## 2026-11-07 — Port reference TPS control-point behavior

- **Goal:** Follow the Drakit0/Try-On method more closely after the user reported the quad warp still failed.
- **Changed:** Replaced bilinear quad sampling with a browser-local thin-plate-spline mapping for shoulders, interpolated waist, lower torso, and neckline. Lower garment controls use the measured alpha hem-width ratio; lower target points stay within the visible camera frame.
- **Checks:** `npm run check` passed after the hem-ratio refinement (TypeScript, 9 tests, Vite production build); `git diff --check` passed. Live camera retest showed a full tee-shaped overlay on the torso in the tested seated upper-body framing; camera stopped afterward.
- **Privacy:** All image and camera processing remains client-side.

## 2026-11-07 — Face-safe torso mesh

- **Goal:** Stop the uploaded top from covering the face and make the garment follow the visible torso.
- **Changed:** Local garment-alpha crop/neckline estimation, shoulder-to-hip mesh warp, torso polygon and MediaPipe person-mask clipping; synthetic tests and architecture/privacy docs.
- **Status:** Implementation complete; `npm run check` passed (TypeScript, 6 tests, Vite build) and `git diff --check` passed.
- **Privacy:** Camera, segmentation mask, and garment pixels remain in browser memory. No live camera was started for verification.
- **Next:** Verify alignment in the live preview after the user starts the camera; no camera permission was requested during this implementation.

## 2026-11-07 — Stabilize torso-tracked overlay

- **Goal:** Fix blank-frame flicker and make the local 2D overlay follow the torso more consistently.
- **Changed:** `src/App.tsx`, `src/lib/garment.ts`, `src/lib/garment.test.ts`, `docs/PRD.md`, `docs/SDD.md`, and this context log.
- **Behavior at that milestone:** Confidence-gate shoulders and hips; use hips for torso size when plausible; smooth placement; tolerate two missed pose samples before hiding. Face landmarks remain excluded. See the later update below for current behavior.
- **Checks:** `npm run check` passed (TypeScript, 4 tests, and Vite build); `git diff --check` passed. Live camera behavior remains to verify.
- **Next:** Run full repository check; live camera check requires a separate explicit user action.

## 2026-11-07 — Preserve full garment overlay

- **Goal:** Keep the shirt from being clipped into an undersized shape and reduce mesh seam and tracking flicker shown in the user's preview.
- **Changed:** Removed segmentation-mask clipping; retained face-safe torso polygon and source garment alpha; overlapped mesh triangles by one pixel; increased pose-loss tolerance to five missed samples; adjusted smoothing and updated tests/design notes.
- **Checks:** `npm run check` passed (TypeScript, 6 tests, Vite production build); `git diff --check` passed.
- **Privacy:** No camera was started; media remains browser-local.

## 2026-11-07 — Guard against collapsed hip tracking

- **Goal:** Prevent narrow or unreliable hip landmarks from pinching the shirt overlay into a triangle.
- **Changed:** Added a relative hip-width and frame-edge plausibility gate with shoulder-width fallback and a regression case for collapsed/edge hip landmarks. Removed the second torso polygon clip after live retest showed it still pinched the garment; the garment alpha now defines its visible outline.
- **Checks:** `npm run check` passed (TypeScript, 7 tests, Vite production build); `git diff --check` passed. Live preview retest still showed the shirt low and clipped by the camera frame, so placement remains unresolved.
- **Privacy:** Camera was stopped after the preview checks; no camera or garment data was saved or transmitted.
- **Next:** Diagnose the live landmark-to-canvas coordinate mapping and neckline placement before claiming the overlay works.

## 2026-11-07 — Control-point thin-plate-spline warp

- **Goal:** Replace the visibly folded/split piecewise affine shirt with smoother garment deformation that works when only the upper body is framed.
- **Changed:** Added an independently implemented browser-local thin-plate spline with neckline, shoulder, waist, and lower-torso controls, a 12×16 raster mesh, and exact interpolation/affine regression coverage; updated product and architecture notes with the reference and 2D limitations.
- **Checks:** `npm run check` passed (TypeScript, 8 tests, Vite production build); `git diff --check` passed. Live preview retest pending.
- **Privacy:** No frame or garment data leaves the browser.

## 2026-11-07 — Keep the full shirt inside the torso mesh

- **Goal:** Remove the hem fold/pinch shown in the user's preview while keeping the garment attached to the tracked torso.
- **Changed:** Replaced extrapolating TPS controls with the existing neckline-aligned shoulder/hip quadrilateral and a regular 12×16 mesh; added an edge-preservation regression check and updated design notes.
- **Checks:** `npm run check` passed (TypeScript, 8 tests, Vite production build); `git diff --check` passed.
- **Limit:** This remains 2D and tracks the torso; it does not simulate cloth or occlude raised arms. Live-camera behavior was not observed in this turn.

## 2026-11-07 — Fit the garment hem to the torso

- **Goal:** Correct the second screenshot, where the sample tee's narrow lower image silhouette still collapsed into a point.
- **Cause:** The source tee's lower alpha width is much narrower than its sleeve/shoulder width; mapping the entire image bounds directly to the torso quad preserves that narrow hem.
- **Changed:** Measure the lower garment alpha width and widen the lower mesh mapping enough to keep the shirt hem on the detected torso; add a regression check for the hem-to-body width and document the heuristic.
- **Checks:** `npm run check` passed (TypeScript, 8 tests, Vite production build); `git diff --check` passed.
- **Limit:** Still a 2D torso preview without cloth simulation or raised-arm occlusion.

## 2026-11-07 — MVP delivered locally

- **Goal:** Build a platform-agnostic live try-on web app.
- **Decisions:** User-supplied garment image, webcam preview, browser-only user-media processing, commercial use remains possible, visual preview only.
- **Completed:** React/Vite live webcam overlay, raster garment upload validation, sample items, background cleanup, shoulder/estimated-neck alignment and adjustable neckline anchor; product, architecture, security, CI, hook, and context docs; PR/MR quality pipelines.
- **Checks:** `npm run check` passed (TypeScript, 3 unit checks, build); `npm audit --audit-level=high` reported 0 vulnerabilities; camera flow was visually checked locally after one-time user permission and stopped cleanly; Semgrep security scan had 0 findings on the tracked app files.
- **Next:** Create the requested private GitHub repository and verify PR-only branch protection after pushing the feature branch and opening a PR. Device/browser matrix and commercial license review remain release work.

