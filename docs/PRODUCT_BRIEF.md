# FitCheck Product Brief

## Problem

Online shoppers often cannot picture a clothing item on their own body. Retailer product photos show garments on models, and product selection spans many sites.

## Outcome

Let a shopper bring a garment image from any shop into a simple try-on experience and see a live, pose-aligned visual preview using their webcam.

## Agreed decisions

- Platform-agnostic input: the shopper uploads or selects the chosen garment image. The MVP does not scrape shop pages or require a retailer API.
- Try-on mode: live webcam preview.
- Privacy: process camera frames in the browser; do not upload or persist user imagery.
- Commercial intent: keep the implementation and chosen assets/dependencies compatible with possible commercial use.
- Trust: describe the result as a style preview, not a size or fit guarantee.

## MVP boundaries

- A responsive web application with one garment preview at a time.
- Initially supports upper-body garment overlays using transparent/cut-out garment imagery.
- Camera start/stop, garment replacement/removal, search/filter over currently loaded local items when present, upload validation, and useful error states.
- Basic pose alignment in the browser.

## Not in MVP

- Automatic access to arbitrary retailer pages or a browser extension.
- Retailer search/catalog API integrations, account creation, cart or checkout.
- Measurement-based sizing or claims about fit, drape, or materials.
- Server-side processing or long-term storage of user photos/video.
- Autonomous policy/code edits as a self-improvement mechanism.

## Acceptance

1. A shopper can open the web app and choose a permitted garment image from disk.
2. With camera permission, the app shows the live preview and aligns the garment to detected upper-body landmarks.
3. The shopper can change/remove the garment and stop the camera; denied camera permission and unsupported/invalid images have clear recovery paths.
4. Camera frames and garment files remain local to the browser for the MVP.
5. Documentation explains setup, supported imagery, privacy behavior, limitations, CI, and the human-reviewed improvement loop.

