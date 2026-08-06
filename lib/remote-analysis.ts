export type RemoteAnalysisResult = {
  answer: string;
  provider: string;
};

export async function requestRemoteAnalysis(
  imageDataUrl: string,
  question: string,
  signal?: AbortSignal,
): Promise<RemoteAnalysisResult> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl, question }),
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | { answer?: string; provider?: string; error?: string }
    | null;
  if (!response.ok) {
    throw new Error(payload?.error || `Remote analysis failed (${response.status})`);
  }
  if (!payload?.answer) throw new Error("Remote provider returned no answer");
  return {
    answer: payload.answer,
    provider: payload.provider || "configured vision provider",
  };
}

