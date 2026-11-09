import { createDecartClient, models } from "@decartai/sdk";
import { useEffect, useRef, useState } from "react";
import { prepareGarmentImage, validateGarmentFile } from "./lib/garment";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "iconify-icon": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { icon?: string };
    }
  }
}

const model = models.realtime("lucy-2.6");
const client = createDecartClient({
  telemetry: false,
  apiKeyProvider: async () => {
    const response = await fetch("/api/realtime-token", { method: "POST", headers: { "X-FitCheck-Request": "1" } });
    if (!response.ok) {
      if (response.status === 404) throw new Error("This local server is missing the token route. Stop the old FitCheck server, restart npm run dev, and open the new URL it prints.");
      if (response.status === 403) throw new Error("The token request came from a different local address. Open FitCheck using the exact URL printed by Vite and reload.");
      if (response.status === 503) throw new Error("DECART_API_KEY is missing from the local server's .env configuration.");
      if (response.status === 502) throw new Error("Decart could not issue a token. Check that DECART_API_KEY is active and has API access.");
      if (response.status === 429) throw new Error("Too many token requests. Wait a minute, then try again.");
      throw new Error(`Could not authorize a Decart session (HTTP ${response.status}).`);
    }
    const result: { apiKey: string } = await response.json();
    return result.apiKey;
  },
});

type Status = "idle" | "connecting" | "live";

export default function App() {
  const localVideo = useRef<HTMLVideoElement>(null);
  const outputVideo = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<Awaited<ReturnType<typeof client.realtime.connect>> | null>(null);
  const generationRef = useRef(0);
  const uploadRef = useRef(0);
  const [garment, setGarment] = useState<Blob | null>(null);
  const [thumbnail, setThumbnail] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [prompt, setPrompt] = useState("Replace the current top with the garment in the reference image. Preserve the person's face, body shape, pose, and background.");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!garment) {
      setThumbnail("");
      return;
    }
    const url = URL.createObjectURL(garment);
    setThumbnail(url);
    return () => URL.revokeObjectURL(url);
  }, [garment]);

  function stop() {
    generationRef.current++;
    const session = sessionRef.current;
    sessionRef.current = null;
    try { session?.disconnect(); } catch { /* track cleanup must still run */ }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (outputVideo.current) outputVideo.current.srcObject = null;
    setStatus("idle");
  }

  useEffect(() => () => stop(), []);

  async function start() {
    if (!garment || !prompt.trim() || preparing || status !== "idle") return;
    const generation = ++generationRef.current;
    setError("");
    setStatus("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires a supported browser on HTTPS or localhost.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { frameRate: model.fps, width: model.width, height: model.height, facingMode: "user" },
      });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      stream.getTracks().forEach((track) => track.addEventListener("ended", () => {
        if (generation !== generationRef.current) return;
        setError("The camera stopped. Start a new preview to reconnect.");
        stop();
      }, { once: true }));
      if (localVideo.current) localVideo.current.srcObject = stream;
      const session = await client.realtime.connect(stream, {
        model,
        mirror: "auto",
        initialState: { prompt: { text: prompt.trim(), enhance: false }, image: garment },
        onRemoteStream: (remote) => {
          if (generation === generationRef.current && outputVideo.current) {
            outputVideo.current.srcObject = remote;
            setStatus("live");
          }
        },
      });
      if (generation !== generationRef.current) {
        session.disconnect();
        return;
      }
      sessionRef.current = session;
      session.on("error", () => {
        if (generation !== generationRef.current) return;
        setError("The Lucy session encountered a problem. Stop the session and try again.");
        stop();
      });
      session.on("connectionChange", (connection) => {
        if (generation !== generationRef.current) return;
        if (connection === "connected") setStatus("live");
        if (connection === "disconnected") {
          setError("The connection ended. Check your network and try again.");
          stop();
        }
      });
      session.on("sessionEnded", () => {
        if (generation !== generationRef.current) return;
        setError("The Lucy session ended. Start another preview to reconnect.");
        stop();
      });
    } catch (cause) {
      if (generation !== generationRef.current) return;
      stop();
      if (cause instanceof DOMException && cause.name === "NotAllowedError") {
        setError("Camera access was denied. Allow camera access in your browser settings, then try again.");
      } else if (cause instanceof DOMException && cause.name === "NotFoundError") {
        setError("No camera was found. Connect a camera or try another device.");
      } else if (cause instanceof DOMException && cause.name === "NotReadableError") {
        setError("The camera is already in use by another app. Close it there and try again.");
      } else {
        setError(cause instanceof Error ? cause.message : "Could not start the try-on session.");
      }
    }
  }

  async function updateGarment(file?: File) {
    if (!file) return;
    const uploadId = ++uploadRef.current;
    const validationError = validateGarmentFile(file);
    if (validationError) {
      setError(validationError);
      setPreparing(false);
      return;
    }
    setError("");
    setPreparing(true);
    try {
      const prepared = await prepareGarmentImage(file);
      if (uploadId !== uploadRef.current) return;
      setGarment(prepared);
      if (sessionRef.current) {
        try {
          await sessionRef.current.set({ prompt: prompt.trim(), image: prepared, enhance: false });
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not update the garment.");
        }
      }
    } catch (cause) {
      if (uploadId === uploadRef.current) setError(cause instanceof Error ? cause.message : "Could not prepare this image.");
    } finally {
      if (uploadId === uploadRef.current) setPreparing(false);
    }
  }

  async function applyPrompt() {
    if (!sessionRef.current || !prompt.trim()) return;
    try {
      await sessionRef.current.set({ prompt: prompt.trim(), image: garment ?? null, enhance: false });
      setError("");
    } catch {
      setError("Could not update the outfit description.");
    }
  }

  async function clearGarment() {
    setGarment(null);
    setError("");
    if (!sessionRef.current) return;
    try {
      await sessionRef.current.set({ prompt: prompt.trim(), image: null, enhance: false });
    } catch {
      setError("Could not remove the garment from the active session. Stop and restart to clear it.");
    }
  }

  const live = status === "live";

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="FitCheck home">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M7 11V8a1 1 0 0 1 1-1h4M20 7h4a1 1 0 0 1 1 1v3M25 21v3a1 1 0 0 1-1 1h-4M12 25H8a1 1 0 0 1-1-1v-3" />
            <path d="M16 8.5c-2.6 0-3.1 3.5-.7 4.3L16 13l.7-.2c2.4-.8 1.9-4.3-.7-4.3ZM10 15l6-2 6 2v8H10z" />
          </svg>
          fitcheck
        </a>
        <span className="model-name">Live style preview</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">YOUR PERSONAL FITTING ROOM</p>
          <h1>See it on <em>you.</em></h1>
          <p className="intro">Choose a piece, start your camera, and let Lucy bring your look to life in real time.</p>
        </div>
        <div className="workspace">
          <section className="preview-card" aria-label="Virtual try-on preview">
            <div className="preview-head"><span>{live ? "Live preview" : status === "connecting" ? "Connecting" : "Your preview"}</span></div>
            <div className="video-stage">
              <video ref={outputVideo} className={`remote-video ${live ? "visible" : ""}`} autoPlay playsInline aria-label="Lucy virtual try-on output" />
              <video ref={localVideo} className="local-video" autoPlay playsInline muted aria-hidden="true" />
              {!live && <div className="preview-placeholder"><div className="hanger">⌁</div><p>{status === "connecting" ? "Connecting to Lucy…" : "Your look will appear here"}</p><span>{garment ? "Ready when you are" : "Add a garment to get started"}</span></div>}
            </div>
            <div className="preview-footer"><span>Results are illustrative</span></div>
          </section>

          <aside className="control-card">
            <p className="eyebrow">BUILD YOUR LOOK</p>
            <h2>Make it yours</h2>
            <label className="field-label" htmlFor="garment-input">01 <span>GARMENT IMAGE</span></label>
            <label className={`upload-box ${garment ? "has-image" : ""}`} htmlFor="garment-input">
              <input id="garment-input" type="file" accept="image/png,image/jpeg,image/webp" disabled={status === "connecting"} onChange={(event) => { void updateGarment(event.target.files?.[0]); event.target.value = ""; }} />
              {thumbnail ? <img src={thumbnail} alt="Selected garment" /> : <><iconify-icon className="upload-icon" icon="hugeicons:image-add-02" aria-hidden="true" /><strong>{preparing ? "Preparing image…" : "Choose a garment photo"}</strong><small>PNG, JPG or WebP · up to 10 MB</small></>}
              {garment && <span className="change-image">Change image</span>}
            </label>
            {garment && <button className="clear-button" type="button" disabled={status === "connecting"} onClick={() => void clearGarment()}>Remove garment image</button>}
            <label className="field-label prompt-label" htmlFor="prompt">02 <span>DESCRIBE THE LOOK</span></label>
            <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={status === "connecting"} maxLength={500} rows={3} />
            <p className="prompt-hint">Mention colors, style, and details you want Lucy to preserve.</p>
            {error && <p className="error-message" role="alert">{error}</p>}
            {live && <button className="update-button" type="button" onClick={() => void applyPrompt()}>Apply outfit description</button>}
            {!live && status !== "connecting" && <div className="privacy-note" role="note"><iconify-icon icon="hugeicons:information-circle" aria-hidden="true" /><span><strong>Before you start:</strong> your live camera video and garment image are sent to Decart to create this preview. FitCheck does not save them. Decart's API terms permit it to use inputs and outputs to operate and improve/train its services. <a href="https://docs.platform.decart.ai/resources/api-terms" target="_blank" rel="noreferrer">Review Decart's terms</a>.</span></div>}
            {live ? <button className="start-button stop-button" type="button" onClick={stop}><iconify-icon icon="hugeicons:stop" aria-hidden="true" /> Stop preview</button> : status === "connecting" ? <button className="start-button stop-button" type="button" onClick={stop}>Cancel connection</button> : <button className="start-button" type="button" onClick={() => void start()} disabled={!garment || preparing || !prompt.trim()}><iconify-icon icon={preparing ? "hugeicons:loading-03" : "hugeicons:play"} aria-hidden="true" />{preparing ? "Preparing image…" : "Start virtual try-on"}</button>}
            <p className="button-caption">{live ? "Your camera is active. Stop whenever you’re ready." : "Camera starts only after you choose Start."}</p>
          </aside>
        </div>
      </section>
      <footer className="site-footer"><span>FitCheck <b>·</b> A style preview, not a fit or size guarantee.</span><span>Camera video and garment images are sent to Decart while connected.</span></footer>
    </main>
  );
}
