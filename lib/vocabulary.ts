const STORAGE_KEY = "scenelens.learned-vocabulary.v1";

export const MAX_LABELS_PER_SCAN = 40;
export const MAX_LEARNED_LABELS = 500;

export function normalizeVocabularyLabel(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+&' -]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 48)
    .trim();
}

export function parseVocabularyInput(
  input: string,
  limit = MAX_LABELS_PER_SCAN,
) {
  const labels = input
    .split(/[,;\n]/)
    .map(normalizeVocabularyLabel)
    .filter(Boolean);
  return [...new Set(labels)].slice(0, limit);
}

export function mergeLearnedVocabulary(
  current: string[],
  incoming: string[],
) {
  const normalized = [...current, ...incoming]
    .map(normalizeVocabularyLabel)
    .filter(Boolean);
  return [...new Set(normalized)].slice(-MAX_LEARNED_LABELS);
}

export function loadLearnedVocabulary() {
  if (typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value)
      ? mergeLearnedVocabulary([], value.filter((item): item is string => typeof item === "string"))
      : [];
  } catch {
    return [];
  }
}

export function saveLearnedVocabulary(labels: string[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(mergeLearnedVocabulary([], labels)),
  );
}
