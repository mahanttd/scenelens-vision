# SceneLens specialist training

SceneLens v3 combines its broad Objects365 and open-vocabulary detectors with a
custom YOLO26s specialist fine-tuned on Pascal VOC. The VOC 2007 test set is
never used for training and is the common held-out benchmark for both the
pretrained baseline and the fine-tuned model.

The reproducible workflow is:

1. `prepare_voc.py` downloads and converts VOC 2007/2012.
2. `benchmark_voc.py` evaluates the untouched COCO-pretrained model on VOC 2007
   test by mapping predictions by class name.
3. `train_voc.py` makes a deterministic 90/10 development split, fine-tuning
   on 14,896 images and validating on 1,655 images for model selection. The
   completed run used a 13-epoch first stage followed by a 20-epoch,
   lower-learning-rate continuation.
4. `benchmark_voc.py` evaluates the validation-selected checkpoint once on the
   same 4,952 held-out images.
5. `compare_benchmarks.py` produces the public before/after report.
6. `export_model.py` creates the browser-ready ONNX specialist, and
   `split_model.py` losslessly divides the exact model bytes into host-safe
   chunks that the browser reassembles before inference.

Example commands from the repository root:

```powershell
$env:YOLO_CONFIG_DIR = (Resolve-Path '.\training\cache').Path
.\.venv-training\Scripts\python.exe training\prepare_voc.py
.\.venv-training\Scripts\python.exe training\benchmark_voc.py --model yolo26s.pt --label "YOLO26s COCO pretrained" --output training\benchmarks\baseline-yolo26s-coco.json
.\.venv-training\Scripts\python.exe training\train_voc.py --epochs 50 --batch 8
.\.venv-training\Scripts\python.exe training\train_voc.py --model training\runs\scenelens-yolo26s-voc\weights\last.pt --epochs 20 --batch 8 --name scenelens-yolo26s-voc-stage2 --lr0 0.003 --warmup-epochs 0 --warmup-bias-lr 0.003 --patience 8
.\.venv-training\Scripts\python.exe training\benchmark_voc.py --model training\runs\scenelens-yolo26s-voc-stage2\weights\best.pt --label "SceneLens v3" --output training\benchmarks\scenelens-v3-voc.json
.\.venv-training\Scripts\python.exe training\export_model.py --model training\runs\scenelens-yolo26s-voc-stage2\weights\best.pt
.\.venv-training\Scripts\python.exe training\split_model.py --model public\models\scenelens-v3-voc.onnx --output-prefix public\models\scenelens-v3-voc.onnx.part
```

The ignored `training/data` and `training/runs` directories hold the downloaded
dataset and large training checkpoints. Final benchmark JSON and the exported
web model are retained with the application.
