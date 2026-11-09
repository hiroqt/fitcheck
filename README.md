# FitCheck

FitCheck is a local-development web app for live AI clothing previews with Decart Lucy 2.6. After the shopper selects a garment and starts the camera, the browser streams camera video to Decart over WebRTC and sends the garment image and outfit prompt as reference input.

## Run locally

Requirements: Node.js 22.12 or newer and a Decart API key.

1. Put your permanent key in the root `.env` file as `DECART_API_KEY=...`. `.env` is ignored by Git; never use a `VITE_` prefix or put the key in browser code.
2. Install dependencies with `npm install`.
3. Run `npm run dev` and open the local URL Vite prints.
4. Select a PNG, JPEG, or WebP garment image (up to 10 MiB and 4096×4096 pixels), review the data notice, and choose **Start virtual try-on** to grant camera access and connect.

The Vite development server also exposes `/api/realtime-token`. It mints 60-second tokens limited to Lucy 2.6, the requesting local origin, and a 10-minute session. The permanent key stays in the server process. Do not expose the dev server to a network.

If the app reports that the local token route is missing, stop the older Vite process and restart `npm run dev`; open the exact URL printed by the new server. Vite can choose another port when the old one is still occupied.

## Data and privacy

Camera video and garment images are sent to Decart while a realtime session is active. The browser requests video only, after a deliberate start action; stopping the session disconnects Lucy and stops all camera tracks. FitCheck does not save media locally or run its own image server. Decart's currently published [API terms](https://docs.platform.decart.ai/resources/api-terms) permit submitted inputs and outputs to be used to operate and improve/train its services. Users should not submit sensitive imagery or images they do not have rights to submit.

For production use, deploy a server-side token endpoint with authentication/abuse controls appropriate to the app, restrict token model and origin, configure the permanent key as a server secret, and publish an accurate privacy notice. A static Vite build alone does not include the token endpoint. Read [Security](docs/SECURITY.md) before deployment.

## Product limits

Lucy 2.6 supports realtime video editing, reference images, and virtual try-on prompts. Decart identifies Lucy VTON as its dedicated optimized virtual try-on model; FitCheck currently uses Lucy 2.6 per the selected product direction. The generated result is a visual style preview, not a fit, size, fabric, or purchase guarantee. Camera access, network quality, framing, and input image quality affect results.

## Checks

- `npm run typecheck`
- `npm test -- --run`
- `npm run build`

See [Product brief](docs/PRODUCT_BRIEF.md), [PRD](docs/PRD.md), [architecture](docs/ARD.md), [implementation](docs/SDD.md), and [security/privacy](docs/SECURITY.md).
