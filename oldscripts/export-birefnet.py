#!/usr/bin/env python
"""
Re-export BiRefNet_lite to ONNX at chosen resolutions.

    py scripts/export-birefnet.py 512 640 768 1024
    py scripts/export-birefnet.py --dynamic

OFFLINE TOOL ONLY. Nothing here runs in production. It turns pretrained
weights into ONNX files that Node/ONNX Runtime serves. No training, no
fine-tuning, no weight modification — the state dict is loaded and exported
unchanged.

Two things had to be got right, both of which cost an attempt:

1. The TorchScript exporter cannot handle `torchvision::deform_conv2d`, which
   BiRefNet uses in its ASPPDeformable decoder. The dynamo exporter
   (`dynamo=True`, torch.export under the hood) handles it. This is the same
   obstacle the upstream repo's dynamic-export PR describes.

2. One export per resolution, not one dynamic export reused. The published
   fixed ONNX has 552 resolution-locked sites — mostly Swin window-attention
   index tables — so relabelling input axes yields a model that dies at the
   first Split. Those tables are a genuine function of input size, and
   exporting at each size regenerates them correctly.

Weights are written as external data (`<name>.onnx.data`) and must travel with
the .onnx file.

Source:
  weights  https://huggingface.co/ZhengPeng7/BiRefNet_lite (model.safetensors)
  code     birefnet.py from the same repository, one relative import patched
           so it can be imported outside a package
"""

import os
import sys
import time

SRC = os.path.join("debug", "birefnet-src")
OUT = os.path.join("debug", "models")
sys.path.insert(0, SRC)
sys.path.insert(0, os.path.join('scripts'))

import torch  # noqa: E402
from safetensors.torch import load_file  # noqa: E402


class SingleOutput(torch.nn.Module):
    """
    BiRefNet returns a list of deep-supervision maps; only the last is the
    result. Wrapping it means the ONNX has exactly one output, already through
    a sigmoid, so the Node side has nothing to guess about.
    """

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, image):
        out = self.model(image)
        if isinstance(out, (list, tuple)):
            out = out[-1]
        return out.sigmoid()


def build():
    # Swap torchvision's deform_conv2d for the grid_sample equivalent BEFORE
    # the model is constructed. ONNX Runtime has no DeformConv CPU kernel, so
    # an opset-19 export loads and then dies at the first deformable layer.
    # scripts/deform_conv_onnx.verify() checks the substitution against
    # torchvision to 1e-15; it is a restatement, not an approximation.
    import birefnet as birefnet_module  # noqa: PLC0415
    from deform_conv_onnx import deform_conv2d as grid_sample_deform  # noqa: PLC0415

    birefnet_module.deform_conv2d = grid_sample_deform

    from birefnet import BiRefNet  # noqa: PLC0415
    from BiRefNet_config import BiRefNetConfig  # noqa: PLC0415

    model = BiRefNet(BiRefNetConfig(bb_pretrained=False))
    state = load_file(os.path.join(SRC, "model.safetensors"))
    if all(k.startswith("model.") for k in state):
        state = {k[len("model."):]: v for k, v in state.items()}

    result = model.load_state_dict(state, strict=False)
    if result.missing_keys or result.unexpected_keys:
        print(f"  WARNING missing={len(result.missing_keys)} unexpected={len(result.unexpected_keys)}")
    else:
        print("  state dict: all keys matched")

    model.eval()
    wrapped = SingleOutput(model).eval()
    return wrapped


def export_fixed(model, size):
    path = os.path.join(OUT, f"birefnet-lite-{size}.onnx")
    dummy = torch.randn(1, 3, size, size)

    started = time.time()
    torch.onnx.export(
        model,
        (dummy,),
        path,
        input_names=["input_image"],
        output_names=["output_image"],
        opset_version=18,
        dynamo=True,
    )
    elapsed = time.time() - started

    total = os.path.getsize(path)
    data = f"{path}.data"
    if os.path.exists(data):
        total += os.path.getsize(data)
    return path, total / 1048576, elapsed


def export_dynamic(model):
    """
    Attempt a single export with symbolic spatial axes.

    Worth trying because one file beats four. Expect it to be slower per
    inference even if it works — a graph that cannot constant-fold its shapes
    has less room to optimise.
    """
    path = os.path.join(OUT, "birefnet-lite-dyn.onnx")
    dummy = torch.randn(1, 3, 1024, 1024)
    height = torch.export.Dim("height", min=256, max=2048)
    width = torch.export.Dim("width", min=256, max=2048)

    started = time.time()
    torch.onnx.export(
        model,
        (dummy,),
        path,
        input_names=["input_image"],
        output_names=["output_image"],
        opset_version=18,
        dynamo=True,
        dynamic_shapes={"image": {2: height, 3: width}},
    )
    elapsed = time.time() - started
    total = os.path.getsize(path)
    data = f"{path}.data"
    if os.path.exists(data):
        total += os.path.getsize(data)
    return path, total / 1048576, elapsed


def main(argv):
    os.makedirs(OUT, exist_ok=True)
    torch.set_grad_enabled(False)

    print("building model...")
    model = build()

    if "--dynamic" in argv:
        print("\nattempting dynamic-axis export...")
        try:
            path, mb, elapsed = export_dynamic(model)
            print(f"  OK -> {path}  {mb:.1f} MB in {elapsed:.0f}s")
        except Exception as error:  # noqa: BLE001
            print(f"  FAILED: {type(error).__name__}: {str(error)[:400]}")
        return 0

    sizes = [int(a) for a in argv if a.isdigit()] or [512, 640, 768, 1024]
    results = []
    for size in sizes:
        print(f"\n{size}x{size}")
        try:
            path, mb, elapsed = export_fixed(model, size)
            print(f"  OK -> {path}  {mb:.1f} MB in {elapsed:.0f}s")
            results.append((size, mb, "ok"))
        except Exception as error:  # noqa: BLE001
            print(f"  FAILED: {type(error).__name__}: {str(error)[:300]}")
            results.append((size, 0, f"failed: {type(error).__name__}"))

    print("\nsummary")
    for size, mb, status in results:
        print(f"  {size:>5}  {mb:>7.1f} MB  {status}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
