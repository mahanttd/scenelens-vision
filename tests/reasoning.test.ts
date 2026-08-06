import assert from "node:assert/strict";
import test from "node:test";
import {
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

test("estimates a potential hazard near a hand region as possibly held", () => {
  const knife: Detection = {
    id: "knife-1",
    label: "knife",
    confidence: 0.88,
    box: { x: 0.48, y: 0.5, width: 0.08, height: 0.13 },
  };
  const estimate = estimateHolding([person, knife]);
  assert.ok(estimate);
  assert.equal(estimate.object.label, "knife");
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

test("describes people and potential hazards without inferring intent", () => {
  const knife: Detection = {
    id: "knife-1",
    label: "knife",
    confidence: 0.91,
    box: { x: 0.76, y: 0.66, width: 0.08, height: 0.2 },
  };
  const description = describeScene([person, knife]);
  assert.match(description, /one person/i);
  assert.match(description, /possible knife/i);
  assert.match(description, /lower right/i);
  assert.match(description, /does not establish intent/i);
});

test("suppresses ordinary objects while keeping hazards and strong person detections", () => {
  const bottle: Detection = {
    id: "bottle-low",
    label: "bottle",
    confidence: 0.18,
    box: { x: 0.4, y: 0.2, width: 0.16, height: 0.55 },
  };
  const knife: Detection = {
    id: "knife-low",
    label: "knife",
    confidence: 0.18,
    box: { x: 0.44, y: 0.3, width: 0.07, height: 0.2 },
  };
  const weakPerson = { ...person, id: "person-weak", confidence: 0.36 };
  const visible = filterSceneDetections(
    [bottle, knife, weakPerson, person],
    0.25,
  );
  assert.deepEqual(
    visible.map((item) => item.id),
    ["knife-low", "person-1"],
  );
  assert.equal(friendlyLabel("knife"), "possible knife");
});
