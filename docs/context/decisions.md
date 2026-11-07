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

