import type { Detection } from "./types";
import {
  mergeSceneDetections,
  normalizeObjectLabel,
} from "./scene-detector";

const OPEN_VOCABULARY_MODEL_ID =
  "onnx-community/owlvit-base-patch32-ONNX";

type ZeroShotObjectDetectionPipeline = Awaited<
  ReturnType<
    typeof import("@huggingface/transformers").pipeline<"zero-shot-object-detection">
  >
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
    throw new Error("The current frame is not ready for an expanded scan");
  }
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The frame could not be prepared for an expanded scan");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export class OpenVocabularyDetector {
  private detector: ZeroShotObjectDetectionPipeline | null = null;
  private loading: Promise<void> | null = null;

  get isReady() {
    return this.detector !== null;
  }

  async load() {
    if (this.detector) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      this.detector = await pipeline(
        "zero-shot-object-detection",
        OPEN_VOCABULARY_MODEL_ID,
        { device: "wasm", dtype: "q4" },
      );
    })();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  async detect(
    source: CanvasImageSource,
    labels: string[],
    minimumConfidence = 0.08,
  ) {
    if (labels.length === 0) return [];
    await this.load();
    if (!this.detector) {
      throw new Error("The expanded-vocabulary AI did not initialize");
    }
    const output = await this.detector(sourceCanvas(source), labels, {
      threshold: minimumConfidence,
      top_k: Math.min(100, labels.length * 5),
      percentage: true,
    });
    const detections: Detection[] = [];
    for (const [index, item] of output.entries()) {
      const label = normalizeObjectLabel(item.label);
      if (!label) continue;
      const x = clamp(item.box.xmin);
      const y = clamp(item.box.ymin);
      const right = clamp(item.box.xmax);
      const bottom = clamp(item.box.ymax);
      if (right <= x || bottom <= y) continue;
      detections.push({
        id: `open-${label}-${index}`,
        label,
        confidence: item.score,
        source: "open-vocabulary",
        box: { x, y, width: right - x, height: bottom - y },
      });
    }
    return mergeSceneDetections(detections);
  }
}
