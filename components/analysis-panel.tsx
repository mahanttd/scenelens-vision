"use client";

import {
  AudioLines,
  CircleStop,
  ListTree,
  Mic2,
  RefreshCcw,
  Search,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { FormEvent } from "react";
import type { Detection } from "../lib/types";

type Props = {
  result: string;
  resultLabel: string;
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
  { label: "Describe the scene", prompt: "Describe the scene", icon: Sparkles },
  { label: "What are they holding?", prompt: "What is the person holding?", icon: Search },
  { label: "What’s on the table?", prompt: "What is on the table?", icon: ListTree },
  { label: "Count visible people", prompt: "Count the visible people", icon: Users },
];

export function AnalysisPanel({
  result,
  resultLabel,
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
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (question.trim()) onAsk(question.trim());
  };

  return (
    <aside className="analysis-shell" aria-labelledby="analysis-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SCENE INTELLIGENCE</p>
          <h2 id="analysis-heading">Evidence, interpreted</h2>
        </div>
        <span className={`analysis-orb ${analyzing ? "is-active" : ""}`} aria-hidden="true" />
      </div>

      <div className="privacy-strip">
        <span className="status-dot" /> Live detection stays on this device
      </div>

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

      <div className="quick-grid" aria-label="Quick scene questions">
        {quickQuestions.map(({ label, prompt, icon: Icon }) => (
          <button type="button" key={prompt} onClick={() => onAsk(prompt)} disabled={analyzing}>
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <form className="question-form" onSubmit={submit}>
        <label htmlFor="scene-question">Ask about this frame</label>
        <div>
          <input
            id="scene-question"
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            maxLength={500}
            placeholder="Is there a bottle near the laptop?"
          />
          <button type="submit" aria-label="Ask SceneLens" disabled={analyzing || !question.trim()}>
            <Mic2 size={17} />
          </button>
        </div>
      </form>

      <div className="settings-stack">
        <div className="toggle-row">
          <span>
            <strong>Remote vision verification</strong>
            <small>Only after you ask or capture · optional provider</small>
          </span>
          <button
            className="switch-button"
            type="button"
            role="switch"
            aria-label="Remote vision verification"
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
          <span>OBJECT READOUT</span>
          <span>{detections.length} TRACKED</span>
        </div>
        {detections.length === 0 ? (
          <p className="empty-copy">Objects above the confidence threshold will appear here.</p>
        ) : (
          detections.slice(0, 8).map((detection) => (
            <div className="object-row" key={detection.id}>
              <span>{detection.label}</span>
              <div className="confidence-meter" aria-hidden="true">
                <span style={{ width: `${detection.confidence * 100}%` }} />
              </div>
              <strong>{Math.round(detection.confidence * 100)}%</strong>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
