# Milestone Worklog

## 2026-11-09 — Review Lucy integration and prepare delivery

- **Changed:** Added the remote-processing and provider-terms notice directly before Start, guarded delayed errors from stale sessions, and added four token-endpoint tests for origin checks, token scope, method/key rejection, and rate limiting.
- **Review:** Independent spec and standards reviews found the missing pre-start disclosure and the stale-session race; both are fixed. The retained `public/local-garment.webp` is untracked, unused, and excluded from commits because its provenance is unclear.
- **Checks:** `npm run check` passed (TypeScript, 7 tests, production build); `git diff --check` passed; the local camera-off UI shows the pre-start disclosure. `npm run lint --if-present` found no lint script.
- **Blocker:** The provided `AGENTS.md` still says camera and garment pixels must never leave the browser, while this integration streams them to Decart. The branch is prepared locally; do not push/open the PR or merge until the user clarifies whether this specific privacy boundary has been superseded.

## 2026-11-09 — Replace local rendering with Decart Lucy 2.6

- **Goal:** Rebuild the app around the user's updated request to use Decart realtime Lucy 2.6.
- **Changed:** Replaced the Canvas/MediaPipe/Three UI with a Lucy realtime interface, explicit outbound-media/terms disclosure, short-lived scoped-token flow in Vite local middleware, and updated current product/architecture/security docs. Garments are locally decoded, dimension-checked, and re-encoded to WebP. Removed old renderer/training source and artifacts plus obsolete rendering reports. Kept `public/local-garment.webp` because its ownership was unclear.
- **Checks:** `npm run check` passed (typecheck, 3 tests, production build); `git diff --check` passed. Local token route minted a short-lived token with the configured key (HTTP 200; response discarded); cross-origin request returned 403; non-empty request body returned 413. The key was not found in production assets. Reviewed the camera-off UI in a local browser. No camera or garment media was sent to Decart.
- **Limit / next:** This is local development only. Production backend/hosting, usage and abuse controls, current provider privacy/retention/pricing review, and a real camera/WebRTC session remain open. Lucy 2.6 supports VTON but is not Decart's dedicated VTON model. `AGENTS.md` still has the previous local-only media rule; the repo requires policy changes via reviewed PR, so it remains a follow-up rather than being silently edited here.

## 2026-11-09 — Restore local token route

- **Goal:** Diagnose the UI's “Could not authorize a Decart session” message.
- **Finding / change:** `.env` had a configured key. The existing FitCheck Vite process on port 5173 returned 404 for `/api/realtime-token`; a fresh Vite instance returned a valid scoped token. Replaced the stale local process, restarted Vite on 5173, and improved client errors for 404/403/503/502/429 responses. Added a README restart note.
- **Checks:** Same-origin token request to the restarted server returned HTTP 200 with Lucy 2.6 permissions; no camera or garment media was sent. `npm run check` and `git diff --check` passed.

## 2026-11-09 — Extend segmented shoulder coverage

- **Goal:** Reduce the uncovered shoulder gap visible in the user's live preview.
- **Changed:** Increased the active mesh's segmentation-capped shoulder half-width from 0.54 to 0.62 of skeletal shoulder width and allowed the shoulder seam to use that measured span. Added a regression proving the segmented shoulder edge moves outward.
- **Checks:** Focused garment tests passed (26); `npm run check` passed (58 tests and production build); `git diff --check` passed.
- **Limit:** No live camera retest was performed. The wider seam may look oversized on other body shapes/poses and cannot create realistic cloth wrapping.

## 2026-11-09 — Add detail-aware scratch-training objective

- **Goal:** Address the prior generator's blurry output without introducing pretrained generation weights.
- **Changed:** Added a conditional PatchGAN discriminator and hinge adversarial objective alongside garment-weighted L1 reconstruction in `training/model.py` and `training/train.py`; added a gradient/shape regression and documented the experiment.
- **Checks:** `training/.venv/bin/python -m unittest` passed (2 tests); `npm run check` passed (TypeScript, 57 tests, production build); `git diff --check` passed.
- **Limit / next:** The new objective has not been trained or visually evaluated. No inference service or app still-preview flow is connected. Next run a bounded training/evaluation comparison and keep the app gated until held-out samples pass visual review.

## 2026-11-09 — Reduce live tracking latency and clarify sizing limits

- **Goal:** Address the screenshot's sluggish tracking and oversized-looking overlay without suggesting that the illustrative mesh provides physical garment sizing.
- **Changed:** Camera capture now requests no more than 640×480 to reduce synchronous pose/segmentation workload; debug telemetry calls its measurement “tracking FPS” instead of “FPS”. Updated SDD camera input contract.
- **Checks:** `npm run check` passed (TypeScript, 57 tests, production build); `git diff --check` passed.
- **Limit:** No live camera session was started. The app has no physical garment dimensions or user measurements, so its body-relative mesh cannot verify actual garment size; visual fit still needs live review.

## 2026-11-09 — Integrate dataset and scratch-training pilot

- **Goal:** Proceed with the realistic still-preview direction after the user confirmed commercial rights for Glance VTON Synthetic Pairs.
- **Changed:** Added `training/pyproject.toml`, `uv.lock`, `model.py`, `data.py`, `train.py`, `evaluate.py`, `test_model.py`, and `README.md`; ignored local environment/data/checkpoint outputs; updated README, PRD, product brief, ADR, SDD, security, feasibility, and live-preview copy. The app still does not call a generated model.
- **Checks:** `training/.venv/bin/python -m unittest` passed (1 test); `npm run check` passed (TypeScript, 57 Vitest tests, production build); `git diff --check` passed. Confirmed no training/evaluation process remains running.
- **Runs:** 6,000 scratch-initialized steps at 128×96 on MPS; 32 synthetic test rows gave masked MAE 0.0631 and whole-image MAE 0.0357. The preview remained blurry. A 1,000-step 256×192 pilot also remained blurry (32 rows; masked MAE 0.1074). A later 256×192 run reached 4,000 reported steps, then remote shard transfer stalled; it was stopped without saving.
- **Limit / next:** No user imagery used. Dataset split person/garment disjointness is unverified. Do not integrate the checkpoint into the app until garment detail and human realism improve; next improve architecture and stream reliability, then repeat held-out visual review.

## 2026-11-09 — Clarify that the live mesh is illustrative

- **Goal:** Avoid describing the current live overlay as a realistic garment fit while the generated still-preview model remains blocked on data rights.
- **Changed:** Updated `src/App.tsx` status labels from “2D body contour fit” / “garment fit to wearer contours” / “Body-wrapped” to explicitly describe illustrative overlay tracking and mesh alignment.
- **Checks:** `git diff --check` only; this was a copy-only change. No tests or camera session run.
- **Limit:** No still generator or inference service is integrated. The current live renderer still cannot remove existing clothes or reconstruct fabric.

## 2026-11-09 — Continue realistic still-preview feasibility

- **Goal:** Proceed toward replacing the illustrative live mesh with a generated image of the user wearing the selected garment, following the accepted from-scratch/local-processing direction.
- **Changed:** Screened the Glance VTON Synthetic Pairs card as a new structurally relevant dataset lead and checked the current host. Recorded the lead and its rights caveat in `docs/TRY_ON_FEASIBILITY.md` and `docs/context/decisions.md`.
- **Evidence:** Dataset card lists 12,506 men's upperwear training pairs, 2,032 test pairs, 19.6 GB total, and CC-BY-4.0, while stating generation used FLUX.1 [dev]. Current official FLUX [dev] terms are non-commercial absent a separate grant. Host is Apple M5/16 GB with 40 GB free disk; system Python has no PyTorch. Apple documents MPS support, but local training feasibility is unmeasured.
- **Checks:** Read-only web/source review and local hardware/environment inspection; no media, dataset, packages, or model weights downloaded or installed. `git diff --check` pending.
- **Next:** Obtain written confirmation that commercial model training on this dataset's generated images and resulting weights is permitted. Then run a bounded random-initialized low-resolution MPS feasibility pilot in an isolated environment; otherwise source/commission a cleared paired set.
- **Limit:** No realistic generation code or output was produced; the current Canvas overlay remains illustrative.

## 2026-11-09 — Align the uploaded collar with the body neck anchor

- **Goal:** Correct the visible collar/neckline offset while preserving the shoulder and sleeve tracking.
- **Changed:** Routed the detected garment neckline through both `mapGarmentBoneSkinPoint` and the Canvas 2D mesh renderer. The source neckline now maps to the body's normalized neck anchor (`v=0.08`); off-center source collars are translated to the torso center. Added a regression that exercises the active mesh builder.
- **Checks:** The regression failed before the fix (67.76 px vertical mismatch) and passed afterward. `npm run check` passed with 57 tests and production build; `git diff --check` passed.
- **Limit:** No live webcam retest was performed in this turn; current permission was not renewed. The fix aligns the collar anchor but does not create cloth simulation or photographic garment replacement.

## 2026-11-09 — Anatomical acromion seating, smooth sleeve adduction tuck, and realistic shoulder drape

- **Goal:** Fix the boxy peaked Minecraft shoulder pads, floating shoulder wings, and angular arm-raise hump seen in `media_1794220047457_0b1b2b19.jpg` and `media_1794220026579_a2de7129.jpg`, and resolve resting arm chest folding so the polo shirt wears naturally, realistically, and comfortably on the user's anatomy.
- **Changed:** Updated `src/lib/garment.ts`:
  - Seated outer shoulder seams directly at the user's acromion joints (`0.50–0.53 × shoulderWidth`) rather than allowing segmentation bounds to push seams out to `0.67 W`.
  - Adjusted `measuredDrop` in `torsoPoint` to properly account for spine progression, pulling the shoulder seam down snugly onto the shoulder contour ($\le 222$ px) and removing the flat boxy floating roof.
  - Symmetrized torso seam bounds and silhouette profiles about placket center, ensuring left and right sleeves track identical resting angles within $0.01^\circ$.
  - Implemented smooth graduated adduction weights across columns 2 to 5 ($w = 1.0 \to 0.70 \to 0.35 \to 0$ at seam), eliminating underarm cell compression and preventing fabric from folding into the chest when arms rest at the sides ($8^\circ$).
- **Checks:** `npm run check` passed (`tsc -b --pretty false`, `vitest --run` with all 56/56 passing tests across 5 test files, and `vite build`); `git diff --check` passed. No camera frames or landmarks were logged, stored, or transmitted.
- **Next:** User visual verification of the realistic polo overlay in live webcam try-on across resting, raised, and moving arm postures.

## 2026-11-09 — Inversion-free underarm-split sleeve articulation, torso width containment, edge decontamination, and single-pass joint filtering

- **Goal:** Eliminate visible mesh triangle inversions across the full supported pose range (`-45°` to `170°` arm angles, `180/300/450 px` shoulder widths, `-20°/0°/+20°` roll, independent arm / shoulder-top offsets), fix the severed sleeve gap (`media_1794217146564_da2754f9.jpg`), prevent the shirt torso from stretching over hanging arms, stop sleeve cuff tearing/kinking, remove light background edge fringes and collar-top spikes, and eliminate double joint-smoothing lag.
- **Changed:** Updated `src/lib/garment.ts`, `src/App.tsx`, and `src/lib/garment.test.ts`:
  - Replaced skipped split columns with continuous monotonic column distribution and Linear Blend Skinning (LBS) across the armhole seam. All quads across the armscye are drawn without voids.
  - Dynamically detect `armpitV` from silhouette profile lookups (`bottomV` at `uLeft`/`uRight`) so the blended armhole seam accurately spans from shoulder top to armpit (~0.53) rather than an arbitrary 0.32 cutoff.
  - Symmetrical Linear Blend Skinning ensures both sleeves track upper-arm elevation identically while remaining attached to the ribcage without triangle inversions across -45° to 170° abduction/elevation.
  - Lowered `topSpine` to `0.28 × shoulderWidth` and aligned `defaultDrop` (`0.24 × shoulderWidth`) to human trapezius slope, resting outer seams directly on acromion landmarks (`sl`/`sr`) to eliminate boxy 90s peaked shoulder pads.
  - Anchored collar notch and band to base of throat without sinking into chest or cutting into the neck.
  - Clamped `topV` (`bakedShoulderSlopeV`), `segColTopY` (`trapDrop`), and waist taper to the torso span `[uLeft, uRight]` so flat-lay sleeves are not kinked or capped before rotation.
  - Narrowed default and segmentation-adapted torso half-widths (`~0.49–0.54 × shoulderWidth`) so the shirt body stays on the torso inside hanging arms rather than covering the arms.
  - Added outer-boundary color decontamination and alpha feathering in `removePlainBackgroundPixels`, extended `neckOpening.topV` to `0` to remove top collar spikes, and reduced `drawTriangle` clip expansion from `0.85 px` to `0.35 px`.
  - Replaced the two redundant `smoothGarmentPlacement` passes on already-filtered landmarks in `src/App.tsx` with `blendBodyMeasurements` so tracked joints pass through without extra filter lag while segmentation contours remain smoothed.
- **Checks:** `npm run check` passed (`tsc -b --pretty false`, `vitest --run` with 56/56 passing tests across 5 files including the 396-case symmetric sweep, 180-case independent-arm/offset sweep, sleeve angle tracking, 100% source silhouette coverage, and `blendBodyMeasurements`, plus `vite build`); `git diff --check` passed. No camera was activated during this verification.
- **Next:** Visually evaluate the updated 2D polo overlay in a centered, front-facing live session across resting and raised arm poses.

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

## 2026-11-09 — Remove local photo-generation experiment

- At user request, stopped its loopback service and removed isolated runtime, model weights, dedicated package caches, app controls, proxy, startup command, and experiment documentation. Preserved original Downloads garment and unrelated 2D changes.
- Verified port 8765 has no listener; typecheck, 50 tests, build and diff checks pass. Shared Python tooling/dependency caches remain untouched.

## 2026-11-09 — Stabilize source sleeve attachment

- Screenshot shows pointed sleeves and distorted fabric. Traced the shared 2D map: per-row source torso widths moved the sleeve seam across rows; postrotation x clamping further compressed sleeve vertices.
- Sample the source torso width below sleeves consistently, bound segmented shoulder drop to 0.32 shoulder widths, and remove postrotation sleeve squeezing. Preserve existing pose tracking, original polo and local media boundaries.
- Added texture-column alignment regression. Live visual acceptance remains pending; no claim of clothing replacement or realistic cloth simulation.

## 2026-11-09 — Review try-on edge coverage and model feasibility

- **Goal:** Diagnose why the polo preview still does not look like the user is wearing it and inspect what the reported edge coverage proves.
- **Changed:** Added screenshot/code findings and current upstream local-model/license limits to `docs/TRY_ON_FEASIBILITY.md`; recorded that source-mask containment is not body-fit acceptance in `docs/context/lessons.md`.
- **Checks:** Re-read active Canvas renderer and feasibility brief; reviewed camera-off comparison screenshot; checked official FASHN, parser/SegFormer, CatV2TON and LiveVVT project/license information. No camera started; no model or weights downloaded.
- **Result:** No current mesh edit can deliver clothing removal and fabric reconstruction. Current local, commercial-capable, live-model gate remains unpassed; preserve mesh as illustrative until a compatible pipeline is available or accepted constraints change.

## 2026-11-09 — Accept local still-preview direction and preserve license gate

- **Goal:** Record the user's chosen direction after edge review.
- **Changed:** Updated product/PRD, ADR, SDD, security, feasibility and context docs to specify one user-triggered still preview, browser-to-`127.0.0.1` transfer on the same device only, and no image persistence. Existing live preview remains illustrative.
- **Checks:** Confirmed official FASHN parser license/inference behavior, Leffa model-card and training-data licensing, and current lack of a complete candidate; `git diff --check` passed. No model was downloaded or run.
- **Blocker:** User chose to wait for a fully commercially cleared model/pipeline. No inference endpoint or model has been added, installed, or run.

## 2026-11-09 — Specify from-scratch training and quality gates

- **Goal:** Reconcile the user's newest direction: no pretrained VTON generator, retain MediaPipe helpers, train a new still generator with rights-cleared consented data, and measure quality by separate criteria.
- **Changed:** Updated product/PRD, ADR, SDD, security and feasibility docs with paired-data schema, opt-in-only collection, split-by-person/garment evaluation, component metrics, and local training-compute gate. Recorded that “99% accuracy” is not a valid single realism metric.
- **Checks:** Read current app/model imports and project requirements; reviewed official VITON-HD/DressCode/FIT terms and CatVTON training resource report. No dataset/model downloaded; no user images used. `git diff --check` pending.
- **Blockers:** No paired training set or training budget/environment exists. No model or app code changed.


## 2026-11-09 — Screen new commercial-use dataset lead

- **Goal:** Continue sourcing rights-cleared and consented data for a from-scratch try-on generator.
- **Changed:** Reviewed Garments2Look and aRTF Clothes from official project/dataset pages. Recorded Garments2Look as a rights-unclear, large outfit-level lead; recorded aRTF as auxiliary garment-scene data that does not provide try-on triples.
- **Checks:** Read official GitHub/Hugging Face dataset cards, repository license notes, and dataset structure. No archives downloaded; no images or model weights accessed. `git diff --check` pending.
- **Blocker:** Written confirmation is needed for Garments2Look's underlying source images, depicted people, commercial training, and resulting weights. No cleared paired set or approved collection process exists.


## 2026-11-09 — Upgrade MediaPipe pose model tier

- **Goal:** Improve shoulder, torso, and limb landmark estimates used by the live garment renderer.
- **Changed:** Switched the existing MediaPipe Pose Landmarker asset from Lite to Full; retained on-device execution, one-person tracking, thresholds, and segmentation model. Updated SDD model provenance.
- **Evidence:** Google’s published BlazePose evaluation reports better PCK for Full than Lite; its reference-device timing is not a FitCheck/M5 result.
- **Checks:** Inspected the local Tasks Vision typings and official model guide. No tests or local camera check run. `git diff --check` pending.
- **Next:** Verify the Full model downloads and initializes on the user's browser/device, then compare shoulder/elbow placement and total frame latency under the same camera/framing conditions.
