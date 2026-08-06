"use client";

import {
  AudioLines,
  CircleStop,
  ListTree,
  Mic2,
  RefreshCcw,
  ScanSearch,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { FormEvent } from "react";
import { friendlyLabel, isPotentiallyHarmfulObject } from "../lib/reasoning";
import type { ActivityAlert, Detection } from "../lib/types";

type Props = {
  result: string;
  resultLabel: string;
  sceneDescription: string;
  activityAlerts: ActivityAlert[];
  analyzing: boolean;
  detections: Detection[];
  question: string;
  onQuestionChange: (question: string) => void;
  onAsk: (question: string) => void;
  remoteEnabled: boolean;
  onRemoteEnabledChange: (enabled: boolean) => void;
  speechSupported: boolean;
  speechEnabled: boolean;
  onSpeechEnabledChange: (enabled: boolean) => void;
  autoNarrate: boolean;
  onAutoNarrateChange: (enabled: boolean) => void;
  speaking: boolean;
  canReplay: boolean;
  onReplay: () => void;
  onStopSpeech: () => void;
};

const quickQuestions = [
  { label: "Security summary", prompt: "Give me a security summary", icon: Sparkles },
  { label: "Possible firearm?", prompt: "Is a possible firearm visible?", icon: ShieldAlert },
  { label: "Potential hazards?", prompt: "Are any potential hazards visible?", icon: Search },
  { label: "Is anyone holding one?", prompt: "Is a person holding a potential hazard?", icon: ListTree },
  { label: "Count visible people", prompt: "Count the visible people", icon: Users },
];

export function AnalysisPanel({
  result,
  resultLabel,
  sceneDescription,
  activityAlerts,
  analyzing,
  detections,
  question,
  onQuestionChange,
  onAsk,
  remoteEnabled,
  onRemoteEnabledChange,
  speechSupported,
  speechEnabled,
  onSpeechEnabledChange,
  autoNarrate,
  onAutoNarrateChange,
  speaking,
  canReplay,
  onReplay,
  onStopSpeech,
}: Props) {
  const hazardCount = detections.filter((detection) =>
    isPotentiallyHarmfulObject(detection.label),
  ).length;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (question.trim()) onAsk(question.trim());
  };

  return (
    <aside className="analysis-shell" aria-labelledby="analysis-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SECURITY INTELLIGENCE</p>
          <h2 id="analysis-heading">People and potential hazards</h2>
        </div>
        <span className={`analysis-orb ${analyzing ? "is-active" : ""}`} aria-hidden="true" />
      </div>

      <div className="privacy-strip">
        <span className="status-dot" /> Live detection stays on this device
      </div>

      <section
        className={`scene-summary-card ${hazardCount ? "is-alert" : ""}`}
        aria-labelledby="scene-summary-heading"
        data-testid="scene-description"
      >
        <div className="scene-summary-card__header">
          <span id="scene-summary-heading"><ScanSearch size={15} /> LIVE SECURITY SUMMARY</span>
          <span>{hazardCount ? `${hazardCount} REVIEW` : "MONITORING"}</span>
        </div>
        <p>{sceneDescription}</p>
      </section>

      <section className="activity-card" aria-labelledby="activity-heading" data-testid="activity-alerts">
        <div className="activity-card__header">
          <span id="activity-heading"><ShieldAlert size={15} /> OBJECTIVE ACTIVITY</span>
          <span>NO SUSPICION SCORE</span>
        </div>
        {activityAlerts.length === 0 ? (
          <p className="activity-card__empty">
            No activity events yet. SceneLens can report entry, time in view,
            and proximity to a detected hazard.
          </p>
        ) : (
          <div className="activity-list">
            {activityAlerts.slice(0, 4).map((alert) => (
              <div className={`activity-item activity-item--${alert.severity}`} key={alert.id}>
                <span>{alert.type.replaceAll("-", " ")}</span>
                <p>{alert.message}</p>
              </div>
            ))}
          </div>
        )}
        <small>Based only on visible timing and geometry—not appearance, identity, intent, or emotion.</small>
      </section>

      <div className="result-card" aria-live="polite" data-testid="analysis-result">
        <div className="result-card__header">
          <span>{resultLabel}</span>
          {analyzing ? <span className="mini-loader">VERIFYING</span> : null}
        </div>
        <p>{result}</p>
        <div className="speech-row" aria-label="Spoken output controls">
          <button
            className={`mini-button ${speechEnabled ? "is-active" : ""}`}
            type="button"
            disabled={!speechSupported}
            aria-pressed={speechEnabled}
            onClick={() => onSpeechEnabledChange(!speechEnabled)}
          >
            {speechEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            Speech {speechEnabled ? "on" : "off"}
          </button>
          <button className="mini-button" type="button" disabled={!canReplay} onClick={onReplay}>
            <RefreshCcw size={14} /> Replay
          </button>
          <button className="mini-button" type="button" disabled={!speaking} onClick={onStopSpeech}>
            <CircleStop size={14} /> Stop
          </button>
        </div>
      </div>

      <div className="quick-grid" aria-label="Quick security questions">
        {quickQuestions.map(({ label, prompt, icon: Icon }) => (
          <button type="button" key={prompt} onClick={() => onAsk(prompt)} disabled={analyzing}>
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <form className="question-form" onSubmit={submit}>
        <label htmlFor="scene-question">Ask about this security frame</label>
        <div>
          <input
            id="scene-question"
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            maxLength={500}
            placeholder="Is anyone near a potential hazard?"
          />
          <button type="submit" aria-label="Ask SceneLens" disabled={analyzing || !question.trim()}>
            <Mic2 size={17} />
          </button>
        </div>
      </form>

      <div className="settings-stack">
        <div className="toggle-row">
          <span>
            <strong>Remote security review</strong>
            <small>Only after you ask or capture · optional provider</small>
          </span>
          <button
            className="switch-button"
            type="button"
            role="switch"
            aria-label="Remote security review"
            aria-checked={remoteEnabled}
            onClick={() => onRemoteEnabledChange(!remoteEnabled)}
          >
            <span className="toggle" aria-hidden="true" />
          </button>
        </div>
        <div className="toggle-row">
          <span>
            <strong><AudioLines size={14} /> Automatic narration</strong>
            <small>Reads a summary at most once every 12 seconds</small>
          </span>
          <button
            className="switch-button"
            type="button"
            role="switch"
            aria-label="Automatic narration"
            aria-checked={autoNarrate}
            disabled={!speechSupported}
            onClick={() => onAutoNarrateChange(!autoNarrate)}
          >
            <span className="toggle" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="object-readout">
        <div className="section-label">
          <span>SECURITY READOUT</span>
          <span>{detections.length} RELEVANT · {hazardCount} REVIEW</span>
        </div>
        {detections.length === 0 ? (
          <p className="empty-copy">No people or supported potential hazards are above the confidence threshold.</p>
        ) : (
          detections.slice(0, 8).map((detection) => (
            <div className="object-row" key={detection.id}>
              <span>{friendlyLabel(detection.label)}</span>
              <div className="confidence-meter" aria-hidden="true">
                <span style={{ width: `${detection.confidence * 100}%` }} />
              </div>
              <strong>{Math.round(detection.confidence * 100)}%</strong>
            </div>
          ))
        )}
        <p className="security-limit">
          Scope: people, possible firearms, knives, scissors, and baseball bats. AI can miss objects or confuse toys and tools; verify every alert and never use it as proof of intent.
        </p>
      </div>
    </aside>
  );
}
