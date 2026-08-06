import { estimateHolding, friendlyLabel } from "./reasoning";
import type { ActivityAlert, Detection } from "./types";

const LOST_PERSON_TIMEOUT_MS = 4_000;
const PROLONGED_PRESENCE_MS = 15_000;
const HAZARD_ALERT_COOLDOWN_MS = 12_000;

type PersonObservation = {
  firstSeen: number;
  lastSeen: number;
  prolongedAlerted: boolean;
};

export class ActivityMonitor {
  private people = new Map<string, PersonObservation>();
  private hazardAlerts = new Map<string, number>();
  private alertCounter = 0;

  reset() {
    this.people.clear();
    this.hazardAlerts.clear();
    this.alertCounter = 0;
  }

  private alert(
    type: ActivityAlert["type"],
    severity: ActivityAlert["severity"],
    message: string,
    createdAt: number,
  ): ActivityAlert {
    this.alertCounter += 1;
    return {
      id: `${type}-${createdAt}-${this.alertCounter}`,
      type,
      severity,
      message,
      createdAt,
    };
  }

  update(detections: Detection[], now = Date.now()) {
    const alerts: ActivityAlert[] = [];
    const visiblePeople = detections.filter(
      (detection) => detection.label === "person",
    );

    for (const [id, observation] of this.people) {
      if (now - observation.lastSeen > LOST_PERSON_TIMEOUT_MS) {
        this.people.delete(id);
      }
    }

    for (const person of visiblePeople) {
      const observation = this.people.get(person.id);
      if (!observation) {
        this.people.set(person.id, {
          firstSeen: now,
          lastSeen: now,
          prolongedAlerted: false,
        });
        alerts.push(
          this.alert(
            "entry",
            "info",
            "A person entered the monitored view.",
            now,
          ),
        );
        continue;
      }

      observation.lastSeen = now;
      if (
        !observation.prolongedAlerted &&
        now - observation.firstSeen >= PROLONGED_PRESENCE_MS
      ) {
        observation.prolongedAlerted = true;
        alerts.push(
          this.alert(
            "prolonged-presence",
            "review",
            "A person has remained continuously visible for at least 15 seconds.",
            now,
          ),
        );
      }
    }

    const holding = estimateHolding(detections);
    if (holding) {
      const key = `${holding.person.id}:${holding.object.id}`;
      const previous = this.hazardAlerts.get(key) ?? 0;
      if (now - previous >= HAZARD_ALERT_COOLDOWN_MS) {
        this.hazardAlerts.set(key, now);
        alerts.push(
          this.alert(
            "hazard-proximity",
            "review",
            `${friendlyLabel(holding.object.label)} is close to an estimated hand region. Review the live view.`,
            now,
          ),
        );
      }
    }

    return alerts;
  }
}
