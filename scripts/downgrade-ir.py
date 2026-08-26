#!/usr/bin/env python
"""
Lower an ONNX model's IR version so an older ONNX Runtime will load it.

    py scripts/downgrade-ir.py debug/models/birefnet-lite-512.onnx

torch 2.13 emits IR version 10; the onnxruntime-node we ship accepts at most 9.
IR 9 already covers opset 18, so nothing in these graphs needs IR 10 — the
version field is simply newer than the runtime expects.

This edits only the version field. It does not touch the graph or the weights,
and external data references are left alone. If a model genuinely relied on an
IR-10 feature it would fail at load or produce wrong output, which is why
validate-exports.mjs checks agreement against a reference rather than trusting
the load to succeed.

The alternative is upgrading onnxruntime-node, which is a transitive dependency
of the IMG.LY package currently serving production. Not worth destabilising
that for a benchmark.
"""
import sys
import onnx

TARGET_IR = 9

for path in sys.argv[1:]:
    model = onnx.load(path, load_external_data=False)
    before = model.ir_version
    if before <= TARGET_IR:
        print(f"{path}: ir={before}, no change")
        continue
    model.ir_version = TARGET_IR
    onnx.save(model, path, save_as_external_data=False)
    print(f"{path}: ir {before} -> {model.ir_version}")
