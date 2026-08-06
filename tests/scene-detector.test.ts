import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeObjectLabel,
  resolveObjectConflicts,
} from "../lib/scene-detector";
import type { Detection } from "../lib/types";

test("normalizes broad object-model labels", () => {
  assert.equal(normalizeObjectLabel(" Bottle "), "bottle");
  assert.equal(normalizeObjectLabel("Water Bottle"), "bottle");
  assert.equal(normalizeObjectLabel("Dinning Table"), "dining table");
  assert.equal(normalizeObjectLabel("Laptop"), "laptop");
});

test("prefers a credible bottle over a person prediction on the same object", () => {
  const detections: Detection[] = [
    {
      id: "person-false-positive",
      label: "person",
      confidence: 0.72,
      box: { x: 0.25, y: 0.12, width: 0.18, height: 0.68 },
    },
    {
      id: "bottle-correct",
      label: "bottle",
      confidence: 0.68,
      box: { x: 0.24, y: 0.1, width: 0.19, height: 0.7 },
    },
  ];
  assert.deepEqual(
    resolveObjectConflicts(detections).map((item) => item.id),
    ["bottle-correct"],
  );
});

test("keeps a real person when a much smaller bottle is in their hand", () => {
  const detections: Detection[] = [
    {
      id: "person-real",
      label: "person",
      confidence: 0.91,
      box: { x: 0.16, y: 0.06, width: 0.5, height: 0.86 },
    },
    {
      id: "bottle-held",
      label: "bottle",
      confidence: 0.79,
      box: { x: 0.52, y: 0.45, width: 0.07, height: 0.2 },
    },
  ];
  assert.deepEqual(
    resolveObjectConflicts(detections).map((item) => item.id),
    ["person-real", "bottle-held"],
  );
});
