import assert from "node:assert/strict";
import test from "node:test";
import { DetectionTracker } from "../lib/detection-tracker";
import type { Detection } from "../lib/types";

const first: Detection = {
  id: "candidate-1",
  label: "cup",
  confidence: 0.8,
  box: { x: 0.2, y: 0.3, width: 0.2, height: 0.25 },
};

test("keeps a stable identity and smooths a moving detection", () => {
  const tracker = new DetectionTracker();
  const initial = tracker.update([first]);
  const next = tracker.update([
    {
      ...first,
      id: "candidate-923",
      box: { x: 0.24, y: 0.32, width: 0.2, height: 0.25 },
    },
  ]);
  assert.equal(next[0].id, initial[0].id);
  assert.ok(next[0].box.x > first.box.x && next[0].box.x < 0.24);
});

test("briefly preserves a detection through a missed video frame", () => {
  const tracker = new DetectionTracker();
  tracker.update([first]);
  const retained = tracker.update([]);
  assert.equal(retained.length, 1);
  assert.ok(retained[0].confidence < first.confidence);
  assert.equal(tracker.update([]).length, 0);
});
