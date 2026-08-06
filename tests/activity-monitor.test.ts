import assert from "node:assert/strict";
import test from "node:test";
import { ActivityMonitor } from "../lib/activity-monitor";
import type { Detection } from "../lib/types";

const person: Detection = {
  id: "person-1",
  label: "person",
  confidence: 0.94,
  box: { x: 0.2, y: 0.1, width: 0.4, height: 0.8 },
};

test("reports entry and one prolonged-presence event without judging suspicion", () => {
  const monitor = new ActivityMonitor();
  const entry = monitor.update([person], 1_000);
  assert.equal(entry.length, 1);
  assert.equal(entry[0].type, "entry");

  for (const timestamp of [4_000, 7_000, 10_000, 13_000, 15_999]) {
    assert.deepEqual(monitor.update([person], timestamp), []);
  }
  const prolonged = monitor.update([person], 16_000);
  assert.equal(prolonged.length, 1);
  assert.equal(prolonged[0].type, "prolonged-presence");
  assert.doesNotMatch(prolonged[0].message, /suspicious|intent/i);
  assert.deepEqual(monitor.update([person], 19_000), []);
});

test("reports objective proximity between a person and a possible firearm", () => {
  const monitor = new ActivityMonitor();
  const firearm: Detection = {
    id: "gun-1",
    label: "gun",
    confidence: 0.88,
    box: { x: 0.5, y: 0.5, width: 0.08, height: 0.12 },
  };
  const alerts = monitor.update([person, firearm], 20_000);
  assert.ok(alerts.some((alert) => alert.type === "hazard-proximity"));
  assert.ok(alerts.some((alert) => /possible firearm/i.test(alert.message)));
});
