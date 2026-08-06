import { intersectionOverUnion } from "./reasoning";
import type { BoundingBox, Detection } from "./types";

type Track = Detection & { missedFrames: number };

function blendBox(previous: BoundingBox, current: BoundingBox): BoundingBox {
  const currentWeight = 0.58;
  const previousWeight = 1 - currentWeight;
  return {
    x: previous.x * previousWeight + current.x * currentWeight,
    y: previous.y * previousWeight + current.y * currentWeight,
    width: previous.width * previousWeight + current.width * currentWeight,
    height: previous.height * previousWeight + current.height * currentWeight,
  };
}

export class DetectionTracker {
  private tracks: Track[] = [];
  private nextId = 1;

  reset() {
    this.tracks = [];
  }

  update(detections: Detection[]) {
    const unmatchedTracks = new Set(this.tracks.map((_, index) => index));
    const nextTracks: Track[] = [];

    for (const detection of [...detections].sort(
      (a, b) => b.confidence - a.confidence,
    )) {
      let bestIndex = -1;
      let bestOverlap = 0.22;
      for (const index of unmatchedTracks) {
        const track = this.tracks[index];
        if (track.label !== detection.label) continue;
        const overlap = intersectionOverUnion(track.box, detection.box);
        if (overlap > bestOverlap) {
          bestIndex = index;
          bestOverlap = overlap;
        }
      }

      if (bestIndex >= 0) {
        const previous = this.tracks[bestIndex];
        unmatchedTracks.delete(bestIndex);
        nextTracks.push({
          ...detection,
          id: previous.id,
          box: blendBox(previous.box, detection.box),
          confidence: Math.max(
            detection.confidence,
            previous.confidence * 0.88,
          ),
          missedFrames: 0,
        });
      } else {
        nextTracks.push({
          ...detection,
          id: `${detection.label}-${this.nextId++}`,
          missedFrames: 0,
        });
      }
    }

    for (const index of unmatchedTracks) {
      const track = this.tracks[index];
      if (track.missedFrames >= 1) continue;
      nextTracks.push({
        ...track,
        confidence: track.confidence * 0.78,
        missedFrames: track.missedFrames + 1,
      });
    }

    this.tracks = nextTracks.slice(0, 50);
    return this.tracks.map((track) => ({
      id: track.id,
      label: track.label,
      confidence: track.confidence,
      box: track.box,
    }));
  }
}
