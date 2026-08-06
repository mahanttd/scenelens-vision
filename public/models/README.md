# YOLO model asset

SceneLens fetches `yolov8n.onnx`, a pretrained YOLOv8 nano model exported to ONNX and trained on the 80-class COCO dataset, directly from the attributed model repository. SceneLens runs it in the browser with ONNX Runtime Web; camera and image pixels are not sent with that model request.

Source: https://huggingface.co/cabelo/yolov8/blob/main/yolov8n.onnx

The model repository identifies its license as CreativeML Open RAIL-M. Review the model and upstream Ultralytics licensing before commercial redistribution.
