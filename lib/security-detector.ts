import type { Detection } from "./types";
import { nonMaximumSuppression, YoloDetector } from "./yolo";

const SECURITY_MODEL_ID = "onnx-community/dfine_s_obj365-ONNX";

const SECURITY_LABELS: Record<string, string> = {
  person: "person",
  gun: "gun",
  knife: "knife",
  "baseball bat": "baseball bat",
  scissors: "scissors",
};

type ObjectDetectionPipeline = Awaited<
  ReturnType<typeof import("@huggingface/transformers").pipeline<"object-detection">>
>;

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function sourceDimensions(source: CanvasImageSource) {
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
  return { width: 0, height: 0 };
}

function sourceCanvas(source: CanvasImageSource) {
  const dimensions = sourceDimensions(source);
  if (!dimensions.width || !dimensions.height) {
    throw new Error("The current frame is not ready for security analysis");
  }
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The security frame could not be prepared");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function normalizeSecurityLabel(label: string) {
  return SECURITY_LABELS[label.trim().toLowerCase()] ?? null;
}

export class SecurityDetector {
  private detector: ObjectDetectionPipeline | null = null;
  private fallback: YoloDetector | null = null;
  private loading: Promise<void> | null = null;
  private activeModel = "D-FINE-S security model";
  private firearmSupport = false;

  get modelName() {
    return this.activeModel;
  }

  get supportsFirearms() {
    return this.firearmSupport;
  }

  async load() {
    if (this.detector || this.fallback) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const { pipeline } = await import("@huggingface/transformers");
        this.detector = await pipeline("object-detection", SECURITY_MODEL_ID, {
          device: "wasm",
          dtype: "q8",
        });
        this.activeModel = "D-FINE-S · Objects365 security model";
        this.firearmSupport = true;
      } catch {
        const fallback = new YoloDetector();
        await fallback.load();
        this.fallback = fallback;
        this.activeModel = `${fallback.modelName} fallback · firearm class unavailable`;
        this.firearmSupport = false;
      }
    })();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  async detect(
    source: CanvasImageSource,
    minimumConfidence: number,
    options: { detailed?: boolean } = {},
  ) {
    await this.load();
    if (this.fallback) {
      return this.fallback.detect(source, minimumConfidence, options);
    }
    if (!this.detector) throw new Error("The security AI did not initialize");

    const output = await this.detector(sourceCanvas(source), {
      threshold: minimumConfidence,
      percentage: true,
    });
    const detections: Detection[] = [];
    for (const [index, item] of output.entries()) {
      const label = normalizeSecurityLabel(item.label);
      if (!label) continue;
      const x = clamp(item.box.xmin);
      const y = clamp(item.box.ymin);
      const right = clamp(item.box.xmax);
      const bottom = clamp(item.box.ymax);
      if (right <= x || bottom <= y) continue;
      detections.push({
        id: `${label}-${index}`,
        label,
        confidence: item.score,
        box: { x, y, width: right - x, height: bottom - y },
      });
    }
    return nonMaximumSuppression(detections);
  }
}
