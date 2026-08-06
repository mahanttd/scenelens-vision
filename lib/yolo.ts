import type { Detection } from "./types";

const MODEL_SIZE = 640;
const ACCURACY_MODEL_PATH =
  "https://huggingface.co/cabelo/yolov8/resolve/main/yolov8s.onnx";
const FAST_MODEL_PATH =
  "https://huggingface.co/cabelo/yolov8/resolve/main/yolov8n.onnx";

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
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "rgb(114, 114, 114)";
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

export function nonMaximumSuppression(detections: Detection[]) {
  const selected: Detection[] = [];
  for (const candidate of detections.sort((a, b) => b.confidence - a.confidence)) {
    if (
      selected.every(
        (item) => item.label !== candidate.label || iou(item, candidate) < 0.5,
      )
    ) {
      selected.push(candidate);
    }
    if (selected.length >= 50) break;
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
  private session: import("onnxruntime-web/wasm").InferenceSession | null = null;
  private loading: Promise<void> | null = null;
  private activeModel = "YOLOv8s";

  get modelName() {
    return this.activeModel;
  }

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
      const options = {
        executionProviders: ["wasm"] as const,
        graphOptimizationLevel: "all" as const,
      };
      try {
        this.session = await ort.InferenceSession.create(
          ACCURACY_MODEL_PATH,
          options,
        );
        this.activeModel = "YOLOv8s";
      } catch {
        this.session = await ort.InferenceSession.create(FAST_MODEL_PATH, options);
        this.activeModel = "YOLOv8n fallback";
      }
    })();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private async detectSingle(
    source: CanvasImageSource,
    minimumConfidence: number,
  ) {
    await this.load();
    if (!this.session) throw new Error("YOLO session did not initialize");
    const ort = await import("onnxruntime-web/wasm");
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

  async detect(
    source: CanvasImageSource,
    minimumConfidence: number,
    options: { detailed?: boolean } = {},
  ) {
    const fullFrame = await this.detectSingle(source, minimumConfidence);
    if (!options.detailed) return fullFrame;

    const dimensions = sourceDimensions(source);
    if (Math.min(dimensions.width, dimensions.height) < 320) return fullFrame;

    const landscape = dimensions.width >= dimensions.height;
    const crops = landscape
      ? [
          { x: 0, y: 0, width: 0.58, height: 1 },
          { x: 0.42, y: 0, width: 0.58, height: 1 },
        ]
      : [
          { x: 0, y: 0, width: 1, height: 0.58 },
          { x: 0, y: 0.42, width: 1, height: 0.58 },
        ];

    const detailDetections: Detection[] = [];
    for (const [cropIndex, crop] of crops.entries()) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(dimensions.width * crop.width);
      canvas.height = Math.round(dimensions.height * crop.height);
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        source,
        dimensions.width * crop.x,
        dimensions.height * crop.y,
        dimensions.width * crop.width,
        dimensions.height * crop.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const detections = await this.detectSingle(canvas, minimumConfidence);
      detailDetections.push(
        ...detections.map((detection) => ({
          ...detection,
          id: `${detection.label}-detail-${cropIndex}-${detection.id}`,
          box: {
            x: crop.x + detection.box.x * crop.width,
            y: crop.y + detection.box.y * crop.height,
            width: detection.box.width * crop.width,
            height: detection.box.height * crop.height,
          },
        })),
      );
    }

    return nonMaximumSuppression([...fullFrame, ...detailDetections]);
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
