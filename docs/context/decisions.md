# Decisions

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

