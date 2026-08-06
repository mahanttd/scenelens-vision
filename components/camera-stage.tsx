"use client";

/* eslint-disable @next/next/no-img-element -- blob and camera-frame URLs cannot use the image optimizer */

import {
  Aperture,
  Camera,
  CameraOff,
  ImageUp,
  RefreshCw,
  ScanLine,
  Sparkles,
} from "lucide-react";
import type { ChangeEvent, RefObject } from "react";
import type { CameraState } from "../hooks/use-camera";
import { friendlyLabel } from "../lib/reasoning";
import type { Detection, ModelState, SourceKind } from "../lib/types";
import { StatusPill } from "./status-pill";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  imageRef: RefObject<HTMLImageElement | null>;
  imageUrl: string | null;
  sourceKind: SourceKind;
  detections: Detection[];
  modelState: ModelState;
  cameraState: CameraState;
  cameraError: string | null;
  processing: boolean;
  processingTime: number | null;
  confidence: number;
  canSwitch: boolean;
  facingMode: "user" | "environment";
  onStart: () => void;
  onStop: () => void;
  onSwitch: () => void;
  onCapture: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadDemo: () => void;
  onImageReady: () => void;
  onConfidenceChange: (value: number) => void;
};

function modelLabel(state: ModelState) {
  if (state === "loading") return "Loading YOLO";
  if (state === "ready") return "YOLO ready";
  if (state === "error") return "Model unavailable";
  if (state === "fallback") return "Demo detections";
  return "Model standby";
}

export function CameraStage({
  videoRef,
  imageRef,
  imageUrl,
  sourceKind,
  detections,
  modelState,
  cameraState,
  cameraError,
  processing,
  processingTime,
  confidence,
  canSwitch,
  facingMode,
  onStart,
  onStop,
  onSwitch,
  onCapture,
  onUpload,
  onLoadDemo,
  onImageReady,
  onConfidenceChange,
}: Props) {
  const sourceReady = sourceKind !== "idle";
  const live = sourceKind === "camera" && cameraState === "live";

  return (
    <section className="camera-shell" aria-labelledby="camera-heading">
      <div className="panel-heading camera-heading-row">
        <div>
          <p className="eyebrow">LIVE OPTICAL FEED</p>
          <h1 id="camera-heading">Scene viewport</h1>
        </div>
        <div className="status-cluster" aria-label="System status">
          <StatusPill tone={live ? "cyan" : cameraState === "error" ? "danger" : "neutral"}>
            <span className="status-dot" /> {live ? "Camera live" : cameraState}
          </StatusPill>
          <StatusPill tone={modelState === "ready" ? "cyan" : modelState === "error" ? "danger" : "amber"}>
            {modelLabel(modelState)}
          </StatusPill>
        </div>
      </div>

      <div
        className={`viewport ${sourceReady ? "viewport--active" : ""}`}
        data-testid="scene-viewport"
      >
        <video
          ref={videoRef}
          className={sourceKind === "camera" ? "scene-media" : "scene-media is-hidden"}
          muted
          playsInline
          aria-label="Live camera feed"
        />
        {imageUrl ? (
          <img
            ref={imageRef}
            className={sourceKind === "upload" || sourceKind === "demo" ? "scene-media" : "scene-media is-hidden"}
            src={imageUrl}
            alt={sourceKind === "demo" ? "Simulated workspace scene" : "Uploaded scene for analysis"}
            onLoad={onImageReady}
          />
        ) : null}

        {!sourceReady ? (
          <div className="viewport-empty">
            <div className="reticle-icon" aria-hidden="true">
              <ScanLine size={34} strokeWidth={1.4} />
            </div>
            <p className="viewport-kicker">AWAITING VISUAL INPUT</p>
            <h2>Point SceneLens at the world</h2>
            <p>
              Camera frames stay on this device. Start a camera, upload an image,
              or explore the simulated scene.
            </p>
            <div className="empty-actions">
              <button className="button button--primary" onClick={onStart} type="button">
                <Camera size={17} /> Start camera
              </button>
              <label className="button button--secondary" htmlFor="scene-upload-empty">
                <ImageUp size={17} /> Upload image
              </label>
              <input
                id="scene-upload-empty"
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onUpload}
              />
            </div>
          </div>
        ) : null}

        <div className="hud-grid" aria-hidden="true" />
        <span className="hud-corner hud-corner--tl" aria-hidden="true" />
        <span className="hud-corner hud-corner--tr" aria-hidden="true" />
        <span className="hud-corner hud-corner--bl" aria-hidden="true" />
        <span className="hud-corner hud-corner--br" aria-hidden="true" />

        {sourceReady ? (
          <div className="detection-layer" aria-label={`${detections.length} detected objects`}>
            {detections.map((detection, index) => (
              <div
                className={`detection-box detection-box--${index % 3}`}
                key={detection.id}
                style={{
                  left: `${detection.box.x * 100}%`,
                  top: `${detection.box.y * 100}%`,
                  width: `${detection.box.width * 100}%`,
                  height: `${detection.box.height * 100}%`,
                }}
              >
                <span>
                  {friendlyLabel(detection.label)} {Math.round(detection.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {processing ? (
          <div className="scan-indicator" aria-live="polite">
            <span /> Analyzing frame
          </div>
        ) : null}

        {sourceReady ? (
          <div className="viewport-telemetry" aria-label="Frame telemetry">
            <span>OBJECTS {String(detections.length).padStart(2, "0")}</span>
            <span>{processingTime === null ? "-- MS" : `${processingTime} MS`}</span>
            <span>{sourceKind === "camera" ? facingMode.toUpperCase() : sourceKind.toUpperCase()}</span>
          </div>
        ) : null}
      </div>

      {cameraError ? (
        <div className="inline-error" role="alert">
          <CameraOff size={17} />
          <span>{cameraError}</span>
        </div>
      ) : null}

      <div className="camera-controls" aria-label="Camera controls">
        {live ? (
          <button className="icon-button" onClick={onStop} type="button" aria-label="Stop camera">
            <CameraOff size={18} />
          </button>
        ) : (
          <button className="icon-button" onClick={onStart} type="button" aria-label="Start camera">
            <Camera size={18} />
          </button>
        )}
        <button
          className="icon-button"
          onClick={onSwitch}
          type="button"
          aria-label="Switch between front and rear camera"
          disabled={!live || !canSwitch}
        >
          <RefreshCw size={18} />
        </button>
        <button
          className="capture-button"
          onClick={onCapture}
          type="button"
          aria-label="Capture current frame to local history"
          disabled={!sourceReady}
        >
          <Aperture size={20} />
          <span>Capture</span>
        </button>
        <label className="icon-button" htmlFor="scene-upload" aria-label="Upload an image">
          <ImageUp size={18} />
        </label>
        <input
          id="scene-upload"
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onUpload}
        />
        <button className="demo-button" onClick={onLoadDemo} type="button">
          <Sparkles size={16} /> Demo scene
        </button>
      </div>

      <div className="confidence-control">
        <div>
          <span className="control-label">SMART DETECTION SENSITIVITY</span>
          <span className="control-value">{Math.round(confidence * 100)}%</span>
        </div>
        <small>Small-object boost is on · people require stronger evidence</small>
        <input
          aria-label="Smart detection sensitivity"
          type="range"
          min="0.15"
          max="0.65"
          step="0.05"
          value={confidence}
          onChange={(event) => onConfidenceChange(Number(event.target.value))}
        />
      </div>
    </section>
  );
}
