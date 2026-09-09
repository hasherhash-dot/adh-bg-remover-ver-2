#!/usr/bin/env python
"""
Look for spatial constants baked into a fixed-shape ONNX export.

    py scripts/inspect-onnx-shapes.py debug/models/birefnet-lite.onnx

The question this answers: can this graph be made resolution-agnostic by
relabelling its input dimensions, or does it contain nodes that hardcode
1024-derived sizes and would therefore break at any other resolution?

Relabelling the input is trivial. It is also worthless if a Reshape somewhere
carries a literal 65536, because ONNX Runtime will either error or, worse,
silently produce a mask with the wrong geometry. So we go looking for the
literals first.
"""

import sys
from collections import Counter

import onnx
from onnx import numpy_helper

# 1024 and everything it reduces to through the usual stride-2 stack, plus the
# flattened areas those imply. A literal from this set inside a shape-carrying
# node is what makes an export resolution-locked.
SIDES = [1024, 512, 256, 128, 64, 32, 16, 8]
AREAS = [s * s for s in SIDES]
SUSPECT = set(SIDES + AREAS)

# Nodes whose inputs describe geometry rather than data.
SHAPE_NODES = {"Reshape", "Resize", "Upsample", "Expand", "Slice", "Tile", "ConstantOfShape"}


def main(path):
    model = onnx.load(path)
    graph = model.graph

    print(f"model      : {path}")
    print(f"ir/opset   : ir={model.ir_version} opset={[(o.domain or 'ai.onnx', o.version) for o in model.opset_import]}")

    for tensor in list(graph.input) + list(graph.output):
        dims = []
        for d in tensor.type.tensor_type.shape.dim:
            dims.append(d.dim_param if d.dim_param else d.dim_value)
        kind = "input " if tensor in graph.input else "output"
        print(f"{kind}     : {tensor.name} {dims}")

    initialisers = {i.name: i for i in graph.initializer}
    node_kinds = Counter(n.op_type for n in graph.node)
    print(f"\nnodes      : {len(graph.node)} total")
    print(f"             {dict(node_kinds.most_common(12))}")

    # Any op that is not in the standard domain will not run on the stock CPU
    # execution provider.
    custom = {n.op_type for n in graph.node if n.domain not in ("", "ai.onnx")}
    if custom:
        print(f"custom ops : {custom}")

    print("\nscanning shape-carrying nodes for baked-in spatial literals...\n")
    offenders = []
    for node in graph.node:
        if node.op_type not in SHAPE_NODES:
            continue
        for name in node.input:
            init = initialisers.get(name)
            if init is None:
                continue
            values = numpy_helper.to_array(init).flatten().tolist()
            hits = [v for v in values if isinstance(v, (int, float)) and int(v) in SUSPECT and v > 4]
            if hits:
                offenders.append((node.op_type, node.name or "<unnamed>", name, values[:8]))

    if not offenders:
        print("  none found.")
        print("\n  => every shape-carrying node takes its sizes from the graph at")
        print("     runtime. Relabelling the input dims has a real chance of working.")
    else:
        print(f"  {len(offenders)} node(s) carry constant spatial values:\n")
        for op, node_name, input_name, values in offenders[:25]:
            print(f"    {op:18} {node_name[:38]:40} {input_name[:26]:28} {values}")
        if len(offenders) > 25:
            print(f"    ... and {len(offenders) - 25} more")
        print("\n  => these would keep producing 1024-derived geometry at any input")
        print("     size. Graph surgery alone will not make this dynamic.")

    return 0 if not offenders else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "debug/models/birefnet-lite.onnx"))
