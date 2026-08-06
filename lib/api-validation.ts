const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type AnalysisRequest = {
  imageDataUrl: string;
  question: string;
};

export function validateAnalysisRequest(payload: unknown):
  | { ok: true; value: AnalysisRequest; mimeType: string }
  | { ok: false; status: number; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, status: 400, error: "A JSON request body is required." };
  }
  const { imageDataUrl, question } = payload as Record<string, unknown>;
  if (typeof question !== "string" || question.trim().length < 2) {
    return { ok: false, status: 400, error: "Please provide a question." };
  }
  if (question.length > 500) {
    return { ok: false, status: 400, error: "Questions are limited to 500 characters." };
  }
  if (typeof imageDataUrl !== "string") {
    return { ok: false, status: 400, error: "A captured image is required." };
  }
  const match = imageDataUrl.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match || !ACCEPTED_IMAGE_TYPES.has(match[1])) {
    return {
      ok: false,
      status: 415,
      error: "Only JPEG, PNG, and WebP images are accepted.",
    };
  }
  const estimatedBytes = Math.floor((match[2].length * 3) / 4);
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: "The captured image exceeds 5 MB." };
  }
  return {
    ok: true,
    value: { imageDataUrl, question: question.trim() },
    mimeType: match[1],
  };
}

