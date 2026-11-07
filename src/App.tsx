import { FilesetResolver, ImageSegmenter, PoseLandmarker } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AdaptiveBodyCalibrator,
  BodyFrameSmoother,
  constructBodyProxy3D,
  measureBodySliceProfile,
  type LiveBodyDiagnostics,
} from "./lib/body3d";
import { FRAMING_PROMPTS, getFramingStatus, type FramingStatus } from "./lib/framing";
import {
  adaptPlacementToBodyMask,
  cropGarmentCanvas,
  drawGarmentOnTorso,
  getGarmentPlacement,
  MAX_GARMENT_DIMENSION,
  removePlainBackgroundPixels,
  smoothGarmentPlacement,
  validateGarmentFile,
  type GarmentPlacement,
  type GarmentSilhouetteProfile,
} from "./lib/garment";
import {
  buildGarment3DGroupFromGlb,
  GarmentRenderer3D,
  validateGlbFile,
  type Garment3DPreset,
} from "./lib/garment3d";
import { getForegroundAlpha, PoseSmoother } from "./lib/tryOn";

const MEDIAPIPE_VERSION = "1.2.2";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const SEGMENTATION_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite";
const POSE_MISS_LIMIT = 6;

interface WardrobePin {
  id: string;
  pinUrl: string;
  name: string;
  color: string;
  image: string;
  glb: string;
  preset: Garment3DPreset;
  shortSleeves: boolean;
  tag: string;
  aspect: "tall" | "medium" | "compact";
  backdrop: string;
}

const DEMO_GARMENTS: WardrobePin[] = [
  {
    id: "1070449405218057229",
    pinUrl: "fitcheck://pin/1070449405218057229/soft-cotton-tee",
    name: "Soft cotton tee",
    color: "Sage · relaxed studio cut",
    image: "/garments/soft-tee.svg?v=3d2",
    glb: "/garments/soft-tee.glb?v=3d2",
    preset: "soft-tee",
    shortSleeves: true,
    tag: "EVERYDAY · 2D + 3D GLB",
    aspect: "tall",
    backdrop: "linear-gradient(160deg, #3b3530 0%, #24201d 100%)",
  },
  {
    id: "1070449405218057310",
    pinUrl: "fitcheck://pin/1070449405218057310/denim-trucker",
    name: "Denim trucker",
    color: "Indigo · structured fit",
    image: "/garments/denim-jacket.svg?v=3d2",
    glb: "/garments/denim-jacket.glb?v=3d2",
    preset: "denim-jacket",
    shortSleeves: false,
    tag: "OUTERWEAR · 2D + 3D GLB",
    aspect: "tall",
    backdrop: "linear-gradient(160deg, #dad5cc 0%, #b8afa2 100%)",
  },
  {
    id: "1070449405218057488",
    pinUrl: "fitcheck://pin/1070449405218057488/linen-button-up",
    name: "Linen button-up",
    color: "Natural · breathable weave",
    image: "/garments/linen-shirt.svg?v=3d2",
    glb: "/garments/linen-shirt.glb?v=3d2",
    preset: "linen-shirt",
    shortSleeves: false,
    tag: "TAILORED · 2D + 3D GLB",
    aspect: "medium",
    backdrop: "linear-gradient(160deg, #232629 0%, #121417 100%)",
  },
  {
    id: "1070449405218057592",
    pinUrl: "fitcheck://pin/1070449405218057592/field-overshirt",
    name: "Field utility jacket",
    color: "Slate blue · layered collar",
    image: "/garments/denim-jacket.svg?v=3d2",
    glb: "/garments/denim-jacket.glb?v=3d2",
    preset: "denim-jacket",
    shortSleeves: false,
    tag: "EDITORIAL · 2D + 3D GLB",
    aspect: "compact",
    backdrop: "linear-gradient(160deg, #4b5248 0%, #2b3029 100%)",
  },
  {
    id: "1070449405218057641",
    pinUrl: "fitcheck://pin/1070449405218057641/atelier-poplin",
    name: "Atelier resort shirt",
    color: "Warm ecru · relaxed drape",
    image: "/garments/linen-shirt.svg?v=3d2",
    glb: "/garments/linen-shirt.glb?v=3d2",
    preset: "linen-shirt",
    shortSleeves: false,
    tag: "LOOKBOOK · 2D + 3D GLB",
    aspect: "tall",
    backdrop: "linear-gradient(160deg, #6b675e 0%, #3a3731 100%)",
  },
  {
    id: "1070449405218057704",
    pinUrl: "fitcheck://pin/1070449405218057704/boxy-rib-tee",
    name: "Boxy heavyweight tee",
    color: "Seafoam · dropped shoulder",
    image: "/garments/soft-tee.svg?v=3d2",
    glb: "/garments/soft-tee.glb?v=3d2",
    preset: "soft-tee",
    shortSleeves: true,
    tag: "ESSENTIAL · 2D + 3D GLB",
    aspect: "medium",
    backdrop: "linear-gradient(160deg, #d7dfd8 0%, #9fb0a4 100%)",
  },
];

type CameraStatus = "idle" | "starting" | "running";
type RenderMode = "2d" | "3d";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const garmentCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const garmentSilhouetteRef = useRef<GarmentSilhouetteProfile | null>(null);
  const garmentNecklineRef = useRef({ x: 0.5, y: 0.08 });
  const garmentHemWidthRef = useRef(1);
  const shortSleevesRef = useRef(true);
  const renderer3dRef = useRef<GarmentRenderer3D | null>(null);
  const renderModeRef = useRef<RenderMode>("2d");
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const segmenterRef = useRef<ImageSegmenter | null>(null);
  const foregroundRef = useRef<HTMLCanvasElement | null>(null);
  const smootherRef = useRef(new PoseSmoother());
  const bodyFrameSmootherRef = useRef(new BodyFrameSmoother());
  const calibratorRef = useRef(new AdaptiveBodyCalibrator());
  const sessionRef = useRef(0);
  const sampleLoadRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const frameRef = useRef<number>(0);
  const lastDetectionRef = useRef(0);
  const poseFoundRef = useRef(false);
  const framingStatusRef = useRef<FramingStatus>("step-back");
  const lastPlacementRef = useRef<GarmentPlacement | null>(null);
  const poseMissesRef = useRef(0);
  const stablePoseFramesRef = useRef(0);
  const debugConfigRef = useRef({
    enabled: false,
    showLandmarks: true,
    showAxes: true,
    showBodyProxy: true,
    showWireframe: false,
    showSegmentation: false,
    showOccluders: true,
  });
  const fpsCounterRef = useRef({ frames: 0, lastSampleTime: 0, lastFrameTime: 0 });

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [renderMode, setRenderMode] = useState<RenderMode>("2d");
  const [poseFound, setPoseFound] = useState(false);
  const [framingStatus, setFramingStatus] = useState<FramingStatus>("step-back");
  const [error, setError] = useState("");
  const [selectedName, setSelectedName] = useState(DEMO_GARMENTS[0].name);
  const [selectedPinUrl, setSelectedPinUrl] = useState(DEMO_GARMENTS[0].pinUrl);
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(DEMO_GARMENTS[0].image);
  const [selectedAssetKind, setSelectedAssetKind] = useState<"dual" | "image" | "glb">("dual");
  const [search, setSearch] = useState("");
  const [cleanBackground, setCleanBackground] = useState(true);
  const [uploadLabel, setUploadLabel] = useState("Upload 2D photo or 3D .glb");
  const [windowMinimized, setWindowMinimized] = useState(false);
  const [windowOffset, setWindowOffset] = useState({ x: 0, y: 0 });
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [liked, setLiked] = useState(false);
  const [debugConfig, setDebugConfig] = useState(debugConfigRef.current);
  const [perfMetrics, setPerfMetrics] = useState({
    fps: 0,
    inferenceMs: 0,
    renderMs: 0,
    confidence: 0,
    yawDeg: 0,
  });
  const [liveBody, setLiveBody] = useState<LiveBodyDiagnostics | null>(null);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cameraStatus !== "running" || !poseFound) {
      setLiveSeconds(0);
      return;
    }
    const timer = window.setInterval(() => setLiveSeconds((prev) => prev + 1), 1000);
    return () => window.clearInterval(timer);
  }, [cameraStatus, poseFound]);

  const getRenderer3D = useCallback(() => {
    if (!renderer3dRef.current) {
      renderer3dRef.current = new GarmentRenderer3D();
    }
    return renderer3dRef.current;
  }, []);

  const changeRenderMode = useCallback((mode: RenderMode) => {
    renderModeRef.current = mode;
    setRenderMode(mode);
  }, []);

  const updateFraming = useCallback((next: FramingStatus) => {
    if (framingStatusRef.current !== next) {
      framingStatusRef.current = next;
      setFramingStatus(next);
    }
  }, []);

  const visibleGarments = useMemo(
    () =>
      DEMO_GARMENTS.filter((item) =>
        `${item.name} ${item.color} ${item.tag}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [search],
  );

  const stopCamera = useCallback(() => {
    sessionRef.current++;
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    segmenterRef.current?.close();
    segmenterRef.current = null;
    foregroundRef.current = null;
    renderer3dRef.current?.releaseWebGLContext();
    smootherRef.current.reset();
    bodyFrameSmootherRef.current.reset();
    calibratorRef.current.reset();
    setLiveBody(null);
    lastVideoTimeRef.current = -1;
    const context = canvasRef.current?.getContext("2d");
    if (context && canvasRef.current) context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    poseFoundRef.current = false;
    lastPlacementRef.current = null;
    poseMissesRef.current = 0;
    stablePoseFramesRef.current = 0;
    setPoseFound(false);
    updateFraming("step-back");
    setCameraStatus("idle");
  }, [updateFraming]);

  useEffect(
    () => () => {
      stopCamera();
      renderer3dRef.current?.dispose();
    },
    [stopCamera],
  );

  const selectSample = useCallback(
    async (item: WardrobePin) => {
      const loadId = ++sampleLoadRef.current;
      setError("");
      setWindowMinimized(false);
      try {
        const image = new Image();
        image.src = item.image;
        await image.decode();
        if (loadId !== sampleLoadRef.current) return;
        const garmentCanvas = document.createElement("canvas");
        garmentCanvas.width = image.naturalWidth;
        garmentCanvas.height = image.naturalHeight;
        garmentCanvas.getContext("2d")?.drawImage(image, 0, 0);
        const prepared = cropGarmentCanvas(garmentCanvas);

        const modelResponse = await fetch(item.glb);
        if (!modelResponse.ok) throw new Error(`Could not load the prepared 3D garment (${modelResponse.status}).`);
        const model = await modelResponse.arrayBuffer();
        const group = await buildGarment3DGroupFromGlb(model);
        if (loadId !== sampleLoadRef.current) return;
        getRenderer3D().setGarmentGroup(group);
        garmentCanvasRef.current = prepared.canvas;
        garmentSilhouetteRef.current = prepared.silhouette;
        garmentNecklineRef.current = { x: prepared.necklineX, y: prepared.necklineY };
        garmentHemWidthRef.current = prepared.hemWidthRatio;
        shortSleevesRef.current = item.shortSleeves;

        setSelectedName(item.name);
        setSelectedPinUrl(item.pinUrl);
        setSelectedThumbnail(item.image);
        setSelectedAssetKind("dual");
        setUploadLabel("Upload 2D photo or 3D .glb");
      } catch {
        if (loadId === sampleLoadRef.current) {
          setError("Could not load that sample garment. Refresh the page and try again.");
        }
      }
    },
    [getRenderer3D],
  );

  useEffect(() => {
    void selectSample(DEMO_GARMENTS[0]);
  }, [selectSample]);

  const processFile = useCallback(
    async (file?: File) => {
      if (!file) return;
      const loadId = ++sampleLoadRef.current;
      setWindowMinimized(false);
      const isGlbCandidate = file.name.toLowerCase().endsWith(".glb") || file.type === "model/gltf-binary";
      if (isGlbCandidate) {
        const glbError = validateGlbFile(file);
        if (glbError) {
          setError(glbError);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
        setError("");
        try {
          const buffer = await file.arrayBuffer();
          if (loadId !== sampleLoadRef.current) return;
          const group3d = await buildGarment3DGroupFromGlb(buffer);
          if (loadId !== sampleLoadRef.current) return;
          getRenderer3D().setGarmentGroup(group3d);
          garmentCanvasRef.current = null;
          garmentSilhouetteRef.current = null;
          shortSleevesRef.current = false;
          setSelectedName(file.name);
          setSelectedPinUrl(`fitcheck://local-glb/${encodeURIComponent(file.name)}`);
          setSelectedThumbnail(null);
          setSelectedAssetKind("glb");
          setUploadLabel("Uploaded 3D .glb active");
          changeRenderMode("3d");
        } catch (caught) {
          if (loadId === sampleLoadRef.current) {
            setError(caught instanceof Error ? caught.message : "Could not open that 3D .glb model.");
          }
        } finally {
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
        return;
      }

      const validationMessage = validateGarmentFile(file);
      if (validationMessage) {
        setError(validationMessage);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setError("");
      let bitmap: ImageBitmap | undefined;
      let uploadStage = "decode image";
      try {
        bitmap = await createImageBitmap(file);
        if (loadId !== sampleLoadRef.current) return;
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
        uploadStage = "rasterize image";
        context.drawImage(bitmap, 0, 0, width, height);

        if (cleanBackground) {
          uploadStage = "clean plain background";
          const imageData = context.getImageData(0, 0, width, height);
          let hasTransparency = false;
          for (let index = 3; index < imageData.data.length; index += 4) {
            if (imageData.data[index] < 255) {
              hasTransparency = true;
              break;
            }
          }
          if (!hasTransparency) {
            removePlainBackgroundPixels(imageData.data, width, height);
            context.putImageData(imageData, 0, 0);
          }
        }
        uploadStage = "crop garment and estimate silhouette";
        const prepared = cropGarmentCanvas(garmentCanvas);
        garmentCanvasRef.current = prepared.canvas;
        garmentSilhouetteRef.current = prepared.silhouette;
        garmentNecklineRef.current = { x: prepared.necklineX, y: prepared.necklineY };
        garmentHemWidthRef.current = prepared.hemWidthRatio;
        shortSleevesRef.current = true;
        console.info("[FitCheck] Uploaded raster garment prepared", {
          source: "local raster image",
          canvas: `${prepared.canvas.width}x${prepared.canvas.height}`,
          mimeType: file.type,
          renderer: "Canvas 2D garment mesh",
          bodyFit: "per-row wearer segmentation contours with 2% ease",
          collarOpening: prepared.silhouette.neckOpening
            ? {
                topV: Number(prepared.silhouette.neckOpening.topV.toFixed(3)),
                bottomV: Number(prepared.silhouette.neckOpening.bottomV.toFixed(3)),
                topHalfWidth: Number(prepared.silhouette.neckOpening.topHalfWidth.toFixed(3)),
              }
            : "not inferred; source alpha retained",
          neckline: {
            xRatio: Number(prepared.necklineX.toFixed(3)),
            yRatio: Number(prepared.necklineY.toFixed(3)),
          },
          hemWidthRatio: Number(prepared.hemWidthRatio.toFixed(3)),
        });

        changeRenderMode("2d");
        setSelectedName(file.name);
        setSelectedPinUrl(`fitcheck://local-upload/${encodeURIComponent(file.name)}`);
        setSelectedThumbnail(null);
        setSelectedAssetKind("image");
        setUploadLabel("Uploaded 2D item active");
      } catch (caught) {
        if (loadId === sampleLoadRef.current) {
          console.error("[FitCheck] Uploaded garment processing failed", {
            stage: uploadStage,
            mimeType: file.type,
            errorName: caught instanceof Error ? caught.name : "UnknownError",
            message: caught instanceof Error ? caught.message : "Could not open that image.",
          });
          setError(caught instanceof Error ? caught.message : "Could not open that image.");
        }
      } finally {
        bitmap?.close();
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [changeRenderMode, cleanBackground, getRenderer3D],
  );

  const startCamera = useCallback(async () => {
    const session = ++sessionRef.current;
    setError("");
    setWindowMinimized(false);
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
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) => track.addEventListener("ended", stopCamera, { once: true }));
      const video = videoRef.current;
      if (!video) throw new Error("The camera preview is unavailable.");
      video.srcObject = stream;
      await video.play();

      const files = await FilesetResolver.forVisionTasks(
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
      );
      if (session !== sessionRef.current) return;
      const tracker = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      if (session !== sessionRef.current) {
        tracker.close();
        return;
      }
      landmarkerRef.current = tracker;
      const segmenter = await ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: SEGMENTATION_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      if (session !== sessionRef.current) {
        segmenter.close();
        return;
      }
      segmenterRef.current = segmenter;
      if (segmenter.getLabels().join(",") !== "background,hair,body-skin,face-skin,clothes,others") {
        throw new Error("The foreground model has unsupported classes.");
      }
      setCameraStatus("running");
      lastDetectionRef.current = performance.now();

      const draw = () => {
        try {
          const currentVideo = videoRef.current;
          const canvas = canvasRef.current;
          const context = canvas?.getContext("2d");
          if (!currentVideo || !canvas || !context || !landmarkerRef.current) return;
          const now = performance.now();
          if (currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && currentVideo.videoWidth > 0) {
            if (canvas.width !== currentVideo.videoWidth || canvas.height !== currentVideo.videoHeight) {
              canvas.width = currentVideo.videoWidth;
              canvas.height = currentVideo.videoHeight;
            }
            if (now - lastDetectionRef.current >= 33 && currentVideo.currentTime !== lastVideoTimeRef.current) {
              lastDetectionRef.current = now;
              lastVideoTimeRef.current = currentVideo.currentTime;
              const inferStart = performance.now();
              const results = landmarkerRef.current.detectForVideo(currentVideo, now);
              try {
                const rawLandmarks = results.landmarks[0];
                const landmarks = rawLandmarks ? smootherRef.current.filter(rawLandmarks, now) : null;
                const bodyFrame = rawLandmarks
                  ? bodyFrameSmootherRef.current.update(rawLandmarks, canvas.width, canvas.height, now)
                  : null;
                const currentFraming = getFramingStatus(landmarks);
                updateFraming(currentFraming);

                const rawPosition = landmarks
                  ? getGarmentPlacement(landmarks, canvas.width, canvas.height)
                  : null;
                if (rawPosition) {
                  const previous = lastPlacementRef.current;
                  const position = smoothGarmentPlacement(previous, rawPosition, 0.38);
                  const width = Math.hypot(
                    position.shoulderRight.x - position.shoulderLeft.x,
                    position.shoulderRight.y - position.shoulderLeft.y,
                  );
                  const steady =
                    previous &&
                    Math.max(
                      ...(["shoulderLeft", "shoulderRight", "hipLeft", "hipRight"] as const).map((key) =>
                        Math.hypot(position[key].x - previous[key].x, position[key].y - previous[key].y),
                      ),
                    ) <
                      width * 0.15;
                  stablePoseFramesRef.current = steady ? stablePoseFramesRef.current + 1 : 0;
                  const locked =
                    poseFoundRef.current || (stablePoseFramesRef.current >= 4 && currentFraming !== "no-person");
                  lastPlacementRef.current = position;
                  poseMissesRef.current = 0;
                  if (poseFoundRef.current !== locked) {
                    poseFoundRef.current = locked;
                    setPoseFound(locked);
                  }
                  context.clearRect(0, 0, canvas.width, canvas.height);
                  const garment = garmentCanvasRef.current;
                  if (locked && lastPlacementRef.current) {
                    const segmentation = segmenterRef.current!.segmentForVideo(currentVideo, now);
                    try {
                      const mask = segmentation.categoryMask;
                      if (!mask) throw new Error("The foreground model returned no mask.");
                      const categories = mask.getAsUint8Array();
                      const adaptedPlacement = adaptPlacementToBodyMask(
                        lastPlacementRef.current,
                        categories,
                        mask.width,
                        mask.height,
                        canvas.width,
                        canvas.height,
                      );
                      adaptedPlacement.garmentSilhouette = garmentSilhouetteRef.current ?? undefined;
                      lastPlacementRef.current = adaptedPlacement;

                      const bodyProxy = bodyFrame
                        ? constructBodyProxy3D(bodyFrame, {
                            leftX: adaptedPlacement.bodyLeftX,
                            rightX: adaptedPlacement.bodyRightX,
                            touchesBottom: adaptedPlacement.hipLeft.y >= canvas.height,
                          })
                        : null;
                      const bodySlices = bodyFrame
                        ? measureBodySliceProfile(
                            bodyFrame,
                            categories,
                            mask.width,
                            mask.height,
                            canvas.width,
                            canvas.height,
                          )
                        : null;
                      const diagnostics =
                        bodyFrame && bodyProxy && bodySlices
                          ? calibratorRef.current.analyzeAndAdapt(
                              bodyFrame,
                              bodyProxy,
                              bodySlices,
                              canvas.width,
                              canvas.height,
                            )
                          : null;
                      if (diagnostics && renderModeRef.current === "3d") {
                        adaptedPlacement.chestHalfWidth = diagnostics.chestHalfWidth;
                        adaptedPlacement.waistHalfWidth = diagnostics.waistHalfWidth;
                        adaptedPlacement.hipHalfWidth = diagnostics.hipHalfWidth;
                      }
                      const inferenceMs = performance.now() - inferStart;
                      const dbg = debugConfigRef.current;

                      let renderMs = 0;
                      const use3D = renderModeRef.current === "3d";
                      if (use3D) {
                        const res = getRenderer3D().renderToCanvas(
                          context,
                          adaptedPlacement,
                          canvas.width,
                          canvas.height,
                          {
                            showWireframe: dbg.enabled && dbg.showWireframe,
                            showAxes: dbg.enabled && dbg.showAxes,
                            showBodyProxy: dbg.enabled && dbg.showBodyProxy,
                            showOccluders: dbg.enabled && dbg.showOccluders,
                            bodyProxy,
                          },
                        );
                        renderMs = res.renderMs;
                      } else if (garment) {
                        const rStart = performance.now();
                        drawGarmentOnTorso(
                          context,
                          garment,
                          adaptedPlacement,
                          garmentNecklineRef.current.x,
                          garmentNecklineRef.current.y,
                          garmentHemWidthRef.current,
                        );
                        renderMs = performance.now() - rStart;
                      }

                      const foreground = (foregroundRef.current ??= document.createElement("canvas"));
                      if (foreground.width !== mask.width || foreground.height !== mask.height) {
                        foreground.width = mask.width;
                        foreground.height = mask.height;
                      }
                      const maskContext = foreground.getContext("2d");
                      if (!maskContext) throw new Error("Could not create the foreground mask.");
                      const pixels = maskContext.createImageData(mask.width, mask.height);
                      pixels.data.set(
                        getForegroundAlpha(
                          categories,
                          mask.width,
                          mask.height,
                          landmarks!,
                          canvas.width,
                          canvas.height,
                          { restoreCrossedForearms: true },
                        ),
                      );
                      maskContext.putImageData(pixels, 0, 0);
                      context.save();
                      context.globalCompositeOperation = "destination-out";
                      context.drawImage(foreground, 0, 0, canvas.width, canvas.height);
                      context.restore();

                      // Phase 8 Debug Overlays (Segmentation mask + Pose landmarks + Telemetry)
                      if (dbg.enabled) {
                        if (dbg.showSegmentation) {
                          const segPixels = maskContext.createImageData(mask.width, mask.height);
                          for (let i = 0; i < categories.length; i++) {
                            const cat = categories[i];
                            if (cat === 2 || cat === 4) {
                              segPixels.data[i * 4] = 46;
                              segPixels.data[i * 4 + 1] = 213;
                              segPixels.data[i * 4 + 2] = 115;
                              segPixels.data[i * 4 + 3] = 72;
                            } else if (cat === 1 || cat === 3) {
                              segPixels.data[i * 4] = 255;
                              segPixels.data[i * 4 + 1] = 165;
                              segPixels.data[i * 4 + 2] = 2;
                              segPixels.data[i * 4 + 3] = 72;
                            }
                          }
                          maskContext.putImageData(segPixels, 0, 0);
                          context.save();
                          context.drawImage(foreground, 0, 0, canvas.width, canvas.height);
                          context.restore();
                        }
                        if (dbg.showLandmarks && landmarks) {
                          context.save();
                          context.strokeStyle = "rgba(0, 240, 255, 0.85)";
                          context.fillStyle = "#00f0ff";
                          context.lineWidth = 2;
                          const pairs = [
                            [11, 12],
                            [11, 23],
                            [12, 24],
                            [23, 24],
                            [11, 13],
                            [13, 15],
                            [12, 14],
                            [14, 16],
                          ];
                          for (const [a, b] of pairs) {
                            if (landmarks[a] && landmarks[b]) {
                              context.beginPath();
                              context.moveTo(landmarks[a].x * canvas.width, landmarks[a].y * canvas.height);
                              context.lineTo(landmarks[b].x * canvas.width, landmarks[b].y * canvas.height);
                              context.stroke();
                            }
                          }
                          for (const idx of [11, 12, 13, 14, 15, 16, 19, 20, 23, 24]) {
                            const lm = landmarks[idx];
                            if (lm) {
                              context.beginPath();
                              context.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, Math.PI * 2);
                              context.fill();
                            }
                          }
                          context.restore();
                        }
                      }

                      // Update FPS & telemetry every 250ms
                      const fpsState = fpsCounterRef.current;
                      fpsState.frames++;
                      if (now - fpsState.lastSampleTime >= 250) {
                        const elapsedSec = Math.max(0.05, (now - fpsState.lastSampleTime) / 1000);
                        const fps = Math.min(60, Math.round(fpsState.frames / elapsedSec));
                        fpsState.frames = 0;
                        fpsState.lastSampleTime = now;
                        setPerfMetrics({
                          fps,
                          inferenceMs: Math.round(inferenceMs * 10) / 10,
                          renderMs: Math.round(renderMs * 10) / 10,
                          confidence: Math.round((bodyFrame?.confidence ?? 0.9) * 100),
                          yawDeg: Math.round(((bodyFrame?.yaw ?? adaptedPlacement.torsoRotationY ?? 0) * 180) / Math.PI),
                        });
                        if (diagnostics) {
                          setLiveBody(diagnostics);
                        }
                      }
                    } finally {
                      segmentation.close();
                    }
                  }
                } else if (++poseMissesRef.current >= POSE_MISS_LIMIT) {
                  smootherRef.current.reset();
                  bodyFrameSmootherRef.current.reset();
                  stablePoseFramesRef.current = 0;
                  lastPlacementRef.current = null;
                  context.clearRect(0, 0, canvas.width, canvas.height);
                  if (poseFoundRef.current) {
                    poseFoundRef.current = false;
                    setPoseFound(false);
                  }
                }
              } finally {
                results.close();
              }
            }
          }
          if (now - lastDetectionRef.current > 300) {
            context.clearRect(0, 0, canvas.width, canvas.height);
            lastPlacementRef.current = null;
            smootherRef.current.reset();
            stablePoseFramesRef.current = 0;
            if (poseFoundRef.current) {
              poseFoundRef.current = false;
              setPoseFound(false);
            }
            if (now - lastDetectionRef.current > 2000) {
              throw new Error("The camera stopped delivering frames. Start it again to retry.");
            }
          }
          frameRef.current = requestAnimationFrame(draw);
        } catch (caught) {
          stopCamera();
          setError(caught instanceof Error ? caught.message : "Live tracking failed. Restart the camera to try again.");
        }
      };
      frameRef.current = requestAnimationFrame(draw);
    } catch (caught) {
      if (session !== sessionRef.current) return;
      stopCamera();
      if (caught instanceof DOMException && caught.name === "NotAllowedError") {
        setError("Camera access was blocked. Allow camera access in your browser settings, then try again.");
      } else if (caught instanceof DOMException && caught.name === "NotFoundError") {
        setError("No camera was found. Connect a camera or try a device with a built-in camera.");
      } else {
        setError(caught instanceof Error ? caught.message : "Could not start the live preview.");
      }
    }
  }, [getRenderer3D, stopCamera, updateFraming]);

  const handleTitleBarPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest("button")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStartRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        startX: windowOffset.x,
        startY: windowOffset.y,
      };
    },
    [windowOffset.x, windowOffset.y],
  );

  const handleTitleBarPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStartRef.current;
    if (!drag) return;
    setWindowOffset({
      x: Math.max(-220, Math.min(360, drag.startX + (event.clientX - drag.pointerX))),
      y: Math.max(-120, Math.min(240, drag.startY + (event.clientY - drag.pointerY))),
    });
  }, []);

  const handleTitleBarPointerUp = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  const showSilhouetteGuide = cameraStatus !== "running" || !poseFound;
  const stagePrompt =
    cameraStatus === "running"
      ? FRAMING_PROMPTS[framingStatus === "no-person" ? "step-back" : framingStatus]
      : "Step back";
  const formattedTimer = `${Math.floor(liveSeconds / 60)}:${String(liveSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="pinterest-shell">
      {/* Left vertical navigation rail matching reference video */}
      <aside className="left-rail" aria-label="Workspace navigation">
        <a className="rail-icon brand-rail" href="#top" aria-label="FitCheck home">
          f
        </a>
        <button
          type="button"
          className="rail-icon active"
          onClick={() => setWindowMinimized(false)}
          aria-label="Show Lookbook Feed"
          title="Lookbook Feed"
        >
          ⌂
        </button>
        <button
          type="button"
          className="rail-icon"
          onClick={() => changeRenderMode(renderMode === "2d" ? "3d" : "2d")}
          disabled={selectedAssetKind === "image"}
                    aria-label="Switch between the 2D fit check and optional 3D GLB preview"
          title="Switch 2D / 3D Engine"
        >
          ⊞
        </button>
        <button
          type="button"
          className="rail-icon"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Upload garment image or 3D GLB"
          title="Upload 2D image or 3D .glb"
        >
          ＋
        </button>
        <div className="rail-bell" aria-hidden="true">
          🔔
          <span className="rail-dot" />
        </div>
      </aside>

      {/* Main lookbook board + floating Try-On window */}
      <main className="board-main" id="top">
        <header className="board-topbar">
          <div className="board-nav-left">
            <button
              type="button"
              className="back-circle"
              onClick={() => setWindowOffset({ x: 0, y: 0 })}
              aria-label="Reset floating window position"
              title="Reset window position"
            >
              ←
            </button>
            <label className="board-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search pieces or click + Try-On on any card…"
                aria-label="Search sample garments"
              />
            </label>
          </div>

          <div className="board-nav-right">
            <label className="upload-pill">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,.glb,model/gltf-binary"
                onChange={(event) => void processFile(event.currentTarget.files?.[0])}
              />
              <span>＋ {uploadLabel}</span>
            </label>
            <label className="cleanup-chip">
              <input
                type="checkbox"
                checked={cleanBackground}
                onChange={(event) => setCleanBackground(event.target.checked)}
              />
              <span>Clean 2D BG</span>
            </label>
            <span className="privacy-pill">
              <span className="privacy-dot" /> Local Browser AR · No WebRTC
            </span>
          </div>
        </header>

        <section className="board-workspace" aria-label="Virtual try-on feed and floating mirror">
          {/* Background Pinterest-style Masonry Grid with "+ Try-On" overlay badges */}
          <div className="pin-masonry" aria-label="Sample garments">
            {visibleGarments.map((item) => {
              const isSelected = selectedName === item.name;
              return (
                <article
                  key={item.id}
                  className={`pin-card pin-${item.aspect} ${isSelected ? "is-selected" : ""}`}
                >
                  <div className="pin-visual" style={{ background: item.backdrop }}>
                    <button
                      type="button"
                      className={`tryon-pin-badge ${isSelected ? "active" : ""}`}
                      onClick={() => void selectSample(item)}
                      aria-pressed={isSelected}
                    >
                      {isSelected ? "✓ Try-On" : "+ Try-On"}
                    </button>
                    <span className="pin-mode-tag">{item.tag}</span>
                    <img src={item.image} alt={item.name} className="pin-garment-img" />
                  </div>
                  <div className="pin-meta">
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.color}</small>
                    </div>
                    <span className="pin-dots" aria-hidden="true">
                      •••
                    </span>
                  </div>
                </article>
              );
            })}
            {visibleGarments.length === 0 && (
              <p className="no-results">
                No pieces match “{search}”. Clear the search or upload your own PNG, JPG, WebP, or 3D .glb file.
              </p>
            )}
          </div>

          {/* Floating Draggable Try-On Window matching @Bober_smart video */}
          {windowMinimized ? (
            <button
              type="button"
              className="floating-capsule"
              onClick={() => setWindowMinimized(false)}
              aria-label="Restore Try-On window"
            >
              <span className="capsule-dot" />
              <span>Try-On · FitCheck ({selectedName})</span>
            </button>
          ) : (
            <section
              className="floating-tryon-window"
              aria-label="Live virtual try-on mirror"
              style={{ transform: `translate(${windowOffset.x}px, ${windowOffset.y}px)` }}
            >
              <div
                className="floating-titlebar"
                onPointerDown={handleTitleBarPointerDown}
                onPointerMove={handleTitleBarPointerMove}
                onPointerUp={handleTitleBarPointerUp}
              >
                <div className="titlebar-left">
                  <span className="window-arc" aria-hidden="true" />
                </div>
                <div className="titlebar-center">
                  <span className="titlebar-brand">Try-On</span>
                  <span className="titlebar-plus">+</span>
                  <span className="titlebar-sub">FitCheck</span>
                </div>
                <div className="titlebar-right">
                  <div className="mode-switch" role="group" aria-label="Rendering engine">
                    <button
                      type="button"
                      className={`mode-button ${renderMode === "2d" ? "active" : ""}`}
                      onClick={() => changeRenderMode("2d")}
                      disabled={selectedAssetKind === "glb"}
                      aria-pressed={renderMode === "2d"}
                    >
                      2D
                    </button>
                    <button
                      type="button"
                      className={`mode-button ${renderMode === "3d" ? "active" : ""}`}
                      onClick={() => changeRenderMode("3d")}
                      disabled={selectedAssetKind === "image"}
                      aria-pressed={renderMode === "3d"}
                    >
                      3D GLB
                    </button>
                  </div>
                  <button
                    type="button"
                    className={`mode-button debug-toggle-btn ${debugConfig.enabled ? "active" : ""}`}
                    onClick={() => {
                      const next = { ...debugConfigRef.current, enabled: !debugConfigRef.current.enabled };
                      debugConfigRef.current = next;
                      setDebugConfig(next);
                    }}
                    aria-pressed={debugConfig.enabled}
                    title="Toggle 3D Debug & Telemetry Overlay"
                  >
                    Debug
                  </button>
                  <button
                    type="button"
                    className="window-minimize"
                    onClick={() => setWindowMinimized(true)}
                    aria-label="Minimize Try-On window"
                    title="Minimize to capsule"
                  >
                    −
                  </button>
                </div>
              </div>

              {debugConfig.enabled && (
                <div className="debug-drawer" role="region" aria-label="3D Debug and Performance Overlay">
                  <div className="debug-metrics">
                    <span>FPS: <strong>{perfMetrics.fps}</strong></span>
                    <span>Pose: <strong>{perfMetrics.inferenceMs}ms</strong></span>
                    <span>Render: <strong>{perfMetrics.renderMs}ms</strong></span>
                    <span>Conf: <strong>{perfMetrics.confidence}%</strong></span>
                    <span>Yaw: <strong>{perfMetrics.yawDeg}°</strong></span>
                    {liveBody && (
                      <>
                        <span>Pitch/Roll: <strong>{liveBody.pitchDeg}°/{liveBody.rollDeg}°</strong></span>
                        <span>Arms L/R: <strong>{liveBody.leftArmElevationDeg}°/{liveBody.rightArmElevationDeg}°</strong></span>
                      </>
                    )}
                  </div>
                  <div className="debug-toggles">
                    {(
                      [
                        ["showLandmarks", "Landmarks"],
                        ["showAxes", "3D Axes"],
                        ["showBodyProxy", "Body Proxy"],
                        ["showWireframe", "Wireframe"],
                        ["showSegmentation", "Seg Mask"],
                        ["showOccluders", "Arm Occluders"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="debug-chip">
                        <input
                          type="checkbox"
                          checked={debugConfig[key]}
                          onChange={(e) => {
                            const next = { ...debugConfigRef.current, [key]: e.target.checked };
                            debugConfigRef.current = next;
                            setDebugConfig(next);
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                    <button
                      type="button"
                      className="debug-recal-btn"
                      onClick={() => {
                        calibratorRef.current.reset();
                        setLiveBody(null);
                      }}
                      title="Reset online body model calibration"
                    >
                      Recalibrate Body
                    </button>
                  </div>

                  {/* 5-Stage Browser AR Pipeline & Live Body Adaptation Metrics (matching reference diagram) */}
                  <div className="pipeline-telemetry-grid">
                    <div className="pipeline-stage-card">
                      <span className="pipeline-stage-title">1. Webcam</span>
                      <span className="pipeline-stage-sub">Browser MediaDevices API</span>
                      <span className="pipeline-stage-stat">
                        {cameraStatus === "running"
                          ? `${canvasRef.current?.width ?? 1280}×${canvasRef.current?.height ?? 720} · ${perfMetrics.fps} FPS`
                          : "Standby"}
                      </span>
                    </div>
                    <div className="pipeline-stage-card">
                      <span className="pipeline-stage-title">2. MediaPipe</span>
                      <span className="pipeline-stage-sub">Pose landmarks + segmentation</span>
                      <span className="pipeline-stage-stat">
                        {liveBody
                          ? `Conf ${perfMetrics.confidence}% · Pos (${liveBody.centerNormX}%, ${liveBody.centerNormY}%) · ${liveBody.framingLevel}`
                          : `${perfMetrics.inferenceMs}ms`}
                      </span>
                    </div>
                    <div className="pipeline-stage-card">
                      <span className="pipeline-stage-title">
                        {renderMode === "2d" ? "3. Canvas 2D TPS" : "3. Three.js"}
                      </span>
                      <span className="pipeline-stage-sub">
                        {renderMode === "2d" ? "2D garment image fitted to body contours" : "3D body proxy + rigged garment mesh"}
                      </span>
                      <span className="pipeline-stage-stat">
                        {renderMode === "2d"
                          ? `${perfMetrics.renderMs}ms fit render`
                          : liveBody
                          ? `Chest ${Math.round(liveBody.chestHalfWidth * 2)}px · Waist ${Math.round(liveBody.waistHalfWidth * 2)}px · Hip ${Math.round(liveBody.hipHalfWidth * 2)}px`
                          : `${perfMetrics.renderMs}ms`}
                      </span>
                    </div>
                    <div className="pipeline-stage-card">
                      <span className="pipeline-stage-title">
                        {renderMode === "2d" ? "4. 2D body contour" : "4. Depth-aware compositing"}
                      </span>
                      <span className="pipeline-stage-sub">
                        {renderMode === "2d" ? "Uploaded neckline + wearer silhouette" : "Correct arm/garment layering &amp; silhouette"}
                      </span>
                      <span className="pipeline-stage-stat">
                        {liveBody
                          ? liveBody.occlusionActive
                            ? `Occluding: ${liveBody.occludingLimbs.join(", ")}`
                            : "Torso foreground clear · Sleeves anchored"
                          : "Ready"}
                      </span>
                    </div>
                    <div className="pipeline-stage-card">
                      <span className="pipeline-stage-title">
                        {renderMode === "2d" ? "5. Live 2D fit check" : "5. Live 3D virtual fitting room"}
                      </span>
                      <span className="pipeline-stage-sub">
                        {renderMode === "2d" ? "Pose + segmentation contour fit" : "Dynamic online body adaptation"}
                      </span>
                      <span className="pipeline-stage-stat">
                        {renderMode === "2d"
                          ? liveBody ? `${liveBody.framingLevel} · body contour fitted` : "Awaiting body contour"
                          : liveBody
                          ? `${liveBody.calibratedModel.isLocked ? "Locked" : "Adapting"} ${liveBody.calibratedModel.adaptationProgress}% (${liveBody.calibratedModel.sampleCount} frames) · Ratios C:${liveBody.calibratedModel.chestToShoulderRatio.toFixed(2)} W:${liveBody.calibratedModel.waistToShoulderRatio.toFixed(2)}`
                          : "Awaiting frontal frames"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className={`floating-stage ${cameraStatus === "running" ? "camera-on" : ""}`}>
                <video
                  ref={videoRef}
                  className="camera-video"
                  autoPlay
                  playsInline
                  muted
                  aria-label="Live camera preview"
                />
                <canvas ref={canvasRef} className="garment-overlay" aria-hidden="true" />

                {cameraStatus === "running" && poseFound && (
                  <div className="live-stage-hud">
                    <div className="hud-top-row">
                      <div className="hud-timer-pill">
                        <span className="hud-timer-clock">{formattedTimer}</span>
                        <span className="hud-timer-mode">
                          {renderMode === "3d" ? "3D WebGL Wrap" : "2D TPS Wrap"}
                        </span>
                      </div>
                      {liveBody && (
                        <div className="hud-body-state-pill" data-posture={liveBody.posture}>
                          <span className="hud-posture-dot" />
                          <span>{liveBody.postureLabel}</span>
                          <span className="hud-cal-badge">
                            {liveBody.calibratedModel.isLocked
                              ? "Fit Locked"
                              : `Calibrating ${liveBody.calibratedModel.adaptationProgress}%`}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="hud-left-actions">
                      <button
                        type="button"
                        className="hud-icon-btn"
                        onClick={() => changeRenderMode(renderMode === "2d" ? "3d" : "2d")}
                        disabled={selectedAssetKind === "image"}
                        aria-label="Switch between 2D and 3D body wrap"
                        title="Switch 2D / 3D wrap"
                      >
                        ✦
                      </button>
                      <button
                        type="button"
                        className={`hud-icon-btn ${liked ? "is-liked" : ""}`}
                        onClick={() => setLiked((prev) => !prev)}
                        aria-label="Favorite this look"
                        aria-pressed={liked}
                      >
                        ♡
                      </button>
                    </div>
                    <div className="hud-bottom-watermark">
                      <span className="hud-brand-mark">FitCheck</span>
                      <span className="hud-fine-text">
                        {liveBody
                          ? `${renderMode === "2d" ? "2D garment fit to wearer contours" : liveBody.wrapStrategy} · Pos (${liveBody.centerNormX}%, ${liveBody.centerNormY}%) · ${liveBody.distanceLevel}`
                          : `Visual preview · ${framingStatus !== "ready" ? FRAMING_PROMPTS[framingStatus] : "Body-wrapped"}`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Head-and-shoulders translucent silhouette + "Step back" framing guide from reference video */}
                {showSilhouetteGuide && (
                  <div className={`silhouette-guide-overlay ${cameraStatus === "running" ? "is-live-guide" : ""}`}>
                    <svg
                      className="head-shoulders-svg"
                      viewBox="0 0 360 400"
                      aria-hidden="true"
                       preserveAspectRatio="xMidYMax meet"
                    >
                      <defs>
                        <radialGradient id="headGlow" cx="50%" cy="22%" r="45%">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
                          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                        </radialGradient>
                        <linearGradient id="bodyFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8c9096" stopOpacity="0.52" />
                          <stop offset="58%" stopColor="#42454a" stopOpacity="0.32" />
                          <stop offset="100%" stopColor="#090a0c" stopOpacity="0.06" />
                        </linearGradient>
                        <linearGradient id="bodyStroke" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#d4d7dc" stopOpacity="0.88" />
                          <stop offset="78%" stopColor="#8e9299" stopOpacity="0.55" />
                          <stop offset="100%" stopColor="#42454a" stopOpacity="0.08" />
                        </linearGradient>
                      </defs>
                      <circle cx="180" cy="95" r="130" fill="url(#headGlow)" />
                      <path
                        d="M 82 396 C 84 295 92 222 114 198 C 127 183 146 175 162 169 L 162 141 C 141 131 128 109 128 84 C 128 50 151 24 180 24 C 209 24 232 50 232 84 C 232 109 219 131 198 141 L 198 169 C 214 175 233 183 246 198 C 268 222 276 295 278 396"
                        fill="url(#bodyFill)"
                        stroke="url(#bodyStroke)"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>

                    <div className="stage-bottom-bar">
                      <p role="status" aria-live="polite" className="step-back-label">
                        {stagePrompt}
                      </p>
                      {cameraStatus === "idle" && (
                        <button
                          type="button"
                          className="stage-start-btn"
                          onClick={() => void startCamera()}
                        >
                          Start live try-on
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {cameraStatus === "starting" && (
                  <div className="camera-overlay">
                    <span className="loader" />
                    <span>Starting local Pose + {renderMode.toUpperCase()} engine…</span>
                  </div>
                )}
              </div>

              {/* Floating window controls + active garment bar */}
              <div className="floating-footer">
                <div className="selected-piece">
                  <span className="selected-swatch">
                    {selectedThumbnail ? (
                      <img src={selectedThumbnail} alt="" />
                    ) : (
                      <span className="selected-upload-icon" aria-hidden="true">
                        {selectedAssetKind === "glb" ? "3D" : "2D"}
                      </span>
                    )}
                  </span>
                  <div className="selected-meta">
                    <small>
                      {cameraStatus === "running" && poseFound
                        ? `TRACKING · ${renderMode === "3d" ? "THREE.JS WEBGL" : "CANVAS 2D TPS"}`
                        : `READY · ${renderMode === "3d" ? "THREE.JS WEBGL" : "CANVAS 2D TPS"}`}
                    </small>
                    <strong>{selectedName}</strong>
                  </div>
                </div>

                <div className="floating-actions">
                  {cameraStatus !== "idle" ? (
                    <button type="button" className="camera-button camera-stop" onClick={stopCamera}>
                      <span className="stop-square" />{" "}
                      {cameraStatus === "starting" ? "Cancel" : "Stop camera"}
                    </button>
                  ) : (
                    <button type="button" className="camera-button" onClick={() => void startCamera()}>
                      <span className="camera-icon" aria-hidden="true">
                        ◉
                      </span>
                      Start camera
                    </button>
                  )}
                </div>
              </div>

              {/* Bottom URL pill matching the bottom-left URL overlay in the reference video */}
              <div className="pin-url-bar" title={selectedPinUrl}>
                <span>{selectedPinUrl}</span>
                <span className="stack-mini-badges">
                  getUserMedia · MediaPipe Pose · Segmentation · {renderMode === "3d" ? "Three.js GLB" : "Canvas 2D"}
                </span>
              </div>

              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              <p className="preview-disclaimer">
                Illustrative style preview processed 100% locally in your browser. Does not guarantee physical size or fit.
              </p>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}
