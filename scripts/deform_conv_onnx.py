"""
An ONNX-exportable replacement for torchvision.ops.deform_conv2d.

ONNX Runtime's CPU provider has no DeformConv kernel — an opset-19 export
loads and then fails with "Could not find an implementation for DeformConv(19)".
So the operator has to be expressed in terms of ops that do exist. Bilinear
sampling at arbitrary coordinates is exactly what grid_sample does, and
grid_sample maps onto GridSample, which ORT implements.

This is a mathematical restatement of the same operation, not an
approximation, and not a change to the model. The weights are untouched.
`verify()` checks it against torchvision to a tight tolerance; if that check
ever fails, nothing exported with this is trustworthy.

Modulated (v2) deformable convolution, single deformable group, which is what
BiRefNet's ASPPDeformable uses:

    y(p) = sum_k  w_k . x(p + p_k + dp_k) . dm_k
"""

import torch
import torch.nn.functional as F


def _pair(value):
    if isinstance(value, (tuple, list)):
        return int(value[0]), int(value[1])
    return int(value), int(value)


def deform_conv2d(
    input,
    offset,
    weight,
    bias=None,
    stride=1,
    padding=0,
    dilation=1,
    mask=None,
):
    """Drop-in replacement matching torchvision's signature."""
    n, channels, height, width = input.shape
    out_channels, in_per_group, kh, kw = weight.shape
    if in_per_group != channels:
        raise NotImplementedError("grouped deformable convolution is not supported here")

    stride_h, stride_w = _pair(stride)
    pad_h, pad_w = _pair(padding)
    dil_h, dil_w = _pair(dilation)

    taps = kh * kw
    out_h = offset.shape[2]
    out_w = offset.shape[3]

    if offset.shape[1] != 2 * taps:
        raise ValueError(f"offset has {offset.shape[1]} channels, expected {2 * taps}")

    device = input.device
    dtype = input.dtype

    # Where each output pixel reads from, before the learned offset.
    origin_y = torch.arange(out_h, device=device, dtype=dtype) * stride_h - pad_h
    origin_x = torch.arange(out_w, device=device, dtype=dtype) * stride_w - pad_w

    # Kernel tap displacements, flattened in (row, col) order so they line up
    # with weight.view(out_channels, channels * taps).
    tap_y = (torch.arange(kh, device=device, dtype=dtype) * dil_h).view(kh, 1).expand(kh, kw).reshape(taps)
    tap_x = (torch.arange(kw, device=device, dtype=dtype) * dil_w).view(1, kw).expand(kh, kw).reshape(taps)

    # torchvision packs the offset as (y, x) per tap.
    offset = offset.view(n, taps, 2, out_h, out_w)
    offset_y = offset[:, :, 0]
    offset_x = offset[:, :, 1]

    sample_y = origin_y.view(1, 1, out_h, 1) + tap_y.view(1, taps, 1, 1) + offset_y
    sample_x = origin_x.view(1, 1, 1, out_w) + tap_x.view(1, taps, 1, 1) + offset_x

    # grid_sample with align_corners=True expects -1..1 mapped onto pixel
    # centres 0..size-1, which is the convention torchvision's bilinear
    # interpolation uses. Outside that range it reads zero, matching
    # deform_conv2d's implicit zero padding.
    norm_y = 2.0 * sample_y / max(height - 1, 1) - 1.0
    norm_x = 2.0 * sample_x / max(width - 1, 1) - 1.0

    grid = torch.stack((norm_x, norm_y), dim=-1)  # (n, taps, out_h, out_w, 2)
    grid = grid.reshape(n, taps * out_h, out_w, 2)

    sampled = F.grid_sample(
        input,
        grid,
        mode="bilinear",
        padding_mode="zeros",
        align_corners=True,
    )  # (n, channels, taps * out_h, out_w)

    sampled = sampled.view(n, channels, taps, out_h, out_w)

    if mask is not None:
        sampled = sampled * mask.view(n, 1, taps, out_h, out_w)

    # The convolution itself is now a 1x1 over the gathered taps.
    sampled = sampled.reshape(n, channels * taps, out_h, out_w)
    flat_weight = weight.reshape(out_channels, channels * taps, 1, 1)
    return F.conv2d(sampled, flat_weight, bias)


def verify(seed=0, tolerance=2e-4):
    """
    Check against torchvision across the shapes BiRefNet actually uses.

    Returns the largest absolute difference seen. Anything above `tolerance`
    means the replacement is not equivalent and must not be used.
    """
    from torchvision.ops import deform_conv2d as reference

    torch.manual_seed(seed)
    worst = 0.0
    cases = [
        # (batch, in_ch, out_ch, height, width, kernel, stride, padding, dilation)
        (1, 8, 16, 17, 19, 3, 1, 1, 1),
        (1, 16, 8, 32, 32, 3, 1, 1, 1),
        (2, 4, 4, 15, 15, 3, 1, 1, 1),
        (1, 8, 8, 16, 16, 1, 1, 0, 1),
        (1, 8, 8, 24, 24, 3, 2, 1, 1),
    ]

    for batch, cin, cout, h, w, k, stride, pad, dil in cases:
        x = torch.randn(batch, cin, h, w, dtype=torch.float64)
        weight = torch.randn(cout, cin, k, k, dtype=torch.float64)
        bias = torch.randn(cout, dtype=torch.float64)

        out_h = (h + 2 * pad - dil * (k - 1) - 1) // stride + 1
        out_w = (w + 2 * pad - dil * (k - 1) - 1) // stride + 1

        offset = torch.randn(batch, 2 * k * k, out_h, out_w, dtype=torch.float64) * 1.5
        mask = 2.0 * torch.sigmoid(torch.randn(batch, k * k, out_h, out_w, dtype=torch.float64))

        expected = reference(x, offset, weight, bias, stride=stride, padding=pad, dilation=dil, mask=mask)
        actual = deform_conv2d(x, offset, weight, bias, stride=stride, padding=pad, dilation=dil, mask=mask)

        if expected.shape != actual.shape:
            raise AssertionError(f"shape mismatch {expected.shape} vs {actual.shape}")

        diff = (expected - actual).abs().max().item()
        scale = expected.abs().max().item()
        relative = diff / scale if scale else diff
        worst = max(worst, relative)
        flag = "ok" if relative <= tolerance else "MISMATCH"
        print(
            f"  {batch}x{cin}->{cout} {h}x{w} k={k} s={stride} p={pad} d={dil}: "
            f"rel {relative:.2e}  {flag}"
        )

    return worst


if __name__ == "__main__":
    import sys

    print("verifying grid_sample deformable conv against torchvision\n")
    worst = verify()
    print(f"\nworst relative difference: {worst:.3e}")
    sys.exit(0 if worst <= 2e-4 else 1)
