import assert from "node:assert/strict";
import test from "node:test";
import {
  describeScene,
  estimateHolding,
  filterByConfidence,
} from "../lib/reasoning";
import type { Detection } from "../lib/types";

const person: Detection = {
  id: "person-1",
  label: "person",
  confidence: 0.95,
  box: { x: 0.2, y: 0.1, width: 0.35, height: 0.8 },
};

test("estimates a small object near a hand region as possibly held", () => {
  const cup: Detection = {
    id: "cup-1",
    label: "cup",
    confidence: 0.88,
    box: { x: 0.48, y: 0.5, width: 0.08, height: 0.13 },
  };
  const estimate = estimateHolding([person, cup]);
  assert.ok(estimate);
  assert.equal(estimate.object.label, "cup");
  assert.ok(estimate.confidence >= 0.38 && estimate.confidence < 1);
});

test("does not claim that a distant object is held", () => {
  const bottle: Detection = {
    id: "bottle-1",
    label: "bottle",
    confidence: 0.91,
    box: { x: 0.82, y: 0.1, width: 0.06, height: 0.14 },
  };
  assert.equal(estimateHolding([person, bottle]), null);
});

test("ignores large non-holdable objects", () => {
  const table: Detection = {
    id: "table-1",
    label: "dining table",
    confidence: 0.87,
    box: { x: 0.05, y: 0.62, width: 0.9, height: 0.3 },
  };
  assert.equal(estimateHolding([person, table]), null);
});

test("filters detections at the configured confidence boundary", () => {
  const low = { ...person, id: "low", confidence: 0.39 };
  const boundary = { ...person, id: "boundary", confidence: 0.4 };
  const high = { ...person, id: "high", confidence: 0.86 };
  assert.deepEqual(
    filterByConfidence([low, boundary, high], 0.4).map((item) => item.id),
    ["boundary", "high"],
  );
});

test("describes scene type, objects, and spatial position", () => {
  const laptop: Detection = {
    id: "laptop-1",
    label: "laptop",
    confidence: 0.91,
    box: { x: 0.66, y: 0.58, width: 0.25, height: 0.2 },
  };
  const keyboard: Detection = {
    id: "keyboard-1",
    label: "keyboard",
    confidence: 0.82,
    box: { x: 0.38, y: 0.72, width: 0.3, height: 0.1 },
  };
  const description = describeScene([person, laptop, keyboard]);
  assert.match(description, /workspace or study area/i);
  assert.match(description, /one person/i);
  assert.match(description, /laptop/i);
  assert.match(description, /lower right/i);
});
