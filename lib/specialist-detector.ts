import type { Detection } from "./types";
import { nonMaximumSuppression } from "./yolo";

const MODEL_SIZE = 640;
const MODEL_PART_PATHS = [
  "/models/scenelens-v3-voc.onnx.part-01",
  "/models/scenelens-v3-voc.onnx.part-02",
  "/models/scenelens-v3-voc.onnx.part-03",
  "/models/scenelens-v3-voc.onnx.part-04",
  "/models/scenelens-v3-voc.onnx.part-05",
];

const VOC_LABELS = [
  "airplane",
  "bicycle",
  "bird",
  "boat",
  "bottle",
  "bus",
  "car",
  "cat",
  "chair",
  "cow",
  "dining table",
  "dog",
  "horse",
  "motorcycle",
  "person",
  "potted plant",
  "sheep",
  "couch",
  "train",
  "tv",
];

type PreparedFrame = {
  tensorData: Float32Array;
  width: number;
  height: number;
  scale: number;
  padX: number;
  padY: number;
};

export function combineModelParts(parts: Uint8Array[]) {
  const totalLength = parts.reduce((total, part) => total + part.byteLength, 0);
  const model = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    model.set(part, offset);
    offset += part.byteLength;
  }
  return model;
}

async function fetchModel() {
  const responses = await Promise.all(MODEL_PART_PATHS.map((path) => fetch(path)));
  const failed = responses.find((response) => !response.ok);
  if (failed) throw new Error(`SceneLens model download failed (${failed.status})`);
  const parts = await Promise.all(
    responses.map(async (response) => new Uint8Array(await response.arrayBuffer())),
  );
  return combineModelParts(parts);
}

function dimensions(source: CanvasImageSource) {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (source instanceof HTMLCanvasElement || source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  return { width: 0, height: 0 };
}

function prepareInput(source: CanvasImageSource): PreparedFrame {
  const { width, height } = dimensions(source);
  if (!width || !height) throw new Error("The current frame is not ready");
  const canvas = document.createElement("canvas");
  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The frame could not be prepared");

  const scale = Math.min(MODEL_SIZE / width, MODEL_SIZE / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const padX = (MODEL_SIZE - drawWidth) / 2;
  const padY = (MODEL_SIZE - drawHeight) / 2;
  context.fillStyle = "rgb(114, 114, 114)";
  context.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, padX, padY, drawWidth, drawHeight);

  const pixels = context.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
  const channelSize = MODEL_SIZE * MODEL_SIZE;
  const tensorData = new Float32Array(channelSize * 3);
  for (let pixel = 0; pixel < channelSize; pixel += 1) {
    tensorData[pixel] = pixels[pixel * 4] / 255;
    tensorData[channelSize + pixel] = pixels[pixel * 4 + 1] / 255;
    tensorData[channelSize * 2 + pixel] = pixels[pixel * 4 + 2] / 255;
  }
  return { tensorData, width, height, scale, padX, padY };
}

function normalizedBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  frame: Omit<PreparedFrame, "tensorData">,
) {
  const left = Math.max(0, Math.min(frame.width, (x1 - frame.padX) / frame.scale));
  const top = Math.max(0, Math.min(frame.height, (y1 - frame.padY) / frame.scale));
  const right = Math.max(0, Math.min(frame.width, (x2 - frame.padX) / frame.scale));
  const bottom = Math.max(0, Math.min(frame.height, (y2 - frame.padY) / frame.scale));
  return {
    x: left / frame.width,
    y: top / frame.height,
    width: (right - left) / frame.width,
    height: (bottom - top) / frame.height,
  };
}

export function parseSpecialistOutput(
  data: Float32Array,
  dims: readonly number[],
  confidence: number,
  frame: Omit<PreparedFrame, "tensorData">,
) {
  const rows = dims.at(-2) ?? 0;
  const columns = dims.at(-1) ?? 0;
  const detections: Detection[] = [];

  // YOLO26 end-to-end exports rows as x1, y1, x2, y2, score, class.
  if (columns === 6) {
    for (let row = 0; row < rows; row += 1) {
      const offset = row * columns;
      const score = data[offset + 4];
      const classId = Math.round(data[offset + 5]);
      if (score < confidence || !VOC_LABELS[classId]) continue;
      const box = normalizedBox(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
        frame,
      );
      if (box.width <= 0 || box.height <= 0) continue;
      detections.push({
        id: `specialist-${VOC_LABELS[classId]}-${row}`,
        label: VOC_LABELS[classId],
        confidence: score,
        source: "specialist",
        box,
      });
    }
    return nonMaximumSuppression(detections);
  }

  // Keep compatibility with raw YOLO exports shaped [1, 4 + classes, boxes].
  const featureMajor = rows === VOC_LABELS.length + 4;
  const candidateCount = featureMajor ? columns : rows;
  const featureCount = featureMajor ? rows : columns;
  const read = (candidate: number, feature: number) =>
    featureMajor
      ? data[feature * candidateCount + candidate]
      : data[candidate * featureCount + feature];
  for (let candidate = 0; candidate < candidateCount; candidate += 1) {
    let classId = 0;
    let score = 0;
    for (let index = 0; index < VOC_LABELS.length; index += 1) {
      const candidateScore = read(candidate, index + 4);
      if (candidateScore > score) {
        score = candidateScore;
        classId = index;
      }
    }
    if (score < confidence) continue;
    const centerX = read(candidate, 0);
    const centerY = read(candidate, 1);
    const width = read(candidate, 2);
    const height = read(candidate, 3);
    const box = normalizedBox(
      centerX - width / 2,
      centerY - height / 2,
      centerX + width / 2,
      centerY + height / 2,
      frame,
    );
    if (box.width <= 0 || box.height <= 0) continue;
    detections.push({
      id: `specialist-${VOC_LABELS[classId]}-${candidate}`,
      label: VOC_LABELS[classId],
      confidence: score,
      source: "specialist",
      box,
    });
  }
  return nonMaximumSuppression(detections);
}

export class SpecialistDetector {
  private session: import("onnxruntime-web/wasm").InferenceSession | null = null;
  private loading: Promise<void> | null = null;

  async load() {
    if (this.session) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.numThreads =
        globalThis.crossOriginIsolated && typeof navigator !== "undefined"
          ? Math.min(4, navigator.hardwareConcurrency || 1)
          : 1;
      ort.env.wasm.wasmPaths =
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
      this.session = await ort.InferenceSession.create(await fetchModel(), {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    })();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  async detect(source: CanvasImageSource, minimumConfidence: number) {
    await this.load();
    if (!this.session) throw new Error("SceneLens specialist did not initialize");
    const ort = await import("onnxruntime-web/wasm");
    const frame = prepareInput(source);
    const input = new ort.Tensor("float32", frame.tensorData, [
      1,
      3,
      MODEL_SIZE,
      MODEL_SIZE,
    ]);
    const output = await this.session.run({ [this.session.inputNames[0]]: input });
    const tensor = output[this.session.outputNames[0]];
    if (!tensor || !(tensor.data instanceof Float32Array)) {
      throw new Error("SceneLens specialist returned an unsupported tensor");
    }
    return parseSpecialistOutput(
      tensor.data,
      tensor.dims.map(Number),
      minimumConfidence,
      frame,
    );
  }
}
