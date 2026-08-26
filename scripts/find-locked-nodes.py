#!/usr/bin/env python
"""
Find every node that hardcodes a resolution-derived value.

    py scripts/find-locked-nodes.py debug/models/birefnet-lite.onnx

The first pass of this analysis only looked at initialisers and reported the
graph clean. It was wrong: the blocker turned out to be a `split` attribute on
a Split node, which is stored on the node itself rather than as a named input.

So this pass looks in all three places a constant can hide:

  * initialisers referenced by shape-carrying nodes
  * attributes on any node
  * Constant nodes whose output feeds a shape-carrying node

and reports what would have to change for the graph to run at another size.
"""

import sys
from collections import defaultdict

import onnx
from onnx import numpy_helper

SIDES = [1024, 512, 256, 128, 64, 32, 16]
SUSPECT = set(SIDES + [s * s for s in SIDES])
SHAPE_NODES = {"Reshape", "Resize", "Upsample", "Expand", "Slice", "Tile", "ConstantOfShape", "Split"}


def interesting(values):
    return [v for v in values if isinstance(v, (int, float)) and v > 4 and int(v) in SUSPECT]


def main(path):
    model = onnx.load(path)
    graph = model.graph
    initialisers = {i.name: i for i in graph.initializer}

    # Map Constant node outputs to their values.
    constants = {}
    for node in graph.node:
        if node.op_type != "Constant":
            continue
        for attr in node.attribute:
            if attr.name == "value":
                constants[node.output[0]] = numpy_helper.to_array(attr.t).flatten().tolist()

    findings = defaultdict(list)

    for node in graph.node:
        # 1. attributes on any node
        for attr in node.attribute:
            values = []
            if attr.ints:
                values = list(attr.ints)
            elif attr.i and attr.type == onnx.AttributeProto.INT:
                values = [attr.i]
            hits = interesting(values)
            if hits:
                findings["attribute"].append((node.op_type, node.name or "<unnamed>", attr.name, values))

        if node.op_type not in SHAPE_NODES:
            continue

        for name in node.input:
            # 2. initialisers
            if name in initialisers:
                values = numpy_helper.to_array(initialisers[name]).flatten().tolist()
                if interesting(values):
                    findings["initialiser"].append((node.op_type, node.name or "<unnamed>", name, values[:8]))
            # 3. Constant node outputs
            elif name in constants:
                values = constants[name]
                if interesting(values):
                    findings["constant"].append((node.op_type, node.name or "<unnamed>", name, values[:8]))

    total = sum(len(v) for v in findings.values())
    print(f"model: {path}")
    print(f"resolution-locked sites: {total}\n")

    for kind in ("attribute", "initialiser", "constant"):
        rows = findings[kind]
        if not rows:
            continue
        print(f"  {kind} ({len(rows)}):")
        by_op = defaultdict(int)
        for op, _, _, _ in rows:
            by_op[op] += 1
        print(f"    by op: {dict(by_op)}")
        for op, node_name, key, values in rows[:12]:
            shown = values if len(values) <= 8 else values[:8] + ["..."]
            print(f"      {op:16} {node_name[:40]:42} {key:14} {shown}")
        if len(rows) > 12:
            print(f"      ... and {len(rows) - 12} more")
        print()

    if total:
        print("  => the graph cannot be made resolution-agnostic by relabelling alone.")
        print("     Each of these sites encodes a size derived from 1024.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "debug/models/birefnet-lite.onnx"))
