"use client";

import {
  AudioLines,
  BrainCircuit,
  CircleStop,
  ListTree,
  Mic2,
  RefreshCcw,
  ScanSearch,
  Search,
  Sparkles,
  Trash2,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { FormEvent } from "react";
import { friendlyLabel } from "../lib/reasoning";
import type { Detection, VocabularyModelState } from "../lib/types";

type Props = {
  result: string;
  resultLabel: string;
  sceneDescription: string;
  analyzing: boolean;
  detections: Detection[];
  vocabularyInput: string;
  onVocabularyInputChange: (value: string) => void;
  vocabularyModelState: VocabularyModelState;
  learnedVocabulary: string[];
  continuousVocabulary: boolean;
  onContinuousVocabularyChange: (enabled: boolean) => void;
  onFindAnything: () => void;
  onClearLearnedVocabulary: () => void;
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
  { label: "Describe scene", prompt: "Describe the visible scene", icon: Sparkles },
  { label: "Is that a bottle?", prompt: "Is a water bottle visible?", icon: Search },
  { label: "What am I holding?", prompt: "What is the person holding?", icon: ListTree },
  { label: "What's on the table?", prompt: "What is on the table?", icon: ScanSearch },
  { label: "Count visible people", prompt: "Count the visible people", icon: Users },
];

function vocabularyStatus(state: VocabularyModelState) {
  if (state === "loading") return "LOADING MODEL";
  if (state === "scanning") return "SCANNING";
  if (state === "ready") return "READY";
  if (state === "error") return "UNAVAILABLE";
  return "ON DEMAND";
}

export function AnalysisPanel({
  result,
  resultLabel,
  sceneDescription,
  analyzing,
  detections,
  vocabularyInput,
  onVocabularyInputChange,
  vocabularyModelState,
  learnedVocabulary,
  continuousVocabulary,
  onContinuousVocabularyChange,
  onFindAnything,
  onClearLearnedVocabulary,
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
  const vocabularyBusy = ["loading", "scanning"].includes(vocabularyModelState);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (question.trim()) onAsk(question.trim());
  };

  return (
    <aside className="analysis-shell" aria-labelledby="analysis-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SCENE INTELLIGENCE</p>
          <h2 id="analysis-heading">Ask about what&apos;s visible</h2>
        </div>
        <span
          className={`analysis-orb ${analyzing ? "is-active" : ""}`}
          aria-hidden="true"
        />
      </div>

      <div className="privacy-strip">
        <span className="status-dot" /> Live detection stays on this device
      </div>

      <section
        className="scene-summary-card"
        aria-labelledby="scene-summary-heading"
        data-testid="scene-description"
      >
        <div className="scene-summary-card__header">
          <span id="scene-summary-heading">
            <ScanSearch size={15} /> LIVE SCENE DESCRIPTION
          </span>
          <span>{detections.length ? `${detections.length} OBJECTS` : "SCANNING"}</span>
        </div>
        <p>{sceneDescription}</p>
      </section>

      <section className="vocabulary-card" aria-labelledby="vocabulary-heading">
        <div className="vocabulary-card__header">
          <span id="vocabulary-heading">
            <BrainCircuit size={15} /> FIND ANYTHING
          </span>
          <span>{vocabularyStatus(vocabularyModelState)}</span>
        </div>
        <p>
          Search for nearly any named object beyond the automatic 365 classes.
          The first scan downloads a larger private AI model once.
        </p>
        <form
          className="vocabulary-form"
          onSubmit={(event) => {
            event.preventDefault();
            onFindAnything();
          }}
        >
          <label htmlFor="vocabulary-input">Object names, separated by commas</label>
          <div>
            <input
              id="vocabulary-input"
              value={vocabularyInput}
              onChange={(event) => onVocabularyInputChange(event.target.value)}
              maxLength={1_000}
              placeholder="saxophone, cordless drill, Stanley tumbler"
            />
            <button type="submit" disabled={vocabularyBusy}>
              <ScanSearch size={15} /> {vocabularyBusy ? "Working…" : "Scan"}
            </button>
          </div>
        </form>
        <div className="vocabulary-learning-row">
          <span>
            <strong>{learnedVocabulary.length} learned names</strong>
            <small>Saved only in this browser</small>
          </span>
          <button
            className="switch-button"
            type="button"
            role="switch"
            aria-label="Keep checking learned object names"
            aria-checked={continuousVocabulary}
            disabled={learnedVocabulary.length === 0}
            onClick={() => onContinuousVocabularyChange(!continuousVocabulary)}
          >
            <span className="toggle" aria-hidden="true" />
          </button>
        </div>
        {learnedVocabulary.length > 0 ? (
          <div className="vocabulary-saved">
            <div>
              {[...learnedVocabulary]
                .slice(-6)
                .reverse()
                .map((label) => <span key={label}>{label}</span>)}
            </div>
            <button
              type="button"
              onClick={onClearLearnedVocabulary}
              aria-label="Clear learned object names"
            >
              <Trash2 size={13} /> Clear
            </button>
          </div>
        ) : null}
        <small className="vocabulary-honesty">
          Open vocabulary is broad, not magic: it searches up to 40 names per scan
          and may still miss small, hidden, or unfamiliar objects. It learns your
          search vocabulary locally; it does not scrape or upload your camera images.
        </small>
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
            placeholder="Is that a water bottle?"
          />
          <button type="submit" aria-label="Ask SceneLens" disabled={analyzing || !question.trim()}>
            <Mic2 size={17} />
          </button>
        </div>
      </form>

      <div className="settings-stack">
        <div className="toggle-row">
          <span>
            <strong>Remote visual analysis</strong>
            <small>Only after you ask or capture · optional provider</small>
          </span>
          <button
            className="switch-button"
            type="button"
            role="switch"
            aria-label="Remote visual analysis"
            aria-checked={remoteEnabled}
            onClick={() => onRemoteEnabledChange(!remoteEnabled)}
          >
            <span className="toggle" aria-hidden="true" />
          </button>
        </div>
        <div className="toggle-row">
          <span>
            <strong>
              <AudioLines size={14} /> Automatic narration
            </strong>
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
          <span>{detections.length} DETECTED</span>
        </div>
        {detections.length === 0 ? (
          <p className="empty-copy">No objects are above the confidence threshold yet.</p>
        ) : (
          detections.slice(0, 10).map((detection) => (
            <div className="object-row" key={detection.id}>
              <span>{friendlyLabel(detection.label)}</span>
              <div className="confidence-meter" aria-hidden="true">
                <span style={{ width: `${detection.confidence * 100}%` }} />
              </div>
              <strong>{Math.round(detection.confidence * 100)}%</strong>
            </div>
          ))
        )}
        <p className="model-note">
          Fast mode recognizes 365 common categories. Find Anything adds virtually
          unlimited named-object searches over time; people still require stronger evidence.
        </p>
      </div>
    </aside>
  );
}
