# SceneLens model assets

SceneLens combines runtime-downloaded broad detectors with a repository-hosted specialist model.

## SceneLens v3 specialist

The trained YOLO26s specialist is exported to ONNX for ONNX Runtime Web. The exact 38,197,559-byte model is losslessly divided into five files because the source and deployment hosts impose per-file or per-request limits:

- `scenelens-v3-voc.onnx.part-01`
- `scenelens-v3-voc.onnx.part-02`
- `scenelens-v3-voc.onnx.part-03`
- `scenelens-v3-voc.onnx.part-04`
- `scenelens-v3-voc.onnx.part-05`

`scenelens-v3-voc.onnx.part.manifest.json` records the ordered parts, sizes, and SHA-256 checksum. The browser downloads the parts, concatenates their bytes in order, and passes the reconstructed model directly to ONNX Runtime Web. Splitting does not quantize or otherwise change the trained weights.

The specialist recognizes these 20 Pascal VOC categories:

`airplane`, `bicycle`, `bird`, `boat`, `bottle`, `bus`, `car`, `cat`, `chair`, `cow`, `dining table`, `dog`, `horse`, `motorcycle`, `person`, `potted plant`, `sheep`, `couch`, `train`, and `tv`.

It is used as a high-precision second opinion beside the broad detector, not as the application's only model.

## Runtime-downloaded models

- D-FINE-S Objects365 (`onnx-community/dfine_s_obj365-ONNX`) is the primary broad automatic detector.
- OWL-ViT (`onnx-community/owlvit-base-patch32-ONNX`) powers Find Anything for user-supplied labels.
- YOLOv8s and YOLOv8n from `cabelo/yolov8` provide the accuracy and fast fallback paths if D-FINE cannot initialize.

These downloads contain model files only. Camera frames and uploaded images are processed locally and are not sent with model-download requests.

See [`../../training/README.md`](../../training/README.md) for training, evaluation, export, and model-splitting instructions. Review all upstream model and dataset licenses before redistribution or commercial use.
