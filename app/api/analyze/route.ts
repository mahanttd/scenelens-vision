import { validateAnalysisRequest } from "../../../lib/api-validation";

export const runtime = "edge";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 8;
const requestLog = new Map<string, number[]>();

function isRateLimited(client: string) {
  const now = Date.now();
  const recent = (requestLog.get(client) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  recent.push(now);
  requestLog.set(client, recent);
  return recent.length > MAX_REQUESTS;
}

type ProviderPayload = {
  output_text?: string;
  choices?: Array<{ message?: { content?: string } }>;
};

export async function POST(request: Request) {
  const client =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  if (isRateLimited(client)) {
    return Response.json(
      { error: "Remote analysis is temporarily rate limited. Try again shortly." },
      { status: 429 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return Response.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "The JSON request body is malformed." }, { status: 400 });
  }
  const validation = validateAnalysisRequest(payload);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: validation.status });
  }

  const providerUrl = process.env.VISION_API_URL;
  const providerKey = process.env.VISION_API_KEY;
  const model = process.env.VISION_MODEL;
  if (!providerUrl || !providerKey || !model) {
    return Response.json(
      {
        error:
          "Remote vision verification is not configured. On-device analysis is still available.",
      },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(providerUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${providerKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content:
              "You are a cautious security-review assistant. Report visible people and possible hazards only from visible evidence. Express uncertainty, never identify people, never infer intent, and never present a detection as proof of danger. State that the result requires human review.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: validation.value.question },
              {
                type: "image_url",
                image_url: { url: validation.value.imageDataUrl, detail: "low" },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    const responsePayload = (await response.json().catch(() => null)) as
      | ProviderPayload
      | null;
    if (!response.ok) {
      return Response.json(
        { error: `The configured vision provider returned ${response.status}.` },
        { status: 502 },
      );
    }
    const answer =
      responsePayload?.output_text ??
      responsePayload?.choices?.[0]?.message?.content;
    if (!answer) {
      return Response.json(
        { error: "The configured vision provider returned an empty response." },
        { status: 502 },
      );
    }
    return Response.json({ answer, provider: model });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return Response.json(
        { error: "The configured vision provider timed out after 15 seconds." },
        { status: 504 },
      );
    }
    return Response.json(
      { error: "The configured vision provider could not be reached." },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
