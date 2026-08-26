# Model weights

The ADH engine loads `birefnet-lite-640.onnx` from this directory. The weights
are **not committed** — 178 MB per resolution — so a fresh clone has to build
them once.

```
models/
  birefnet-lite-640.onnx        4.8 MB   graph
  birefnet-lite-640.onnx.data 173.0 MB   weights, must sit beside the .onnx
```

Both files are required. ONNX Runtime resolves the external data file by name
relative to the `.onnx`, so they cannot be separated or renamed independently.

## Building them

One-off, offline, on a machine with Python. Nothing here runs in production —
the production inference path is Node plus ONNX Runtime.

```bash
py -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
py -m pip install onnx onnxscript safetensors timm einops kornia transformers
```

Fetch the upstream weights and model code into `debug/birefnet-src/`
(`model.safetensors`, `birefnet.py`, `BiRefNet_config.py` from
<https://huggingface.co/ZhengPeng7/BiRefNet_lite>), change `birefnet.py`'s one
relative import to an absolute one, then:

```bash
py scripts/export-birefnet.py 640
py scripts/downgrade-ir.py debug/models/birefnet-lite-640.onnx
```

Copy `birefnet-lite-640.onnx` and `birefnet-lite-640.onnx.data` here.

## Two things the export has to get right

**`deform_conv2d` must be replaced.** BiRefNet's ASPPDeformable decoder uses
torchvision's deformable convolution. ONNX Runtime has no `DeformConv` CPU
kernel, so an opset-19 export loads and then fails at the first deformable
layer. `scripts/deform_conv_onnx.py` expresses the same operation via
`grid_sample` and verifies it against torchvision to 1.9e-15 — a restatement,
not an approximation. `scripts/export-birefnet.py` substitutes it before the
model is constructed.

**The IR version must be lowered.** torch emits IR version 10; the
`onnxruntime-node` we ship accepts at most 9. IR 9 already covers opset 18, so
nothing in the graph needs 10 — `scripts/downgrade-ir.py` edits only the
version field.

## Verifying a rebuild

```bash
node scripts/validate-exports.mjs
```

Checks output geometry, that the mask is not degenerate, and agreement against
the reference export. A correct 640 build scores **0.9972 IoU** against
BiRefNet at 1024. A model that loads and returns a correctly-shaped tensor has
proved nothing; agreement is the test that matters.

## Why 640 and not 512 or 1024

Measured across the 20-image benchmark set. 640 was the only resolution with no
major failure. Below it the model loses low-contrast subjects entirely — the
green sideboard came back as a completely empty mask at 512. Above it the model
resolves reflections well enough to treat mirror glass as background and cuts it
out, leaving a hollow frame at both 768 and 1024.

Known limitation at 640, left in place: decorative objects resting on furniture
(pampas grass, a leaning picture frame) are sometimes dropped. It is in the
benchmark set as a regression case rather than tuned away.

## Licensing

See [`../docs/MODEL-LICENSING.md`](../docs/MODEL-LICENSING.md). The commercial
position of these weights is **not settled** — the upstream repository carries
an MIT badge in its README but declares no licence in its model metadata.
