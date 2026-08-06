import type { Detection } from "./types";

const MODEL_SIZE = 640;
const MODEL_PATH = "/models/yolov8n.onnx";

const COCO_LABELS = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck",
  "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
  "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
  "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
  "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove",
  "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork",
  "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli",
  "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant",
  "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard",
  "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book",
  "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush",
];

type SourceDimensions = { width: number; height: number };

function sourceDimensions(source: CanvasImageSource): SourceDimensions {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }
  if (source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  return { width: MODEL_SIZE, height: MODEL_SIZE };
}

function prepareInput(source: CanvasImageSource) {
  const dimensions = sourceDimensions(source);
  const canvas = document.createElement("canvas");
  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || dimensions.width === 0 || dimensions.height === 0) {
    throw new Error("The current frame is not ready for analysis");
  }
  const scale = Math.min(MODEL_SIZE / dimensions.width, MODEL_SIZE / dimensions.height);
  const drawWidth = dimensions.width * scale;
  const drawHeight = dimensions.height * scale;
  const padX = (MODEL_SIZE - drawWidth) / 2;
  const padY = (MODEL_SIZE - drawHeight) / 2;
  context.fillStyle = "#727272";
  context.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);
  context.drawImage(source, padX, padY, drawWidth, drawHeight);
  const pixels = context.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
  const channelSize = MODEL_SIZE * MODEL_SIZE;
  const tensorData = new Float32Array(channelSize * 3);
  for (let pixel = 0; pixel < channelSize; pixel += 1) {
    tensorData[pixel] = pixels[pixel * 4] / 255;
    tensorData[channelSize + pixel] = pixels[pixel * 4 + 1] / 255;
    tensorData[channelSize * 2 + pixel] = pixels[pixel * 4 + 2] / 255;
  }
  return { tensorData, dimensions, scale, padX, padY };
}

function iou(a: Detection, b: Detection) {
  const left = Math.max(a.box.x, b.box.x);
  const top = Math.max(a.box.y, b.box.y);
  const right = Math.min(a.box.x + a.box.width, b.box.x + b.box.width);
  const bottom = Math.min(a.box.y + a.box.height, b.box.y + b.box.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.box.width * a.box.height + b.box.width * b.box.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function nonMaximumSuppression(detections: Detection[]) {
  const selected: Detection[] = [];
  for (const candidate of detections.sort((a, b) => b.confidence - a.confidence)) {
    if (
      selected.every(
        (item) => item.label !== candidate.label || iou(item, candidate) < 0.45,
      )
    ) {
      selected.push(candidate);
    }
    if (selected.length >= 30) break;
  }
  return selected;
}

function parseOutput(
  data: Float32Array,
  dims: readonly number[],
  confidence: number,
  frame: ReturnType<typeof prepareInput>,
) {
  const featureMajor = dims[1] <= 100;
  const count = featureMajor ? dims[2] : dims[1];
  const features = featureMajor ? dims[1] : dims[2];
  const detections: Detection[] = [];
  const read = (candidate: number, feature: number) =>
    featureMajor
      ? data[feature * count + candidate]
      : data[candidate * features + feature];

  for (let candidate = 0; candidate < count; candidate += 1) {
    let bestClass = 0;
    let bestScore = 0;
    for (let classIndex = 0; classIndex < COCO_LABELS.length; classIndex += 1) {
      const score = read(candidate, classIndex + 4);
      if (score > bestScore) {
        bestScore = score;
        bestClass = classIndex;
      }
    }
    if (bestScore < confidence) continue;
    const centerX = read(candidate, 0);
    const centerY = read(candidate, 1);
    const width = read(candidate, 2);
    const height = read(candidate, 3);
    const x = (centerX - width / 2 - frame.padX) / frame.scale;
    const y = (centerY - height / 2 - frame.padY) / frame.scale;
    const normalized = {
      x: Math.max(0, x / frame.dimensions.width),
      y: Math.max(0, y / frame.dimensions.height),
      width: Math.min(1, width / frame.scale / frame.dimensions.width),
      height: Math.min(1, height / frame.scale / frame.dimensions.height),
    };
    normalized.width = Math.min(normalized.width, 1 - normalized.x);
    normalized.height = Math.min(normalized.height, 1 - normalized.y);
    if (normalized.width <= 0 || normalized.height <= 0) continue;
    detections.push({
      id: `${COCO_LABELS[bestClass]}-${candidate}`,
      label: COCO_LABELS[bestClass],
      confidence: bestScore,
      box: normalized,
    });
  }
  return nonMaximumSuppression(detections);
}

export class YoloDetector {
  private session: import("onnxruntime-web").InferenceSession | null = null;
  private loading: Promise<void> | null = null;

  async load() {
    if (this.session) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const ort = await import("onnxruntime-web");
      ort.env.wasm.numThreads = 1;
      this.session = await ort.InferenceSession.create(MODEL_PATH, {
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
    if (!this.session) throw new Error("YOLO session did not initialize");
    const ort = await import("onnxruntime-web");
    const frame = prepareInput(source);
    const input = new ort.Tensor("float32", frame.tensorData, [
      1,
      3,
      MODEL_SIZE,
      MODEL_SIZE,
    ]);
    const inputName = this.session.inputNames[0];
    const output = await this.session.run({ [inputName]: input });
    const tensor = output[this.session.outputNames[0]];
    if (!tensor || !(tensor.data instanceof Float32Array)) {
      throw new Error("YOLO returned an unsupported output tensor");
    }
    return parseOutput(
      tensor.data,
      tensor.dims.map(Number),
      minimumConfidence,
      frame,
    );
  }
}

export const demoDetections: Detection[] = [
  {
    id: "demo-person",
    label: "person",
    confidence: 0.94,
    box: { x: 0.18, y: 0.08, width: 0.35, height: 0.82 },
  },
  {
    id: "demo-cup",
    label: "cup",
    confidence: 0.82,
    box: { x: 0.43, y: 0.49, width: 0.1, height: 0.16 },
  },
  {
    id: "demo-laptop",
    label: "laptop",
    confidence: 0.89,
    box: { x: 0.58, y: 0.52, width: 0.3, height: 0.22 },
  },
  {
    id: "demo-table",
    label: "dining table",
    confidence: 0.78,
    box: { x: 0.05, y: 0.68, width: 0.9, height: 0.27 },
  },
];

