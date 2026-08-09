import assert from "node:assert/strict";
import test from "node:test";
import {
  combineModelParts,
  parseSpecialistOutput,
} from "../lib/specialist-detector";

test("reassembles hosted model chunks without changing bytes", () => {
  const combined = combineModelParts([
    new Uint8Array([1, 2, 3]),
    new Uint8Array([4]),
    new Uint8Array([5, 6]),
  ]);
  assert.deepEqual([...combined], [1, 2, 3, 4, 5, 6]);
});

test("parses YOLO26 end-to-end output and reverses letterboxing", () => {
  const detections = parseSpecialistOutput(
    new Float32Array([
      100, 200, 200, 400, 0.91, 4,
      40, 40, 80, 80, 0.07, 14,
    ]),
    [1, 2, 6],
    0.1,
    { width: 1280, height: 720, scale: 0.5, padX: 0, padY: 140 },
  );

  assert.equal(detections.length, 1);
  assert.equal(detections[0].label, "bottle");
  assert.equal(detections[0].source, "specialist");
  assert.ok(Math.abs(detections[0].box.x - 0.15625) < 0.00001);
  assert.ok(Math.abs(detections[0].box.y - 1 / 6) < 0.00001);
  assert.ok(Math.abs(detections[0].box.width - 0.15625) < 0.00001);
  assert.ok(Math.abs(detections[0].box.height - 5 / 9) < 0.00001);
});

test("parses feature-major raw YOLO output", () => {
  const features = 24;
  const candidates = 1;
  const data = new Float32Array(features * candidates);
  data[0] = 320;
  data[1] = 320;
  data[2] = 160;
  data[3] = 320;
  data[4 + 14] = 0.82;

  const detections = parseSpecialistOutput(data, [1, features, candidates], 0.1, {
    width: 640,
    height: 640,
    scale: 1,
    padX: 0,
    padY: 0,
  });

  assert.equal(detections.length, 1);
  assert.equal(detections[0].label, "person");
  assert.deepEqual(detections[0].box, {
    x: 0.375,
    y: 0.25,
    width: 0.25,
    height: 0.5,
  });
});
