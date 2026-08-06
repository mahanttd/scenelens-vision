export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Detection = {
  id: string;
  label: string;
  confidence: number;
  box: BoundingBox;
};

export type ActivityAlert = {
  id: string;
  type: "entry" | "prolonged-presence" | "hazard-proximity";
  severity: "info" | "review";
  message: string;
  createdAt: number;
};

export type HoldingEstimate = {
  person: Detection;
  object: Detection;
  confidence: number;
  rationale: string;
} | null;

export type HistoryRecord = {
  id: string;
  createdAt: string;
  imageDataUrl: string;
  objects: Detection[];
  description: string;
  holding: string;
};

export type SourceKind = "idle" | "camera" | "upload" | "demo";
export type ModelState = "idle" | "loading" | "ready" | "fallback" | "error";
