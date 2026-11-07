import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getGarmentPlacement, MAX_GARMENT_DIMENSION, removePlainBackgroundPixels, validateGarmentFile } from "./lib/garment";

const MEDIAPIPE_VERSION = "1.2.2";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const DEMO_GARMENTS = [
  { name: "Soft cotton tee", color: "Sage · relaxed fit", image: "/garments/soft-tee.svg", tag: "EVERYDAY" },
  { name: "Denim trucker", color: "Indigo · classic fit", image: "/garments/denim-jacket.svg", tag: "LAYERING" },
  { name: "Linen button-up", color: "Natural · easy fit", image: "/garments/linen-shirt.svg", tag: "BREATHABLE" },
];

type CameraStatus = "idle" | "starting" | "running";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const garmentCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const frameRef = useRef<number>(0);
  const lastDetectionRef = useRef(0);
  const poseFoundRef = useRef(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [poseFound, setPoseFound] = useState(false);
  const [error, setError] = useState("");
  const [selectedName, setSelectedName] = useState(DEMO_GARMENTS[0].name);
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(DEMO_GARMENTS[0].image);
  const [necklinePosition, setNecklinePosition] = useState(17);
  const [search, setSearch] = useState("");
  const [cleanBackground, setCleanBackground] = useState(true);
  const [uploadLabel, setUploadLabel] = useState("Upload an item from any shop");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleGarments = useMemo(() => DEMO_GARMENTS.filter((item) =>
    `${item.name} ${item.color} ${item.tag}`.toLowerCase().includes(search.toLowerCase())), [search]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    const context = canvasRef.current?.getContext("2d");
    if (context && canvasRef.current) context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    poseFoundRef.current = false;
    setPoseFound(false);
    setCameraStatus("idle");
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const selectSample = useCallback(async (item: (typeof DEMO_GARMENTS)[number]) => {
    setError("");
    try {
      const image = new Image();
      image.src = item.image;
      await image.decode();
      const garmentCanvas = document.createElement("canvas");
      garmentCanvas.width = image.naturalWidth;
      garmentCanvas.height = image.naturalHeight;
      garmentCanvas.getContext("2d")?.drawImage(image, 0, 0);
      garmentCanvasRef.current = garmentCanvas;
      setSelectedName(item.name);
      setSelectedThumbnail(item.image);
      setNecklinePosition(17);
      setUploadLabel("Upload an item from any shop");
    } catch {
      setError("Could not load that sample garment. Refresh the page and try again.");
    }
  }, []);

  useEffect(() => { void selectSample(DEMO_GARMENTS[0]); }, [selectSample]);

  const processFile = useCallback(async (file?: File) => {
    if (!file) return;
    const validationMessage = validateGarmentFile(file);
    if (validationMessage) {
      setError(validationMessage);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setError("");
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      if (bitmap.width > MAX_GARMENT_DIMENSION || bitmap.height > MAX_GARMENT_DIMENSION) {
        throw new Error("Choose an image no larger than 4096 × 4096 pixels.");
      }
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const garmentCanvas = document.createElement("canvas");
      garmentCanvas.width = width;
      garmentCanvas.height = height;
      const context = garmentCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Your browser could not prepare this image.");
      context.drawImage(bitmap, 0, 0, width, height);

      if (cleanBackground) {
        const imageData = context.getImageData(0, 0, width, height);
        let hasTransparency = false;
        for (let index = 3; index < imageData.data.length; index += 4) {
          if (imageData.data[index] < 255) { hasTransparency = true; break; }
        }
        if (!hasTransparency) {
          removePlainBackgroundPixels(imageData.data, width, height);
          context.putImageData(imageData, 0, 0);
        }
      }
      garmentCanvasRef.current = garmentCanvas;
      setSelectedName(file.name);
      setSelectedThumbnail(null);
      setNecklinePosition(17);
      setUploadLabel("Your uploaded item");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open that image.");
    } finally {
      bitmap?.close();
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [cleanBackground]);

  const startCamera = useCallback(async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access needs a supported browser on localhost or a secure HTTPS page.");
      return;
    }
    setCameraStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("The camera preview is unavailable.");
      video.srcObject = stream;
      await video.play();

      const files = await FilesetResolver.forVisionTasks(
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
      );
      landmarkerRef.current = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      setCameraStatus("running");
      lastDetectionRef.current = 0;

      const draw = () => {
        const currentVideo = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!currentVideo || !canvas || !context || !landmarkerRef.current) return;
        if (currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && currentVideo.videoWidth > 0) {
          if (canvas.width !== currentVideo.videoWidth || canvas.height !== currentVideo.videoHeight) {
            canvas.width = currentVideo.videoWidth;
            canvas.height = currentVideo.videoHeight;
          }
          context.clearRect(0, 0, canvas.width, canvas.height);
          const now = performance.now();
          if (now - lastDetectionRef.current >= 33) {
            lastDetectionRef.current = now;
            const results = landmarkerRef.current.detectForVideo(currentVideo, now);
            const landmarks = results.landmarks[0];
            const found = Boolean(landmarks && landmarks[11]?.visibility && landmarks[12]?.visibility);
            if (found !== poseFoundRef.current) {
              poseFoundRef.current = found;
              setPoseFound(found);
            }
            const garment = garmentCanvasRef.current;
            const position = landmarks && garment
              ? getGarmentPlacement(landmarks, canvas.width, canvas.height)
              : null;
            if (position && garment) {
              const height = position.width * (garment.height / garment.width);
              context.save();
              context.translate(position.neckX, position.neckY);
              context.rotate(position.rotation);
              context.drawImage(garment, -position.width / 2, -height * (necklinePosition / 100), position.width, height);
              context.restore();
            }
          }
        }
        frameRef.current = requestAnimationFrame(draw);
      };
      frameRef.current = requestAnimationFrame(draw);
    } catch (caught) {
      stopCamera();
      if (caught instanceof DOMException && caught.name === "NotAllowedError") {
        setError("Camera access was blocked. Allow camera access in your browser settings, then try again.");
      } else if (caught instanceof DOMException && caught.name === "NotFoundError") {
        setError("No camera was found. Connect a camera or try a device with a built-in camera.");
      } else {
        setError(caught instanceof Error ? caught.message : "Could not start the live preview.");
      }
    }
  }, [necklinePosition, stopCamera]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="FitCheck home"><span className="brand-mark">f</span><span>fitcheck</span></a>
        <div className="topbar-right"><span className="privacy-pill"><span className="privacy-dot" /> private by design</span><a className="top-link" href="#how-it-works">How it works <span aria-hidden="true">↗</span></a></div>
      </header>

      <section className="intro" id="top">
        <div className="eyebrow"><span className="eyebrow-line" /> YOUR FITTING ROOM, ANYWHERE</div>
        <h1>See it on <em>you.</em></h1>
        <p>Bring a piece you found online. See how it looks on your live camera, right here.</p>
      </section>

      <section className="workspace" aria-label="Virtual try-on workspace">
        <aside className="wardrobe-panel">
          <div className="panel-heading"><div><span className="section-kicker">THE WARDROBE</span><h2>Choose your look</h2></div><span className="item-count">{DEMO_GARMENTS.length} pieces</span></div>

          <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the edit" aria-label="Search sample garments" /></label>

          <label className="upload-card">
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void processFile(event.currentTarget.files?.[0])} />
            <span className="upload-icon" aria-hidden="true">＋</span>
            <span className="upload-copy"><strong>{uploadLabel}</strong><small>PNG, JPG, or WebP · up to 10 MB</small></span>
            <span className="upload-arrow" aria-hidden="true">↗</span>
          </label>
          <label className="cleanup-toggle"><input type="checkbox" checked={cleanBackground} onChange={(event) => setCleanBackground(event.target.checked)} /><span className="toggle-track"><i /></span><span><strong>Clean plain backgrounds</strong><small>Works best with product-only images on a flat background.</small></span></label>
          <label className="neckline-control"><span className="neckline-heading"><strong>GARMENT NECKLINE</strong><output>{necklinePosition}%</output></span><input aria-label="Garment neckline position" type="range" min="6" max="36" value={necklinePosition} onChange={(event) => setNecklinePosition(Number(event.target.value))} /><small>Align the collar with the tracked neck point.</small></label>

          <div className="garment-list" aria-label="Sample garments">
            {visibleGarments.map((item) => (
              <button className={`garment-card ${selectedName === item.name ? "selected" : ""}`} key={item.name} onClick={() => void selectSample(item)} aria-pressed={selectedName === item.name}>
                <span className="garment-thumb"><img src={item.image} alt="" /></span>
                <span className="garment-info"><span className="garment-tag">{item.tag}</span><strong>{item.name}</strong><small>{item.color}</small></span>
                <span className="radio-mark" aria-hidden="true" />
              </button>
            ))}
            {visibleGarments.length === 0 && <p className="no-results">No sample pieces match “{search}”. Try uploading a garment image.</p>}
          </div>

          <div className="privacy-note"><span className="privacy-icon" aria-hidden="true">◉</span><p><strong>Your image stays yours.</strong><br />Camera frames and garment images are processed in this browser and are not uploaded or saved.</p></div>
        </aside>

        <section className="preview-panel" aria-label="Live preview">
          <div className="preview-topline"><div><span className="section-kicker">LIVE MIRROR</span><h2>Your preview</h2></div><div className={`tracking-state ${cameraStatus === "running" && poseFound ? "is-tracking" : ""}`}><span className="tracking-dot" />{cameraStatus === "running" ? poseFound ? "Tracking you" : "Find your shoulders" : "Camera off"}</div></div>

          <div className={`camera-stage ${cameraStatus === "running" ? "camera-on" : ""}`}>
            <video ref={videoRef} className="camera-video" autoPlay playsInline muted aria-label="Live camera preview" />
            <canvas ref={canvasRef} className="garment-overlay" aria-hidden="true" />
            {cameraStatus !== "running" && <div className="stage-placeholder"><div className="mirror-frame"><span className="corner corner-tl" /><span className="corner corner-tr" /><span className="corner corner-bl" /><span className="corner corner-br" /><div className="mirror-silhouette"><div className="silhouette-head" /><div className="silhouette-body" /></div><span className="stage-caption">YOUR CAMERA PREVIEW</span></div><span className="stage-side-label">01&nbsp; / &nbsp;LIVE FIT</span></div>}
            {cameraStatus === "starting" && <div className="camera-overlay"><span className="loader" /><span>Starting your private fitting room…</span></div>}
          </div>

          <div className="preview-controls"><div className="selected-piece"><span className="selected-swatch">{selectedThumbnail ? <img src={selectedThumbnail} alt="" /> : <span className="selected-upload-icon" aria-hidden="true">＋</span>}</span><span><small>NOW TRYING</small><strong>{selectedName}</strong></span></div>{cameraStatus === "running" ? <button className="camera-button camera-stop" onClick={stopCamera}><span className="stop-square" /> Stop camera</button> : <button className="camera-button" onClick={() => void startCamera()} disabled={cameraStatus === "starting"}><span className="camera-icon" aria-hidden="true">◉</span>{cameraStatus === "starting" ? "Starting…" : "Start live try-on"}<span className="button-arrow" aria-hidden="true">↗</span></button>}</div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <p className="preview-disclaimer">A visual style preview only. It may not accurately show fit, fabric, or drape.</p>
        </section>
      </section>

      <section className="how-section" id="how-it-works"><div className="how-header"><span className="section-kicker">THREE SIMPLE STEPS</span><h2>From scroll to <em>mirror.</em></h2></div><div className="steps"><article><span>01</span><h3>Find a piece</h3><p>Upload a product photo from any shop. Transparent PNGs and flat-lay images work best.</p></article><article><span>02</span><h3>Step in</h3><p>Allow your browser to use the camera. Pose tracking runs on your device.</p></article><article><span>03</span><h3>Make it yours</h3><p>Switch pieces and see how the look moves with you in real time.</p></article></div></section>
      <footer className="footer"><a className="brand footer-brand" href="#top"><span className="brand-mark">f</span><span>fitcheck</span></a><span>Made for the moment before “add to cart.”</span><span>© 2026 FITCHECK STUDIO</span></footer>
    </main>
  );
}
