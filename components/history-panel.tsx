"use client";

/* eslint-disable @next/next/no-img-element -- IndexedDB data URLs cannot use the image optimizer */

import { Clock3, ImageIcon, Trash2 } from "lucide-react";
import { friendlyLabel } from "../lib/reasoning";
import type { HistoryRecord } from "../lib/types";

export function HistoryPanel({
  records,
  onDelete,
  onClear,
}: {
  records: HistoryRecord[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="history-shell" aria-labelledby="history-heading">
      <div className="history-heading">
        <div>
          <p className="eyebrow">DEVICE-LOCAL LOG</p>
          <h2 id="history-heading">Detection history</h2>
          <p>Captured frames stay in this browser, up to 40 records.</p>
        </div>
        <button
          className="button button--ghost"
          type="button"
          disabled={records.length === 0}
          onClick={onClear}
        >
          <Trash2 size={15} /> Clear all
        </button>
      </div>

      {records.length === 0 ? (
        <div className="history-empty">
          <ImageIcon size={24} />
          <div>
            <strong>No saved captures</strong>
            <p>Use Capture when you want to keep a useful scene description.</p>
          </div>
        </div>
      ) : (
        <div className="history-grid">
          {records.map((record) => (
            <article className="history-card" key={record.id}>
              <img src={record.imageDataUrl} alt="Locally saved scene capture" />
              <div className="history-card__body">
                <div className="history-time">
                  <Clock3 size={13} />
                  <time dateTime={record.createdAt}>
                    {new Intl.DateTimeFormat(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(record.createdAt))}
                  </time>
                </div>
                <p>{record.description}</p>
                <div className="history-tags">
                  {[...new Set(record.objects.map((item) => item.label))]
                    .slice(0, 5)
                    .map((label) => <span key={label}>{friendlyLabel(label)}</span>)}
                </div>
              </div>
              <button
                className="history-delete"
                onClick={() => onDelete(record.id)}
                type="button"
                aria-label={`Delete capture from ${new Date(record.createdAt).toLocaleString()}`}
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
