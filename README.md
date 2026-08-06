# SceneLens

SceneLens is a privacy-first, real-time AI camera assistant for everyday scenes. It runs a pretrained YOLOv8n object detector in the browser, draws labeled bounding boxes, answers grounded questions about the current frame, estimates which nearby object a person may be holding, and narrates results.

The base application does not require a paid AI service. Camera frames and uploaded images remain in the browser for on-device inference. Optional remote vision verification occurs only after the user enables it and explicitly asks a question or captures a frame.

## Features

- Live camera access with start, stop, front/rear switching, capture, permission errors, and image upload fallback
- On-device YOLOv8n detection through ONNX Runtime Web with throttled inference, confidence filtering, bounding boxes, confidence scores, and timing telemetry
- Cautious person–object holding estimates based on an approximate hand region, object proximity, overlap, scale, and detector confidence
- Scene description, person holding, table contents, visible people count, and custom questions
- Browser speech synthesis with opt-in speech, replay, stop, and rate-limited automatic narration
- Browser-local IndexedDB capture history with individual deletion, clear-all, and a 40-record cap
- Explicit-only, server-side remote vision integration with MIME checks, size validation, rate limiting, timeouts, and guarded error messages
- Simulated detection scene for development or camera-free exploration
- Responsive keyboard-accessible dark HUD interface with reduced-motion support

SceneLens never performs facial recognition and never identifies individuals.

## Architecture

```text
Camera / uploaded image
        │
        ├── Browser YOLOv8n + ONNX Runtime Web ──> detections + overlay
        │                                             │
        │                                             ├── local scene reasoning
        │                                             ├── holding estimate
        │                                             └── speech synthesis
        │
        ├── explicit capture ──> IndexedDB history on this device
        │
        └── explicit question/capture + remote toggle
                    └── /api/analyze ──> optional server-only vision provider
```

Key modules:

- `hooks/use-camera.ts`: media permission, stream lifecycle, and camera switching
- `lib/yolo.ts`: model loading, letterbox preprocessing, YOLO output parsing, and non-maximum suppression
- `lib/reasoning.ts`: confidence filtering, descriptions, custom questions, and spatial holding estimates
- `hooks/use-speech.ts`: speech synthesis and replay controls
- `lib/history-store.ts`: IndexedDB persistence and a memory adapter used by tests
- `app/api/analyze/route.ts`: optional remote provider boundary and server-side safeguards
- `components/`: camera viewport, analysis controls, status display, and capture history

No Python service is required because YOLO inference runs in the browser. The app remains compatible with a future FastAPI detector if server-side GPU inference becomes necessary.

## Installation

Requirements: Node.js 22.13 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Camera access normally requires `localhost` or HTTPS. If no camera is available, upload a JPEG, PNG, or WebP image or select **Demo scene**.

## Environment variables

Copy `.env.example` to `.env.local` only when remote vision verification is needed:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VISION_API_URL` | Optional | Server-side endpoint for an OpenAI-compatible multimodal chat API |
| `VISION_API_KEY` | Optional | Secret bearer token used only by the server route |
| `VISION_MODEL` | Optional | Provider model identifier |

All three variables must be present for remote verification. They are never exposed in browser code. Do not commit `.env.local` or any real credential.

## How the AI components work

The browser loads `public/models/yolov8n.onnx` once and uses ONNX Runtime Web’s WebAssembly execution provider. The version-pinned WebAssembly runtime is fetched from jsDelivr on first use, while all inference and image processing stay on the device. Each video frame is resized and letterboxed to 640×640, converted to a normalized channel-first tensor, and processed locally. SceneLens reads the 80 COCO class scores, filters detections, maps coordinates back to the displayed source, and applies class-aware non-maximum suppression. Live inference is throttled to roughly one pass every 700 ms and never sends continuous frames to a server.

YOLOv8n recognizes common COCO objects. It does not understand every item, activity, relationship, or subtle visual detail. Rule-based descriptions report only supported detections and explicitly state uncertainty.

When remote verification is enabled, an explicit analysis action captures a resized JPEG (maximum 960 px on its longest side) and sends it to the server route. The route accepts JPEG, PNG, and WebP data URLs up to 5 MB, limits each client to eight requests per minute, applies a 15-second provider timeout, and instructs the provider to avoid identity claims and certified safety conclusions.

## How “person holding object” is estimated

For every detected person, SceneLens approximates left and right hand regions at the outer mid-torso. Candidate objects must be reasonably small and near the person’s interaction zone. A score combines:

- distance from the candidate object’s center to the nearest estimated hand point;
- overlap with the person bounding box;
- object detection confidence; and
- whether the object has a plausible size for holding.

Large non-holdable classes such as vehicles, beds, couches, and tables are excluded. Low scores produce no holding claim. Successful results use “possibly” and display an estimated confidence. This is spatial inference—not hand-pose tracking—and can be wrong when people overlap, hands are hidden, or the camera angle is unusual.

## Privacy and safety limitations

- Live frames remain on the device. SceneLens does not continuously upload video.
- Uploads also remain local unless remote verification is both enabled and explicitly requested.
- Captures are stored in browser IndexedDB on the current device; deleting browser storage removes them.
- SceneLens has no facial-recognition or person-identification feature.
- Model detections can be biased, incomplete, or incorrect. Low light, occlusion, blur, distance, and unfamiliar objects reduce accuracy.
- General-purpose object detection cannot establish intent, verify identity, or reliably interpret subtle conditions that fall outside its training classes.

## Testing

```bash
npm run lint
npm run test:unit
npm run test:render
npm run test:e2e
```

Unit coverage includes holding logic, confidence boundaries, local history behavior, input validation, and remote API errors. The render test verifies the deployed worker output. The Playwright end-to-end test opens the application, uploads a generated PNG test image, and requests a local scene description without camera access.

The first Playwright run may require:

```bash
npx playwright install chromium
```

## Build and deployment

```bash
npm run build
npm run start
```

The project uses the Sites-compatible Vinext/Vite worker structure and produces Cloudflare Worker-compatible ESM output. For Sites hosting, configure optional environment values as hosted secrets, save a version from the pushed source commit, and deploy that saved version. Leave the environment unset for an on-device-only deployment.

Camera access requires HTTPS on a deployed domain. Keep the 12.8 MB ONNX model cacheable for faster repeat visits. The first on-device analysis also needs network access to fetch the version-pinned WebAssembly runtime; subsequent behavior depends on the browser cache.

## Future improvements

- Add a dedicated hand-pose model and temporal tracking to improve holding estimates
- Add opt-in specialist models for domains that need object classes beyond the general COCO set
- Move inference to a Web Worker and enable WebGPU when browser support is dependable
- Add model integrity verification and managed model-version updates
- Add encrypted export/import for local history
- Add offline application caching after the first model download
- Support an optional FastAPI/GPU inference service for constrained enterprise deployments

## Model attribution

The included YOLOv8n ONNX asset is sourced from the [cabelo/yolov8 model repository](https://huggingface.co/cabelo/yolov8/blob/main/yolov8n.onnx), which identifies the model license as CreativeML Open RAIL-M. Review both the model repository and upstream Ultralytics licensing before commercial redistribution.
