# FitCheck

FitCheck is a browser-first virtual try-on widget. A shopper uploads a clothing product image from any retailer, grants camera access, and previews the garment over their live webcam view.

## MVP scope

- React, TypeScript, and Vite web app with a Pinterest-style lookbook board (`+ Try-On` cards) and a floating, draggable `Try-On + FitCheck` mirror window with a head-and-shoulders `"Step back"` framing silhouette.
- Dual local rendering engines: **Canvas 2D** (mesh warping with elbow-driven sleeve articulation) for uploaded raster garments and **Three.js 3D WebGL** for `.glTF / .GLB` garment models.
- Foreground occlusion using MediaPipe `ImageSegmenter` (`selfie_multiclass_256x256`) so hands, crossed bare forearms (for short-sleeved items), and head/hair appear in front of the garment.
- Product image upload (PNG, JPEG, WebP) and binary `.glb` 3D model upload (validated locally with external-URI rejection); no retailer account, WebRTC server, or WebSocket backend required.
- Local-first handling of camera frames and uploaded assets.
- A visual style preview only. It does not predict size, fit, fabric behavior, or purchase outcome.

The prototype is designed around a cut-out garment image (transparent background) and supported upper-body garments. Arbitrary product photos may need background cleanup before they align cleanly. A browser extension that reads arbitrary shop pages, a production catalog integration, accounts, checkout, and server-side image processing are out of scope for this MVP.

## Status

The user-confirmed target now includes replacing existing clothing, sleeve articulation, foreground hand/arm occlusion, flat-lay and model-worn garment inputs, 3–5-second preparation, and 24–30 FPS with local processing. The current overlay does not meet that contract. The [feasibility assessment](docs/TRY_ON_FEASIBILITY.md) records the accepted brief, reviewed candidates, and the unpassed implementation-selection gate.

The product brief is in [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md). Product, architecture, implementation, CI, privacy, and agent workflow documents are being developed alongside the first vertical slice.

## License and asset notes

The upstream webcam demo in the parent task was reviewed and cloned only as an isolated reference under the task workspace `work/Drakit-Try-On-reference`; FitCheck does not import its code or garment imagery. Its repo is MIT, but its two shop garment photos are not included and are not licensed by that repo. Review code, model, and asset licenses independently before commercial deployment.

