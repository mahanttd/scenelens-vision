import type { BoundingBox, Detection } from "./types";
import { SpecialistDetector } from "./specialist-detector";
import { nonMaximumSuppression, YoloDetector } from "./yolo";

const SCENE_MODEL_ID = "onnx-community/dfine_s_obj365-ONNX";

const LABEL_ALIASES: Record<string, string> = {
  "dinning table": "dining table",
  "diningtable": "dining table",
  "glass bottle": "bottle",
  "monitor/tv": "tv",
  "mobile phone": "cell phone",
  "water bottle": "bottle",
};

// These upright household objects are occasionally confused with a tightly
// cropped person. We only resolve the conflict when both boxes describe almost
// the same area, so a real person holding a small bottle remains intact.
const PERSON_CONFLICT_LABELS = new Set([
  "bottle",
  "cup",
  "flask",
  "jug",
  "thermos",
  "vase",
]);

type ObjectDetectionPipeline = Awaited<
  ReturnType<typeof import("@huggingface/transformers").pipeline<"object-detection">>
>;

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function area(box: BoundingBox) {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

function intersectionOverUnion(a: BoundingBox, b: BoundingBox) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = area(a) + area(b) - intersection;
  return union > 0 ? intersection / union : 0;
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
    throw new Error("The current frame is not ready for object detection");
  }
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The image could not be prepared for detection");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function normalizeObjectLabel(label: string) {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized || normalized === "none") return null;
  return LABEL_ALIASES[normalized] ?? normalized;
}

export function resolveObjectConflicts(detections: Detection[]) {
  const competingObjects = detections.filter((detection) =>
    PERSON_CONFLICT_LABELS.has(detection.label),
  );

  return detections.filter((candidate) => {
    if (candidate.label !== "person") return true;
    const personArea = area(candidate.box);
    return !competingObjects.some((object) => {
      const sizeRatio = personArea > 0 ? area(object.box) / personArea : 0;
      return (
        sizeRatio >= 0.45 &&
        sizeRatio <= 2.2 &&
        intersectionOverUnion(candidate.box, object.box) >= 0.48 &&
        object.confidence >= candidate.confidence - 0.12
      );
    });
  });
}

export function mergeSceneDetections(detections: Detection[]) {
  return resolveObjectConflicts(nonMaximumSuppression([...detections]));
}

export class SceneDetector {
  private detector: ObjectDetectionPipeline | null = null;
  private fallback: YoloDetector | null = null;
  private specialist: SpecialistDetector | null = null;
  private loading: Promise<void> | null = null;
  private activeModel = "D-FINE-S object model";

  get modelName() {
    return this.activeModel;
  }

  async load() {
    if (this.detector || this.fallback || this.specialist) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const specialist = new SpecialistDetector();
      const specialistLoading = specialist
        .load()
        .then(() => {
          this.specialist = specialist;
        })
        .catch(() => undefined);
      try {
        const { pipeline } = await import("@huggingface/transformers");
        this.detector = await pipeline("object-detection", SCENE_MODEL_ID, {
          device: "wasm",
          dtype: "q8",
        });
        this.activeModel = "D-FINE-S · Objects365 object model";
      } catch {
        const fallback = new YoloDetector();
        await fallback.load();
        this.fallback = fallback;
        this.activeModel = `${fallback.modelName} fallback`;
      }
      await specialistLoading;
      if (this.specialist) {
        this.activeModel = `${this.activeModel} + SceneLens v3 specialist`;
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
    const primaryDetection = async () => {
      if (this.fallback) {
        return this.fallback.detect(source, minimumConfidence, options);
      }
      if (!this.detector) throw new Error("The object-detection AI did not initialize");
      const output = await this.detector(sourceCanvas(source), {
        threshold: Math.min(minimumConfidence, 0.12),
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
          id: `${label}-${index}`,
          label,
          confidence: item.score,
          source: "automatic" as const,
          box: { x, y, width: right - x, height: bottom - y },
        });
      }
      return detections;
    };

    const results = await Promise.allSettled([
      primaryDetection(),
      this.specialist?.detect(source, minimumConfidence) ?? Promise.resolve([]),
    ]);
    const detections = results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
    if (!detections.length && results.every((result) => result.status === "rejected")) {
      throw new Error("The object-detection AI could not analyze this frame");
    }
    return mergeSceneDetections(detections);
  }
}
