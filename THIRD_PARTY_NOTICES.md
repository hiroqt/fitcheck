# Third-party adaptation notices

## Drakit0/Try-On

FitCheck adapts the reference demo's adaptive One Euro filtering and foreground-compositing approach into TypeScript, alongside its existing Canvas TPS warp.

- Source: <https://github.com/Drakit0/Try-On>
- Reviewed revision: `64a8f5d3ae394b246e1ba9ab1e250fd12e0094da`
- Relevant files: `src/smoothing.py`, `src/segmenter.py`, `src/overlay.py`, `src/tps.py`, `app.py`.
- Authors/copyright: 2025 Pablo Tuñón Laguna, Lydia Ruiz Martínez.
- License: MIT; the full required notice is preserved in [licenses/Drakit0-Try-On-MIT.txt](licenses/Drakit0-Try-On-MIT.txt).

The Python/Streamlit application and its garment photos are not bundled. Its source garment coordinates are not valid metadata for arbitrary shirts. FitCheck keeps its own garment preparation and source-to-frame Canvas warp. The adaptation corrects side ordering, uses elapsed time for filtering, and applies foreground masking once without copying the upstream double-render or forward-to-inverse-remap errors.

## MediaPipe SelfieMulticlass model

- Runtime fetch: `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite`.
- Primary [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf), model date May 10, 2023, author Adel Ahmadyan/Google, states Apache License 2.0.
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
- Categories: background, hair, body-skin, face-skin, clothes, others; the runtime verifies this order before using the mask.
- The model is fetched on camera start; it receives frames in browser memory, not through an inference service. The model card cautions against expecting pixel-perfect masks, particularly in poor light, fast motion, and occlusion.

## Three.js (`three`)

- Package: `three` (`0.187.0`) and `@types/three` (`0.187.0`)
- License: MIT; the full notice is preserved in [licenses/three-MIT.txt](licenses/three-MIT.txt).
- Usage: Local WebGL 3D garment rendering (`THREE.WebGLRenderer`, `GLTFLoader`, and procedural 3D draped relief meshes). Bundled sample `.glb` files (`public/garments/*.glb`) are generated first-party by `createGarmentGlbBuffer` in `src/lib/garment3d.ts`.

This notice is not a complete license inventory for the original prototype or a clearance of all its dependencies, pose checkpoints, and assets for commercial release.
