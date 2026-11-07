# FitCheck

FitCheck is a browser-first virtual try-on widget. A shopper uploads a clothing product image from any retailer, grants camera access, and previews the garment over their live webcam view.

## MVP scope

- React, TypeScript, and Vite web app.
- Live pose tracking and garment overlay in the browser.
- Product image upload for platform-agnostic use; no retailer account or API required.
- Local-first handling of camera frames and uploaded images.
- A visual style preview only. It does not predict size, fit, fabric behavior, or purchase outcome.

The prototype is designed around a cut-out garment image (transparent background) and supported upper-body garments. Arbitrary product photos may need background cleanup before they align cleanly. A browser extension that reads arbitrary shop pages, a production catalog integration, accounts, checkout, and server-side image processing are out of scope for this MVP.

## Status

The product brief is in [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md). Product, architecture, implementation, CI, privacy, and agent workflow documents are being developed alongside the first vertical slice.

## License and asset notes

The upstream webcam demo in the parent task was reviewed and cloned only as an isolated reference under the task workspace `work/Drakit-Try-On-reference`; FitCheck does not import its code or garment imagery. Its repo is MIT, but its two shop garment photos are not included and are not licensed by that repo. Review code, model, and asset licenses independently before commercial deployment.

