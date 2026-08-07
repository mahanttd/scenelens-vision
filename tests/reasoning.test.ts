import assert from "node:assert/strict";
import test from "node:test";
import {
  answerLocalQuestion,
  describeScene,
  estimateHolding,
  filterByConfidence,
  filterSceneDetections,
  friendlyLabel,
} from "../lib/reasoning";
import type { Detection } from "../lib/types";

const person: Detection = {
  id: "person-1",
  label: "person",
  confidence: 0.95,
  box: { x: 0.2, y: 0.1, width: 0.35, height: 0.8 },
};

test("estimates an everyday object near a hand region as possibly held", () => {
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

test("describes a mixed everyday scene", () => {
  const laptop: Detection = {
    id: "laptop-1",
    label: "laptop",
    confidence: 0.91,
    box: { x: 0.66, y: 0.56, width: 0.22, height: 0.18 },
  };
  const bottle: Detection = {
    id: "bottle-1",
    label: "bottle",
    confidence: 0.84,
    box: { x: 0.08, y: 0.46, width: 0.07, height: 0.24 },
  };
  const description = describeScene([person, laptop, bottle]);
  assert.match(description, /workspace/i);
  assert.match(description, /person/i);
  assert.match(description, /water bottle/i);
  assert.match(description, /laptop/i);
});

test("boosts small objects while requiring stronger evidence for a person", () => {
  const bottle: Detection = {
    id: "bottle-low",
    label: "bottle",
    confidence: 0.18,
    box: { x: 0.4, y: 0.2, width: 0.16, height: 0.55 },
  };
  const laptop: Detection = {
    id: "laptop-low",
    label: "laptop",
    confidence: 0.18,
    box: { x: 0.44, y: 0.55, width: 0.2, height: 0.14 },
  };
  const weakPerson = { ...person, id: "person-weak", confidence: 0.44 };
  const visible = filterSceneDetections(
    [bottle, laptop, weakPerson, person],
    0.25,
  );
  assert.deepEqual(
    visible.map((item) => item.id),
    ["bottle-low", "laptop-low", "person-1"],
  );
  assert.equal(friendlyLabel("bottle"), "water bottle");
});

test("answers direct questions about a water bottle", () => {
  const bottle: Detection = {
    id: "bottle-1",
    label: "bottle",
    confidence: 0.82,
    box: { x: 0.4, y: 0.25, width: 0.12, height: 0.5 },
  };
  assert.match(
    answerLocalQuestion("Is a water bottle visible?", [bottle]),
    /water bottle.*82%/i,
  );
});

test("keeps lower-confidence results from an explicit open-vocabulary search", () => {
  const saxophone: Detection = {
    id: "open-saxophone",
    label: "saxophone",
    confidence: 0.11,
    source: "open-vocabulary",
    box: { x: 0.3, y: 0.2, width: 0.24, height: 0.62 },
  };
  assert.deepEqual(
    filterSceneDetections([saxophone], 0.25).map((item) => item.id),
    ["open-saxophone"],
  );
});
