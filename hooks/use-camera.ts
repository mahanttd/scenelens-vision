"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

export type CameraState = "idle" | "requesting" | "live" | "error";
export type CameraOption = {
  deviceId: string;
  label: string;
};

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<CameraState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [devices, setDevices] = useState<CameraOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const available = (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }));
    setDevices(available);
    setSelectedDeviceId((current) =>
      current && available.some((device) => device.deviceId === current)
        ? current
        : "",
    );
    return available;
  }, []);

  const stop = useCallback(() => {
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
    setState("idle");
  }, [videoRef]);

  const start = useCallback(
    async (
      mode = facingMode,
      requestedDeviceId = selectedDeviceId,
    ) => {
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
            ...(requestedDeviceId
              ? { deviceId: { exact: requestedDeviceId } }
              : { facingMode: { ideal: mode } }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        const video = videoRef.current;
        if (!video) throw new Error("The camera view is unavailable");
        video.srcObject = stream;
        await video.play();
        const activeTrack = stream.getVideoTracks()[0];
        const activeDeviceId =
          activeTrack?.getSettings().deviceId || requestedDeviceId;
        const available = await refreshDevices();
        if (activeDeviceId) setSelectedDeviceId(activeDeviceId);
        else if (available.length === 1) setSelectedDeviceId(available[0].deviceId);
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
                : name === "OverconstrainedError"
                  ? "That camera is no longer available. Reconnect it or choose another camera."
                : "SceneLens could not connect to the camera. Upload an image or try again.";
        setError(message);
        setState("error");
        return false;
      }
    },
    [facingMode, refreshDevices, selectedDeviceId, stop, videoRef],
  );

  const selectCamera = useCallback(
    async (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      const selected = devices.find((device) => device.deviceId === deviceId);
      const inferredMode = /front|user|facetime/i.test(selected?.label ?? "")
        ? "user"
        : "environment";
      return start(inferredMode, deviceId);
    },
    [devices, start],
  );

  const switchCamera = useCallback(async () => {
    if (devices.length > 1) {
      const currentIndex = devices.findIndex(
        (device) => device.deviceId === selectedDeviceId,
      );
      const next = devices[(currentIndex + 1 + devices.length) % devices.length];
      return selectCamera(next.deviceId);
    }
    const next = facingMode === "environment" ? "user" : "environment";
    return start(next, "");
  }, [devices, facingMode, selectCamera, selectedDeviceId, start]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const handleDeviceChange = () => void refreshDevices();
    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => mediaDevices.removeEventListener("devicechange", handleDeviceChange);
  }, [refreshDevices]);

  useEffect(() => stop, [stop]);

  const activeDeviceLabel =
    devices.find((device) => device.deviceId === selectedDeviceId)?.label ?? "";

  return {
    state,
    error,
    facingMode,
    devices,
    selectedDeviceId,
    activeDeviceLabel,
    canSwitch: devices.length > 1,
    start,
    stop,
    selectCamera,
    switchCamera,
    refreshDevices,
  };
}
