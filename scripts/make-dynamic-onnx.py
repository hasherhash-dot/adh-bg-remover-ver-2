#!/usr/bin/env python
"""
Relabel a fixed-shape ONNX export's spatial axes as symbolic.

    py scripts/make-dynamic-onnx.py debug/models/birefnet-lite.onnx \
                                    debug/models/birefnet-lite-dynamic.onnx

This is graph surgery, not a re-export. The weights are untouched — the only
change is that the input and output tensors stop declaring a literal 1024 and
declare a named dimension instead, which lets ONNX Runtime accept other sizes.

That is only legitimate if every intermediate shape is computed from the input
at runtime rather than baked in. inspect-onnx-shapes.py checks for the baked
case; this script additionally runs ONNX's own shape inference afterwards, which
will complain if relabelling has made the graph inconsistent.

Neither check is proof. The proof is running inference at a new resolution and
looking at the mask, which is what validate-dynamic.mjs does.
"""

import sys

import onnx
from onnx import shape_inference


def relabel(tensor, names):
    """Replace the last len(names) dimensions with symbolic parameters."""
    dims = tensor.type.tensor_type.shape.dim
    for offset, name in enumerate(names):
        dim = dims[len(dims) - len(names) + offset]
        dim.ClearField("dim_value")
        dim.dim_param = name


def describe(tensor):
    out = []
    for d in tensor.type.tensor_type.shape.dim:
        out.append(d.dim_param if d.dim_param else d.dim_value)
    return out


def main(src, dst):
    model = onnx.load(src)
    graph = model.graph

    print(f"in  : {graph.input[0].name} {describe(graph.input[0])}")
    print(f"out : {graph.output[0].name} {describe(graph.output[0])}")

    for tensor in graph.input:
        relabel(tensor, ["height", "width"])
    for tensor in graph.output:
        relabel(tensor, ["height", "width"])

    print(f"\nrelabelled ->")
    print(f"in  : {graph.input[0].name} {describe(graph.input[0])}")
    print(f"out : {graph.output[0].name} {describe(graph.output[0])}")

    # Drop stale inferred shapes; they still say 1024 and would contradict the
    # new symbolic dims.
    del graph.value_info[:]

    print("\nrunning shape inference...")
    try:
        inferred = shape_inference.infer_shapes(model, strict_mode=True)
        print("  shape inference passed")
        model = inferred
    except Exception as error:  # noqa: BLE001 - we want the message, whatever it is
        print(f"  shape inference FAILED: {str(error)[:300]}")
        print("  saving anyway; runtime validation will decide")

    onnx.save(model, dst)
    print(f"\nwrote {dst}")
    return 0


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "debug/models/birefnet-lite.onnx"
    dst = sys.argv[2] if len(sys.argv) > 2 else "debug/models/birefnet-lite-dynamic.onnx"
    sys.exit(main(src, dst))
