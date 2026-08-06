import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryHistoryStore } from "../lib/history-store";
import type { HistoryRecord } from "../lib/types";

function record(id: string, createdAt: string): HistoryRecord {
  return {
    id,
    createdAt,
    imageDataUrl: "data:image/jpeg;base64,AA==",
    objects: [],
    description: "Test scene",
    holding: "Nothing established",
  };
}

test("history adds, sorts, deletes, and clears records", async () => {
  const store = createMemoryHistoryStore();
  await store.add(record("older", "2026-08-01T10:00:00.000Z"));
  await store.add(record("newer", "2026-08-02T10:00:00.000Z"));
  assert.deepEqual((await store.list()).map((item) => item.id), ["newer", "older"]);
  await store.delete("newer");
  assert.deepEqual((await store.list()).map((item) => item.id), ["older"]);
  await store.clear();
  assert.deepEqual(await store.list(), []);
});

test("history limits device-local records to forty entries", async () => {
  const store = createMemoryHistoryStore();
  for (let index = 0; index < 45; index += 1) {
    await store.add(record(String(index), new Date(2026, 0, index + 1).toISOString()));
  }
  assert.equal((await store.list()).length, 40);
});
