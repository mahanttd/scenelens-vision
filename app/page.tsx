"use client";

import { Eye, LockKeyhole, Radio, ShieldCheck } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { AnalysisPanel } from "../components/analysis-panel";
import { CameraStage } from "../components/camera-stage";
import { HistoryPanel } from "../components/history-panel";
import { useCamera } from "../hooks/use-camera";
import { useSpeech } from "../hooks/use-speech";
import { DetectionTracker } from "../lib/detection-tracker";
import { getHistoryStore } from "../lib/history-store";
import {
  answerLocalQuestion,
  describeHolding,
  describeScene,
  filterByConfidence,
} from "../lib/reasoning";
import { requestRemoteAnalysis } from "../lib/remote-analysis";
import type { Detection, HistoryRecord, ModelState, SourceKind } from "../lib/types";
import { demoDetections, YoloDetector } from "../lib/yolo";

const DEFAULT_RESULT =
  "Choose a visual source, then ask a question. SceneLens will stay grounded in visible evidence and say when it is uncertain.";

function uniqueId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDemoScene() {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const gradient = context.createLinearGradient(0, 0, 1280, 720);
  gradient.addColorStop(0, "#101d25");
  gradient.addColorStop(1, "#25353a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1280, 720);
  context.fillStyle = "#1e3139";
  context.fillRect(0, 480, 1280, 240);
  context.fillStyle = "#314952";
  context.fillRect(65, 500, 1150, 150);
  context.fillStyle = "#17252b";
  context.fillRect(120, 650, 40, 70);
  context.fillRect(1090, 650, 40, 70);

  context.fillStyle = "#63737b";
  context.beginPath();
  context.arc(370, 145, 62, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#485e67";
  context.fillRect(270, 205, 205, 320);
  context.fillStyle = "#5e7077";
  context.fillRect(235, 250, 55, 250);
  context.fillRect(455, 250, 55, 250);

  context.fillStyle = "#d9a441";
  context.fillRect(520, 380, 90, 125);
  context.strokeStyle = "#d9a441";
  context.lineWidth = 18;
  context.beginPath();
  context.arc(610, 425, 38, -Math.PI / 2, Math.PI / 2);
  context.stroke();

  context.fillStyle = "#566b73";
  context.fillRect(750, 360, 340, 165);
  context.fillStyle = "#17252b";
  context.fillRect(785, 390, 270, 100);
  context.strokeStyle = "rgba(68, 221, 225, .55)";
  context.lineWidth = 2;
  for (let x = 40; x < 1280; x += 80) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 720);
    context.stroke();
  }
  return canvas.toDataURL("image/jpeg", 0.9);
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const detectorRef = useRef<YoloDetector | null>(null);
  const detectorReadyRef = useRef(false);
  const trackerRef = useRef(new DetectionTracker());
  const inferenceBusyRef = useRef(false);
  const lastInferenceRef = useRef(0);
  const lastNarrationRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const minimumConfidenceRef = useRef(0.3);
  const historyStore = useMemo(() => getHistoryStore(), []);

  const camera = useCamera(videoRef);
  const speech = useSpeech();
  const [sourceKind, setSourceKind] = useState<SourceKind>("idle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rawDetections, setRawDetections] = useState<Detection[]>([]);
  const [minimumConfidence, setMinimumConfidence] = useState(0.3);
  const [modelState, setModelState] = useState<ModelState>("loading");
  const [modelVariant, setModelVariant] = useState("YOLOv8s accuracy model");
  const [processing, setProcessing] = useState(false);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [result, setResult] = useState(DEFAULT_RESULT);
  const [resultLabel, setResultLabel] = useState("READY FOR ANALYSIS");
  const [question, setQuestion] = useState("");
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [remoteAnalyzing, setRemoteAnalyzing] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  const detections = useMemo(
    () => filterByConfidence(rawDetections, minimumConfidence),
    [minimumConfidence, rawDetections],
  );

  const sceneDescription = useMemo(() => {
    if (sourceKind === "idle") {
      return "Start the camera or upload an image to receive an automatic description of the scene.";
    }
    if (processing && detections.length === 0) {
      return "Scanning the scene for people, objects, and spatial context…";
    }
    return describeScene(detections);
  }, [detections, processing, sourceKind]);

  useEffect(() => {
    minimumConfidenceRef.current = minimumConfidence;
  }, [minimumConfidence]);

  useEffect(() => {
    const detector = new YoloDetector();
    detectorRef.current = detector;
    let active = true;
    detector
      .load()
      .then(() => {
        if (!active) return;
        detectorReadyRef.current = true;
        setModelVariant(
          detector.modelName === "YOLOv8s"
            ? "YOLOv8s accuracy model"
            : detector.modelName,
        );
        setModelState("ready");
      })
      .catch(() => {
        if (!active) return;
        setModelState("error");
        setResultLabel("MODEL NOTICE");
        setResult(
          "The on-device YOLO model could not initialize. Camera and upload controls still work; try the simulated scene or reload.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    historyStore.list().then(setHistory).catch(() => {
      setResultLabel("STORAGE NOTICE");
      setResult("Local history could not be opened in this browser session.");
    });
  }, [historyStore]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const runDetection = useCallback(async (
    source: CanvasImageSource,
    options: { detailed?: boolean; track?: boolean } = {},
  ) => {
    const detector = detectorRef.current;
    if (!detector || inferenceBusyRef.current) return;
    inferenceBusyRef.current = true;
    setProcessing(true);
    const started = performance.now();
    try {
      const found = await detector.detect(source, 0.14, {
        detailed: options.detailed,
      });
      const presented = options.track
        ? trackerRef.current.update(found)
        : found;
      if (!options.track) trackerRef.current.reset();
      setRawDetections(presented);
      setProcessingTime(Math.round(performance.now() - started));
      detectorReadyRef.current = true;
      setModelVariant(
        detector.modelName === "YOLOv8s"
          ? "YOLOv8s accuracy model"
          : detector.modelName,
      );
      setModelState("ready");
      if (options.detailed) {
        const visible = filterByConfidence(
          presented,
          minimumConfidenceRef.current,
        );
        setResultLabel("DETAILED SCENE DESCRIPTION");
        setResult(describeScene(visible));
      }
    } catch (error) {
      setModelState("error");
      setResultLabel("DETECTION ERROR");
      setResult(
        error instanceof Error
          ? `${error.message}. Try the simulated scene while the model is unavailable.`
          : "The current frame could not be analyzed.",
      );
    } finally {
      inferenceBusyRef.current = false;
      setProcessing(false);
    }
  }, []);

  useEffect(() => {
    if (sourceKind !== "camera" || camera.state !== "live") return;
    let active = true;
    let animationFrame = 0;
    const detectFrame = (timestamp: number) => {
      if (!active) return;
      const video = videoRef.current;
      if (
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        timestamp - lastInferenceRef.current >= 700 &&
        !inferenceBusyRef.current
      ) {
        lastInferenceRef.current = timestamp;
        void runDetection(video, { track: true });
      }
      animationFrame = requestAnimationFrame(detectFrame);
    };
    animationFrame = requestAnimationFrame(detectFrame);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrame);
    };
  }, [camera.state, runDetection, sourceKind]);

  useEffect(() => {
    if (!speech.autoNarrate || !speech.enabled || sourceKind !== "camera") return;
    const now = Date.now();
    if (now - lastNarrationRef.current < 12_000) return;
    lastNarrationRef.current = now;
    speech.speak(describeScene(detections));
  }, [detections, sourceKind, speech]);

  const captureFrameDataUrl = useCallback(() => {
    const source =
      sourceKind === "camera" ? videoRef.current : imageRef.current;
    if (!source) return null;
    const width =
      source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const height =
      source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    if (!width || !height) return null;
    const scale = Math.min(1, 960 / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }, [sourceKind]);

  const handleStart = useCallback(async () => {
    const started = await camera.start();
    if (started) {
      setSourceKind("camera");
      trackerRef.current.reset();
      setRawDetections([]);
      setImageUrl(null);
      setModelState(detectorReadyRef.current ? "ready" : "loading");
      setResultLabel("LIVE DETECTION");
      setResult("Camera connected. On-device detections will update without uploading frames.");
    }
  }, [camera]);

  const handleStop = useCallback(() => {
    camera.stop();
    trackerRef.current.reset();
    setSourceKind("idle");
    setRawDetections([]);
    setProcessingTime(null);
  }, [camera]);

  const handleUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      const accepted = ["image/jpeg", "image/png", "image/webp"];
      if (!accepted.includes(file.type)) {
        setResultLabel("UPLOAD ERROR");
        setResult("Choose a JPEG, PNG, or WebP image.");
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        setResultLabel("UPLOAD ERROR");
        setResult("The selected image is larger than the 8 MB local upload limit.");
        return;
      }
      camera.stop();
      trackerRef.current.reset();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const nextUrl = URL.createObjectURL(file);
      objectUrlRef.current = nextUrl;
      setImageUrl(nextUrl);
      setSourceKind("upload");
      setRawDetections([]);
      setProcessingTime(null);
      setModelState(detectorReadyRef.current ? "ready" : "loading");
      setResultLabel("IMAGE LOADED");
      setResult("Analyzing the uploaded image locally. The file has not left this device.");
    },
    [camera],
  );

  const handleImageReady = useCallback(() => {
    if (sourceKind === "demo") {
      setRawDetections(demoDetections);
      setModelState("fallback");
      setProcessingTime(18);
      setResultLabel("SIMULATED SCENE DESCRIPTION");
      setResult(describeScene(demoDetections));
      return;
    }
    if (sourceKind === "upload" && imageRef.current) {
      void runDetection(imageRef.current, { detailed: true });
    }
  }, [runDetection, sourceKind]);

  const handleDemo = useCallback(() => {
    camera.stop();
    trackerRef.current.reset();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setImageUrl(createDemoScene());
    setSourceKind("demo");
    setRawDetections([]);
    setResultLabel("SCENE DESCRIPTION");
    setResult(describeScene(demoDetections));
  }, [camera]);

  const publishResult = useCallback(
    (label: string, message: string) => {
      setResultLabel(label);
      setResult(message);
      speech.speak(message);
    },
    [speech],
  );

  const handleAsk = useCallback(
    async (prompt: string) => {
      if (sourceKind === "idle") {
        publishResult(
          "NO VISUAL SOURCE",
          "Start the camera, upload an image, or load the demo scene before asking about it.",
        );
        return;
      }
      const localAnswer = answerLocalQuestion(prompt, detections);
      publishResult("ON-DEVICE ANALYSIS", localAnswer);
      if (!remoteEnabled) return;

      const imageDataUrl = captureFrameDataUrl();
      if (!imageDataUrl) {
        setResult(`${localAnswer} Remote verification was skipped because the frame was not ready.`);
        return;
      }
      setRemoteAnalyzing(true);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 17_000);
      try {
        const remote = await requestRemoteAnalysis(imageDataUrl, prompt, controller.signal);
        publishResult(`VERIFIED · ${remote.provider}`, remote.answer);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Remote verification failed";
        setResultLabel("ON-DEVICE ANALYSIS · REMOTE UNAVAILABLE");
        setResult(`${localAnswer} ${message}`);
      } finally {
        window.clearTimeout(timeout);
        setRemoteAnalyzing(false);
      }
    },
    [captureFrameDataUrl, detections, publishResult, remoteEnabled, sourceKind],
  );

  const handleCapture = useCallback(async () => {
    const imageDataUrl = captureFrameDataUrl();
    if (!imageDataUrl) {
      publishResult("CAPTURE ERROR", "The current frame is not ready to capture.");
      return;
    }
    const description = describeScene(detections);
    const holding = describeHolding(detections);
    const record: HistoryRecord = {
      id: uniqueId(),
      createdAt: new Date().toISOString(),
      imageDataUrl,
      objects: detections,
      description,
      holding,
    };
    try {
      await historyStore.add(record);
      setHistory(await historyStore.list());
      publishResult("CAPTURE SAVED LOCALLY", `${description} ${holding}`);
    } catch {
      publishResult("STORAGE ERROR", "The frame could not be saved in this browser.");
      return;
    }
    if (remoteEnabled) {
      setRemoteAnalyzing(true);
      try {
        const remote = await requestRemoteAnalysis(
          imageDataUrl,
          "Describe this scene briefly and cautiously.",
        );
        const updated = { ...record, description: remote.answer };
        await historyStore.add(updated);
        setHistory(await historyStore.list());
        publishResult(`CAPTURE VERIFIED · ${remote.provider}`, remote.answer);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Remote verification failed";
        setResult(`${description} Saved locally. ${message}`);
      } finally {
        setRemoteAnalyzing(false);
      }
    }
  }, [captureFrameDataUrl, detections, historyStore, publishResult, remoteEnabled]);

  const handleDeleteHistory = useCallback(
    async (id: string) => {
      await historyStore.delete(id);
      setHistory(await historyStore.list());
    },
    [historyStore],
  );

  const handleClearHistory = useCallback(async () => {
    await historyStore.clear();
    setHistory([]);
  }, [historyStore]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="SceneLens home">
          <span className="brand-mark" aria-hidden="true"><Eye size={22} /></span>
          <span>
            <strong>SCENE<span>LENS</span></strong>
            <small>REAL-TIME VISUAL ASSISTANCE</small>
          </span>
        </a>
        <div className="topbar-center" aria-label="Privacy status">
          <LockKeyhole size={14} />
          <span>PRIVATE BY DEFAULT</span>
          <i />
          <span>NO FACIAL RECOGNITION</span>
        </div>
        <div className="system-state">
          <span className={modelState === "ready" ? "is-online" : ""} />
          <div>
            <strong>{modelState === "ready" ? "ON-DEVICE MODEL READY" : "INITIALIZING VISION CORE"}</strong>
            <small>{modelVariant} · COCO 80 classes</small>
          </div>
        </div>
      </header>

      <div className="app-intro" id="top">
        <div>
          <p className="eyebrow"><Radio size={13} /> VISUAL CONTEXT, WITHOUT THE GUESSWORK</p>
          <h2>See what’s there. <span>Understand what matters.</span></h2>
        </div>
        <p>
          SceneLens interprets common visible objects on-device and explains its
          uncertainty—without identifying anyone in view.
        </p>
      </div>

      <div className="workspace-grid">
        <CameraStage
          videoRef={videoRef}
          imageRef={imageRef}
          imageUrl={imageUrl}
          sourceKind={sourceKind}
          detections={detections}
          modelState={modelState}
          cameraState={camera.state}
          cameraError={camera.error}
          processing={processing}
          processingTime={processingTime}
          confidence={minimumConfidence}
          canSwitch={camera.canSwitch}
          facingMode={camera.facingMode}
          onStart={() => void handleStart()}
          onStop={handleStop}
          onSwitch={() => void camera.switchCamera()}
          onCapture={() => void handleCapture()}
          onUpload={handleUpload}
          onLoadDemo={handleDemo}
          onImageReady={handleImageReady}
          onConfidenceChange={setMinimumConfidence}
        />
        <AnalysisPanel
          result={result}
          resultLabel={resultLabel}
          sceneDescription={sceneDescription}
          analyzing={remoteAnalyzing}
          detections={detections}
          question={question}
          onQuestionChange={setQuestion}
          onAsk={(prompt) => void handleAsk(prompt)}
          remoteEnabled={remoteEnabled}
          onRemoteEnabledChange={setRemoteEnabled}
          speechSupported={speech.supported}
          speechEnabled={speech.enabled}
          onSpeechEnabledChange={speech.setEnabled}
          autoNarrate={speech.autoNarrate}
          onAutoNarrateChange={speech.setAutoNarrate}
          speaking={speech.speaking}
          canReplay={speech.canReplay}
          onReplay={speech.replay}
          onStopSpeech={speech.stop}
        />
      </div>

      <HistoryPanel records={history} onDelete={(id) => void handleDeleteHistory(id)} onClear={() => void handleClearHistory()} />

      <footer className="footer">
        <span><ShieldCheck size={15} /> Privacy-first visual assistance</span>
        <p>SceneLens provides estimates, not facts. Verify consequential observations yourself.</p>
      </footer>
    </main>
  );
}
