import type {
  BoundingBox,
  Detection,
  HoldingEstimate,
} from "./types";

const NON_HOLDABLE = new Set([
  "person",
  "car",
  "truck",
  "bus",
  "train",
  "airplane",
  "boat",
  "bed",
  "couch",
  "dining table",
]);

const POTENTIALLY_HARMFUL_LABELS = new Set([
  "baseball bat",
  "gun",
  "knife",
  "scissors",
]);

const SECURITY_RELEVANT_LABELS = new Set([
  "person",
  ...POTENTIALLY_HARMFUL_LABELS,
]);

const FRIENDLY_LABELS: Record<string, string> = {
  "baseball bat": "possible impact object",
  gun: "possible firearm",
  knife: "possible knife",
  scissors: "possible scissors",
};

const area = (box: BoundingBox) => Math.max(0, box.width) * Math.max(0, box.height);

export function intersectionOverUnion(a: BoundingBox, b: BoundingBox) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = area(a) + area(b) - intersection;
  return union > 0 ? intersection / union : 0;
}

function distanceToNearestHand(person: BoundingBox, object: BoundingBox) {
  const objectCenter = {
    x: object.x + object.width / 2,
    y: object.y + object.height / 2,
  };
  const handAnchors = [
    { x: person.x + person.width * 0.12, y: person.y + person.height * 0.58 },
    { x: person.x + person.width * 0.88, y: person.y + person.height * 0.58 },
  ];
  const diagonal = Math.hypot(person.width, person.height) || 1;
  return Math.min(
    ...handAnchors.map((hand) =>
      Math.hypot(objectCenter.x - hand.x, objectCenter.y - hand.y),
    ),
  ) / diagonal;
}

function expandedInteractionBox(person: BoundingBox): BoundingBox {
  return {
    x: person.x - person.width * 0.3,
    y: person.y + person.height * 0.18,
    width: person.width * 1.6,
    height: person.height * 0.72,
  };
}

function centerInside(box: BoundingBox, region: BoundingBox) {
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  return (
    x >= region.x &&
    x <= region.x + region.width &&
    y >= region.y &&
    y <= region.y + region.height
  );
}

export function estimateHolding(detections: Detection[]): HoldingEstimate {
  const people = detections.filter((detection) => detection.label === "person");
  const candidates = detections.filter(
    (detection) =>
      !NON_HOLDABLE.has(detection.label) && area(detection.box) < 0.22,
  );

  let best: NonNullable<HoldingEstimate> | null = null;
  for (const person of people) {
    for (const object of candidates) {
      const distance = distanceToNearestHand(person.box, object.box);
      const overlap = intersectionOverUnion(person.box, object.box);
      const inInteractionZone = centerInside(
        object.box,
        expandedInteractionBox(person.box),
      );
      if (!inInteractionZone && distance > 0.38) continue;

      const proximity = Math.max(0, 1 - distance / 0.45);
      const sizeFit = Math.max(0, 1 - area(object.box) / 0.2);
      const score = Math.min(
        0.93,
        proximity * 0.5 + overlap * 0.14 + object.confidence * 0.26 + sizeFit * 0.1,
      );
      if (score < 0.38 || (best && best.confidence >= score)) continue;

      best = {
        person,
        object,
        confidence: score,
        rationale:
          "The object is close to an estimated hand region and overlaps the person’s interaction zone.",
      };
    }
  }
  return best;
}

function formatList(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function friendlyLabel(label: string) {
  return FRIENDLY_LABELS[label] ?? label;
}

export function isPotentiallyHarmfulObject(label: string) {
  return POTENTIALLY_HARMFUL_LABELS.has(label);
}

function positionPhrase(box: BoundingBox) {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const horizontal = centerX < 0.34 ? "left" : centerX > 0.66 ? "right" : "center";
  const vertical = centerY < 0.34 ? "upper" : centerY > 0.66 ? "lower" : "middle";
  if (area(box) > 0.38) return "across much of the view";
  if (horizontal === "center" && vertical === "middle") return "near the center";
  if (horizontal === "center") return `in the ${vertical} part of the view`;
  if (vertical === "middle") return `on the ${horizontal}`;
  return `in the ${vertical} ${horizontal}`;
}

export function describeScene(detections: Detection[]) {
  if (detections.length === 0) {
    return "No people or potentially harmful objects are confidently detected in the current view.";
  }
  const people = detections.filter((detection) => detection.label === "person");
  const hazards = detections.filter((detection) =>
    isPotentiallyHarmfulObject(detection.label),
  );
  const peopleText =
    people.length === 0
      ? "No people are confidently detected."
      : `${people.length === 1 ? "One person is" : `${people.length} people are`} visible.`;
  if (hazards.length === 0) {
    return `${peopleText} No potentially harmful object is confidently detected.`;
  }
  const hazardDetails = hazards.slice(0, 4).map(
    (hazard) =>
      `${friendlyLabel(hazard.label)} ${positionPhrase(hazard.box)} (${Math.round(hazard.confidence * 100)}% confidence)`,
  );
  return `${peopleText} Review needed: ${formatList(hazardDetails)}. Detection does not establish intent.`;
}

export function describeHolding(detections: Detection[]) {
  const people = detections.filter((detection) => detection.label === "person");
  if (people.length === 0) {
    return "I can’t estimate what someone is holding because no person is confidently visible.";
  }
  const estimate = estimateHolding(detections);
  if (!estimate) {
    return "A person is visible, but no potentially harmful object has enough spatial evidence to call it held.";
  }
  return `A person may be holding ${articleFor(friendlyLabel(estimate.object.label))} ${friendlyLabel(estimate.object.label)} — ${Math.round(estimate.confidence * 100)}% spatial confidence. Review the live view; this does not establish intent.`;
}

function articleFor(label: string) {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

export function describeTable(detections: Detection[]) {
  const tables = detections.filter((detection) =>
    ["dining table", "table"].includes(detection.label),
  );
  if (tables.length === 0) {
    const lowerObjects = detections
      .filter(
        (detection) =>
          detection.label !== "person" &&
          detection.box.y + detection.box.height / 2 > 0.55 &&
          area(detection.box) < 0.2,
      )
      .map((detection) => detection.label);
    return lowerObjects.length
      ? `No table is confidently detected. Objects low in the frame may include ${formatList([...new Set(lowerObjects)])}.`
      : "I can’t confidently identify a table or objects resting on one in this frame.";
  }
  const table = tables[0];
  const objects = detections
    .filter((detection) => detection.id !== table.id && detection.label !== "person")
    .filter((detection) => {
      const centerX = detection.box.x + detection.box.width / 2;
      const bottom = detection.box.y + detection.box.height;
      return (
        centerX >= table.box.x - 0.04 &&
        centerX <= table.box.x + table.box.width + 0.04 &&
        bottom >= table.box.y - 0.12 &&
        bottom <= table.box.y + table.box.height * 0.65
      );
    })
    .map((detection) => detection.label);
  return objects.length
    ? `The table appears to hold ${formatList([...new Set(objects)])}.`
    : "A table is visible, but I can’t identify any object on it with enough confidence.";
}

export function countPeople(detections: Detection[]) {
  const count = detections.filter((detection) => detection.label === "person").length;
  return count === 0
    ? "No people are confidently detected in the current frame."
    : `I can see ${count} ${count === 1 ? "person" : "people"} in the current frame.`;
}

export function answerLocalQuestion(question: string, detections: Detection[]) {
  const normalized = question.toLowerCase();
  if (/firearm|gun/.test(normalized)) {
    const firearms = detections.filter((detection) => detection.label === "gun");
    return firearms.length === 0
      ? "No possible firearm is confidently detected in the current frame. A missed detection is still possible, so verify the live view."
      : `${firearms.length === 1 ? "One possible firearm is" : `${firearms.length} possible firearms are`} detected; the strongest detection is ${Math.round(Math.max(...firearms.map((item) => item.confidence)) * 100)}% confident. Treat this as a review alert, not proof.`;
  }
  if (/describe|summary|security|hazard|harmful|danger|weapon|what.*(?:see|visible)/.test(normalized)) {
    return describeScene(detections);
  }
  if (/hold|carrying|carry/.test(normalized)) return describeHolding(detections);
  if (/how many|count/.test(normalized) && /people|person/.test(normalized)) {
    return countPeople(detections);
  }
  const labels = [...new Set(detections.map((detection) => detection.label))];
  const mentioned = labels.find((label) => normalized.includes(label));
  if (mentioned) {
    const matches = detections.filter((detection) => detection.label === mentioned);
    return `I can see ${matches.length} ${mentioned}${matches.length === 1 ? "" : "s"}; the strongest detection is ${Math.round(Math.max(...matches.map((item) => item.confidence)) * 100)}% confident.`;
  }
  return `${describeScene(detections)} I only report people and the supported potential-hazard classes.`;
}

export function filterByConfidence(
  detections: Detection[],
  minimumConfidence: number,
) {
  return detections.filter(
    (detection) => detection.confidence >= minimumConfidence,
  );
}

export function sceneConfidenceThreshold(
  label: string,
  baselineConfidence: number,
) {
  if (label === "person") {
    return Math.max(0.38, baselineConfidence * 1.25);
  }
  if (label === "gun") {
    return Math.max(0.3, baselineConfidence);
  }
  if (POTENTIALLY_HARMFUL_LABELS.has(label)) {
    return Math.max(0.12, baselineConfidence * 0.62);
  }
  return 1;
}

export function filterSceneDetections(
  detections: Detection[],
  baselineConfidence: number,
) {
  return detections.filter(
    (detection) =>
      SECURITY_RELEVANT_LABELS.has(detection.label) &&
      detection.confidence >=
      sceneConfidenceThreshold(detection.label, baselineConfidence),
  );
}
