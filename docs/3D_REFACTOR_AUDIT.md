# Phase 1 Audit: Root-Cause Analysis & Body-Aware 3D Garment Architecture

Sections 1–2 record the prototype baseline when this audit began. Section 3 describes the current implementation; neither the original target architecture nor those baseline findings should be read as verified current behavior.

## 1. Inspection of the Existing Pipeline

| Subsystem | Current Implementation | Identified Deficiencies |
|---|---|---|
| **Webcam & Loop** (`src/App.tsx`) | `getUserMedia` (1280×960 ideal), `requestAnimationFrame` loop running MediaPipe `PoseLandmarker` and `ImageSegmenter` every ~33 ms. | Defaulted to `"2d"` Canvas mode; did not pass `worldLandmarks` or segmentation contour into a 3D skeletal body solver; no FPS/inference/render timing instrumentation; no debug inspection layer. |
| **Coordinate System** (`src/lib/garment.ts`) | 2D image-space landmark projection (`x * width`, `y * height`) with a scalar `atan2(dz, dx)` yaw approximation. | Lacks an orthonormal 3D torso basis (`right`, `up`, `forward`). When the user rotates 30°–90° sideways, 2D shoulder distance `\|x_R - x_L\|` foreshortens toward zero, causing 2D-derived torso scale and width to collapse. |
| **Garment Assets & Geometry** (`public/garments/*.svg`, `src/lib/garment3d.ts`) | 2D flat SVG cutouts and a 2.5D `PlaneGeometry` (`DrapedTorsoMesh`) deformed in `(X, Y)` by 2D Thin-Plate Splines, plus unskinned 3-part tube `.glb` primitives. | A 2.5D deformed plane has no side walls or back surface—turning 60°–90° exposes paper-thin edges. Flat SVG cutouts have deep V-shaped underarm cutouts that expose bare skin at the lats/deltoids. |
| **Body Fitting** (`src/lib/garment.ts`) | Heuristic 2D TPS control points derived from 2D skeletal shoulder joints (`11`, `12`). | MediaPipe landmarks `11` and `12` sit inside the glenohumeral joint sockets (~72% of outer deltoid width). Without a 3D volumetric body proxy + segmentation silhouette fitting, torso edges and lower abdomen remain uncovered. |
| **Arm Occlusion** (`src/lib/tryOn.ts`) | 2D post-pass `destination-out` mask over wrist-to-finger segments (`15→17/19/21`, `16→18/20/22`). | 1) Does not use Three.js WebGL hardware depth buffer (`gl.DEPTH_TEST`) with 3D arm/forearm capsule occluders. 2) When finger landmarks lose confidence (`< 0.5`) or forearms cross the chest, the 2D stick test fails or produces hard binary cutouts. |

## 2. Root Causes of the Four Core Visual Problems

1. **Uncovered body edges:**
   - Skeletal shoulder joints (`11`, `12`) are internal joint centers, not outer skin boundaries.
   - Flat 2D cutout assets contain concave underarm cutouts and narrow hems that do not adapt to the user's segmented torso silhouette (`category 2` body-skin + `category 4` clothes).
2. **Incorrect side-view rendering (30°–90° rotation):**
   - Measuring garment scale from 2D projected shoulder distance `hypot(x2 - x1, y2 - y1)` causes the garment to shrink as $\cos(\theta)$ when the user rotates by yaw angle $\theta$.
   - A deformed 2D plane (`PlaneGeometry`) has no closed side or back faces; rotating sideways collapses the projected width.
3. **Incorrect arm occlusion:**
   - No 3D depth-buffer occlusion exists between the user's upper arms/forearms/hands and the 3D garment mesh.
   - In 2D TPS mode, pulling sleeve control points toward crossed elbows drags the outer sleeve seam across the chest, folding the mesh inside-out.
4. **Flat "pasted PNG" appearance:**
   - Defaulting to 2D Canvas triangle warping or a flat front-facing relief grid lacks closed 3D tubular torso/sleeve geometry, skeletal skinning (`THREE.SkinnedMesh`), physically based roughness/normal shading, and inner body-proxy depth culling.

## 3. Current Implementation

- Raster uploads use the Canvas 2D mesh warp in `src/lib/garment.ts`; sleeve controls use pose and segmentation contours. The pose/body fit remains image-space geometry rather than calibrated 3D body reconstruction.
- Sample and uploaded `.glb` models use the optional Three.js renderer in `src/lib/garment3d.ts`. The default mode is Canvas 2D. Raster uploads cannot switch to the GLB renderer.
- `src/lib/body3d.ts` computes a heuristic body proxy used by the optional GLB renderer. It does not consume MediaPipe world landmarks or create a skinned skeletal garment.
- Foreground head/hand/crossed-forearm restoration is a separate heuristic mask in `src/lib/tryOn.ts`, applied after garment rendering. The 3D occluder geometry is used for debug visualization; it does not provide the live pixel foreground mask.

## 4. Verification Boundary

- `npm run check` covers TypeScript, unit tests, and a production build. It does not establish live camera appearance, representative pose accuracy, or garment replacement quality.
- Browser timings for isolated geometry methods are not end-to-end FPS measurements. No qualifying local benchmark for the accepted 24–30 newly processed FPS target is recorded here.
- Any timing claim must identify device, camera/output resolution, model settings, warmup, and whether inference and compositing are included.

## 5. Limitations

- A single front-facing garment image does not provide the unseen side/back artwork or physical cloth behavior.
- The current system overlays the selected garment; it does not remove existing loose clothes and reconstruct newly exposed regions.
- Sleeve articulation and arm/hand occlusion are heuristic and have not passed representative live-pose validation. This remains a style preview, not a garment size recommendation or proof of fit.
