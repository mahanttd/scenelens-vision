# SceneLens

Privacy-first, real-time AI object detection and scene understanding in the browser.

[Open the live application](https://scenelens-vision.mk1l.chatgpt.site/) | [View the benchmark report](public/benchmarks/scenelens-v3.json) | [Read the training notes](training/README.md)

SceneLens analyzes a webcam feed or uploaded image with three complementary computer-vision models. It automatically detects everyday objects, uses a trained specialist to reduce difficult person/object mix-ups, and can search for user-supplied object names. It then turns the detections into a plain-language scene description.

The current application is general-purpose visual assistance. It is not aerospace-specific or limited to security objects.

## What SceneLens can do

- Analyze a live webcam, switch between available cameras, or inspect an uploaded image.
- Detect broad everyday-object categories with D-FINE-S trained on Objects365.
- Double-check 20 common categories with the custom SceneLens v3 YOLO26s specialist.
- Search for custom object names with the OWL-ViT open-vocabulary model.
- Resolve common conflicts such as an upright bottle being mistaken for a person.
- Describe the visible scene, count people, answer object questions, and estimate whether a nearby object may be held.
- Draw labeled bounding boxes with confidence scores and adjustable filtering.
- Save captures locally in IndexedDB and optionally narrate descriptions with browser speech synthesis.
- Run the normal detection pipeline on-device without continuously uploading camera frames.
- Show the held-out benchmark directly inside the application.

## Vision pipeline

```text
webcam / uploaded image / demo frame
                 |
                 +-- D-FINE-S Objects365 ------ broad automatic coverage
                 |
                 +-- SceneLens v3 specialist -- high-precision second opinion
                 |
                 +-- OWL-ViT ------------------ custom Find Anything labels
                                      |
                                      v
                         merge + conflict resolution
                                      |
                                      v
                     boxes + scene description + Q&A
```

| Component | Purpose | Runtime |
| --- | --- | --- |
| D-FINE-S Objects365 | Primary automatic detector with broad category coverage | Transformers.js, quantized WASM |
| SceneLens v3 | Fine-tuned YOLO26s specialist for 20 common VOC categories | ONNX Runtime Web, WASM |
| OWL-ViT | Open-vocabulary detection for user-entered labels | Transformers.js, quantized WASM |
| Scene reasoning | Scene summaries, counts, positions, surface and holding estimates | Local TypeScript |
| Optional remote analysis | User-triggered second opinion from a configured vision provider | Server route, disabled by default |

If D-FINE cannot initialize, SceneLens falls back to an in-browser YOLOv8 detector. Failure of the specialist does not prevent the broad detector from working.

## SceneLens v3 benchmark

All three checkpoints were evaluated with the same settings on the untouched 4,952-image Pascal VOC 2007 test set at 640 pixels. The test split was excluded from training and checkpoint selection.

| Model | mAP50 | mAP50-95 | Precision | Recall | GPU inference |
| --- | ---: | ---: | ---: | ---: | ---: |
| Previous SceneLens YOLOv8s fallback | 83.67% | 65.43% | 58.88% | 89.70% | 3.60 ms |
| YOLO26s pretrained starting point | 86.03% | 69.01% | 62.12% | 90.35% | 6.59 ms |
| **SceneLens v3 trained specialist** | **85.22%** | **66.01%** | **76.42%** | **83.98%** | **4.29 ms** |

Compared with the previous app fallback, the trained specialist improves mAP50 by 1.55 points, mAP50-95 by 0.58 points, and precision by 17.54 points, with a 5.72-point recall tradeoff. The pretrained YOLO26s checkpoint retains the highest overall AP and recall. For that reason, SceneLens v3 is used as a high-precision second opinion instead of replacing the broad detector.

The full machine-readable results, including per-class AP, are in [`public/benchmarks/scenelens-v3.json`](public/benchmarks/scenelens-v3.json).

## Local development

Requirements:

- Node.js 22.13 or newer
- npm
- A modern browser with camera support, or an image to upload

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Browser camera access normally requires `localhost` or HTTPS.

The first analysis downloads the runtime models and WebAssembly files. Startup time depends on the network and browser cache. No Python service is required to run the application.

## Optional remote vision

SceneLens works without a paid AI API. Remote analysis is optional and only runs after the user enables it and explicitly asks a question or captures a frame.

Copy `.env.example` to `.env.local` and supply all three values to enable it:

| Variable | Purpose |
| --- | --- |
| `VISION_API_URL` | OpenAI-compatible multimodal chat endpoint |
| `VISION_API_KEY` | Server-only bearer token |
| `VISION_MODEL` | Provider model identifier |

Never commit `.env.local` or real credentials.

## Privacy

- Live camera frames are processed locally during normal detection.
- Uploaded images stay in the browser unless remote analysis is explicitly enabled and requested.
- Capture history is stored in IndexedDB on the current device.
- Learned Find Anything labels are device-local preferences.
- SceneLens does not perform facial recognition or identify people.
- Optional remote requests are explicit, size-limited, rate-limited, and sent through a server-only route.

## Repository layout

```text
app/                         application routes, metadata, and optional API
components/                  camera, analysis, benchmark, and history UI
hooks/                       camera and speech lifecycle
lib/                         detectors, reasoning, tracking, storage, and types
public/models/               SceneLens v3 ONNX chunks and model documentation
public/benchmarks/           held-out benchmark report used by the UI
training/                    reproducible VOC preparation, training, export, and evaluation
tests/                       detector, reasoning, storage, API, and render tests
.openai/hosting.json         required OpenAI Sites project binding
```

The `.openai` directory name is required by OpenAI Sites. It contains the deployment project binding, not API keys, training images, or model weights.

## Training and model export

The specialist used 14,896 development images for training and 1,655 for validation. Training ran for a 13-epoch first stage followed by a 20-epoch lower-learning-rate continuation. The VOC 2007 test set remained untouched until final evaluation.

The selected checkpoint is exported to ONNX and losslessly split into five host-safe files. The browser downloads and reassembles the exact bytes before creating the ONNX Runtime session. Dataset downloads, virtual environments, runs, and large intermediate checkpoints are intentionally ignored by Git.

See [`training/README.md`](training/README.md) for the reproducible commands and evaluation protocol.

## Validation

```bash
npm run lint
npm run test:unit
npm run test:render
npm run build
```

An optional Playwright flow is also available:

```bash
npm run test:e2e
```

## Deployment

The application uses the Sites-compatible Vinext/Vite worker structure and produces Cloudflare Worker-compatible ESM output.

```bash
npm run build
npm run start
```

The current production deployment is [scenelens-vision.mk1l.chatgpt.site](https://scenelens-vision.mk1l.chatgpt.site/). Keep `.openai/hosting.json` in place so future Sites versions update the same application.

## Limitations

- Object detection is probabilistic and can still be wrong, especially with blur, occlusion, low light, unusual viewpoints, or very small objects.
- Open-vocabulary results depend heavily on the wording of the requested labels.
- A spatial holding estimate is not hand-pose tracking and must be treated as uncertain.
- The specialist covers 20 VOC categories; broader coverage comes from D-FINE and OWL-ViT.
- Scene descriptions are generated from detections and simple spatial reasoning, not complete human-level visual understanding.
- SceneLens is not an emergency, medical, safety-certification, or identity system.

## Model sources and attribution

- D-FINE-S Objects365: [`onnx-community/dfine_s_obj365-ONNX`](https://huggingface.co/onnx-community/dfine_s_obj365-ONNX)
- OWL-ViT: [`onnx-community/owlvit-base-patch32-ONNX`](https://huggingface.co/onnx-community/owlvit-base-patch32-ONNX)
- YOLO fallback assets: [`cabelo/yolov8`](https://huggingface.co/cabelo/yolov8)
- SceneLens v3: YOLO26s fine-tuned on Pascal VOC and exported by this repository's training pipeline

Review the upstream model and dataset licenses before redistribution or commercial use.
