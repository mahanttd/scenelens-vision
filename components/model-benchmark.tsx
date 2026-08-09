"use client";

import { Gauge } from "lucide-react";
import { useEffect, useState } from "react";

type Metrics = {
  map50: number;
  map50_95: number;
  precision_at_025_iou50: number;
  recall_at_025_iou50: number;
};

type BenchmarkReport = {
  protocol: { images: number };
  previous_app_fallback: Metrics;
  pretrained_baseline: Metrics;
  scenelens_v3: Metrics;
};

const metricRows: Array<{ key: keyof Metrics; label: string }> = [
  { key: "map50", label: "mAP50" },
  { key: "map50_95", label: "mAP50–95" },
  { key: "precision_at_025_iou50", label: "Precision" },
  { key: "recall_at_025_iou50", label: "Recall" },
];

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function ModelBenchmark() {
  const [report, setReport] = useState<BenchmarkReport | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/benchmarks/scenelens-v3.json", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: BenchmarkReport | null) => setReport(data))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!report) return null;
  return (
    <details className="benchmark-card">
      <summary>
        <span>
          <Gauge size={14} /> HELD-OUT MODEL BENCHMARK
        </span>
        <strong>{percent(report.scenelens_v3.map50)} mAP50</strong>
      </summary>
      <div className="benchmark-table" role="table" aria-label="Model benchmark">
        <div className="benchmark-row benchmark-row--header" role="row">
          <span role="columnheader">Metric</span>
          <span role="columnheader">Old app</span>
          <span role="columnheader">YOLO26</span>
          <span role="columnheader">Trained</span>
        </div>
        {metricRows.map(({ key, label }) => {
          const previous = report.previous_app_fallback[key];
          const baseline = report.pretrained_baseline[key];
          const trained = report.scenelens_v3[key];
          return (
            <div className="benchmark-row" role="row" key={key}>
              <span role="cell">{label}</span>
              <span role="cell">{percent(previous)}</span>
              <span role="cell">{percent(baseline)}</span>
              <strong role="cell">{percent(trained)}</strong>
            </div>
          );
        })}
      </div>
      <small>
        Same evaluator and {report.protocol.images.toLocaleString()} unseen VOC 2007 test images.
        The broad 365-class and open-vocabulary models remain active for wider coverage.
      </small>
    </details>
  );
}
