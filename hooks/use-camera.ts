"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

export type CameraState = "idle" | "requesting" | "live" | "error";

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<CameraState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [canSwitch, setCanSwitch] = useState(false);

  const stop = useCallback(() => {
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
    setState("idle");
  }, [videoRef]);

  const start = useCallback(
    async (mode = facingMode) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser does not support camera access. Upload an image instead.");
        setState("error");
        return false;
      }
      stop();
      setState("requesting");
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        const video = videoRef.current;
        if (!video) throw new Error("The camera view is unavailable");
        video.srcObject = stream;
        await video.play();
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCanSwitch(devices.filter((device) => device.kind === "videoinput").length > 1);
        setFacingMode(mode);
        setState("live");
        return true;
      } catch (cameraError) {
        const name = cameraError instanceof DOMException ? cameraError.name : "";
        const message =
          name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in browser settings or upload an image."
            : name === "NotFoundError"
              ? "No camera was found. Connect a camera or upload an image."
              : name === "NotReadableError"
                ? "The camera is busy in another application. Close it there and try again."
                : "SceneLens could not connect to the camera. Upload an image or try again.";
        setError(message);
        setState("error");
        return false;
      }
    },
    [facingMode, stop, videoRef],
  );

  const switchCamera = useCallback(async () => {
    const next = facingMode === "environment" ? "user" : "environment";
    return start(next);
  }, [facingMode, start]);

  useEffect(() => stop, [stop]);

  return { state, error, facingMode, canSwitch, start, stop, switchCamera };
}

