import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_LEARNED_LABELS,
  MAX_LABELS_PER_SCAN,
  mergeLearnedVocabulary,
  normalizeVocabularyLabel,
  parseVocabularyInput,
} from "../lib/vocabulary";

test("parses and normalizes custom object names", () => {
  assert.deepEqual(
    parseVocabularyInput(" Saxophone, cordless drill; STANLEY tumbler\nsaxophone "),
    ["saxophone", "cordless drill", "stanley tumbler"],
  );
  assert.equal(normalizeVocabularyLabel("  chef's knife!!! "), "chef's knife");
});

test("limits each expanded scan without limiting vocabulary over time", () => {
  const input = Array.from(
    { length: MAX_LABELS_PER_SCAN + 8 },
    (_, index) => `object ${index}`,
  ).join(",");
  assert.equal(parseVocabularyInput(input).length, MAX_LABELS_PER_SCAN);

  const learned = mergeLearnedVocabulary(
    [],
    Array.from(
      { length: MAX_LEARNED_LABELS + 12 },
      (_, index) => `learned object ${index}`,
    ),
  );
  assert.equal(learned.length, MAX_LEARNED_LABELS);
  assert.equal(learned.at(-1), `learned object ${MAX_LEARNED_LABELS + 11}`);
});

test("deduplicates learned names while preserving the newest vocabulary", () => {
  assert.deepEqual(
    mergeLearnedVocabulary(["violin", "camera"], ["camera", "telescope"]),
    ["violin", "camera", "telescope"],
  );
});
