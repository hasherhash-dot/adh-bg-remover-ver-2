# Model licensing record

Factual record of what each candidate's own repository and distribution page
states about licensing. Verified **26 August 2026**.

**This is not legal advice and contains no guarantees.** It records what the
sources say, including where they say nothing. Anything marked *unstated* is a
gap that a lawyer should close before that model ships in a paid product.

## The distinction that matters

A permissive licence on a GitHub repository covers the **code**. It does not
automatically cover the **weights**, and it never covers the **dataset** the
weights were trained on. All three have to be checked separately.

Almost every open segmentation model shares the same shape of problem: the code
is permissive, the weights are silent, and the training data is academic. That
is worth understanding before treating any of the options below as clean.

## Currently in production

### IMG.LY background-removal-node (ISNet)

| | |
|---|---|
| Package | `@imgly/background-removal-node` 1.4.5 |
| Source | https://github.com/imgly/background-removal-js |
| Code licence | **AGPL-3.0** — `node_modules/@imgly/background-removal-node/LICENSE.md` |
| Weight licence | Distributed by IMG.LY under their own terms; not separately stated |
| Model | ISNet derivative, `/models/small` 42.3 MB or `/models/medium` 84.1 MB |
| Commercial status | **Requires attention.** AGPL §13 obliges anyone who interacts with the software over a network to be offered the corresponding source. A commercial licence is available — the repository directs questions to support@img.ly |
| Attribution | Per AGPL-3.0 |
| Uncertainty | Whether IMG.LY treats the bundled weights as covered by the AGPL or by separate terms |

This is the reason the engine work exists. It is a licensing problem, not a
quality problem.

## Candidates

### BiRefNet — current candidate

| | |
|---|---|
| Version | BiRefNet_lite |
| Code source | https://github.com/ZhengPeng7/BiRefNet |
| Weight source | https://huggingface.co/ZhengPeng7/BiRefNet_lite (`model.safetensors`, 169.4 MB) |
| Prior ONNX source | https://huggingface.co/onnx-community/BiRefNet_lite-ONNX (`onnx/model.onnx`) |
| Code licence | **MIT** |
| Weight licence | **See the discrepancy below** |
| Size | our re-exports 177–180 MB each (weights in `<name>.onnx.data`) |
| Training data | DIS5K, HRSOD, UHRSD, COD10K and others, each with its own terms |
| Attribution | MIT notice |

**A discrepancy worth recording.** Three sources, three different strengths of
claim about the same weights:

| Source | What it declares |
|---|---|
| `ZhengPeng7/BiRefNet_lite` — the actual weights we use | **No `license` field** in the model card metadata |
| Same repo's README | An MIT badge linking to a `LICENSE` file |
| `onnx-community/BiRefNet_lite-ONNX` — a third-party re-export | `license: mit` in the card metadata |

So the strongest machine-readable MIT claim sits on a **re-export by someone
other than the author**, while the author's own weights repo declares nothing in
its metadata and asserts MIT only through a README badge.

This is still the clearest position of any candidate — an author-authored MIT
badge beats silence, and beats AGPL or CC-BY-NC outright. It is not the same
thing as an explicit weight licence, and it should not be reported as one.

**What to resolve before production:** whether the MIT badge in the BiRefNet
README is intended to cover the published weights as well as the code. That is
a question for the author or for counsel, and it is the single remaining
licensing gap on the recommended path.

### IS-Net (isnet-general-use)

| | |
|---|---|
| Version | `isnet-general-use.onnx` |
| Code source | https://github.com/xuebinqin/DIS |
| Weight source | https://github.com/danielgatis/rembg releases (rembg itself is MIT) |
| Code licence | **Apache-2.0** — repository states code and evaluation metric |
| Weight licence | **Unstated.** The DIS repository gives no licence for `isnet.pth` / `isnet-general-use.pth` |
| Size | 170.4 MB |
| Training data | DIS5K, governed by a separate `DIS5K-Dataset-Terms-of-Use.pdf` |
| Commercial status | **Unclear.** Apache-2.0 code does not extend to silent weights |
| Attribution | Apache-2.0 notice for code |
| Uncertainty | High, and it is the specific gap to close if this becomes the candidate — the DIS5K terms document needs reading and the authors may need contacting |

Same architecture family as what we run today, so quality should be comparable
without the AGPL wrapper. The licensing question is real, though.

### U²-Net (u2net, u2netp)

| | |
|---|---|
| Version | `u2net.onnx`, `u2netp.onnx` |
| Code source | https://github.com/xuebinqin/U-2-Net |
| Weight source | https://github.com/danielgatis/rembg releases |
| Code licence | **Apache-2.0** |
| Weight licence | **Unstated** |
| Size | 167.8 MB / 4.4 MB |
| Training data | DUTS-TR |
| Commercial status | Unclear, same gap as IS-Net |
| Attribution | Apache-2.0 notice for code |
| Uncertainty | `u2net_portrait` specifically was trained on APDrawingGAN data and should be avoided — do not use that variant. The general `u2net` and `u2netp` are separate |

### BRIA RMBG — rejected

| | |
|---|---|
| Version | RMBG-1.4, RMBG-2.0 |
| Source | https://huggingface.co/briaai/RMBG-2.0, https://huggingface.co/briaai/RMBG-1.4 |
| Weight licence | **CC BY-NC 4.0** — non-commercial |
| Commercial status | **Blocked.** Requires a paid agreement with BRIA |

Not evaluated further. rembg's own README flags this one specifically: model
weights carry their own licences independent of rembg's MIT licence, and this is
the one it warns about.

## Where the weights came from

Everything downloaded during evaluation lives in `debug/models/`, which is
gitignored. Exact URLs:

```
birefnet-lite.onnx        https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx
isnet-general-use.onnx    https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx
u2net.onnx                https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx
u2netp.onnx               https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
```

## Summary

| Model | Code | Weights | Commercial | Verdict |
|---|---|---|---|---|
| IMG.LY ISNet | AGPL-3.0 | IMG.LY terms | needs a commercial licence | current, must be resolved |
| BiRefNet | MIT | **MIT** | clearest of the candidates | strongest on licence |
| IS-Net | Apache-2.0 | unstated | unclear | needs the DIS5K terms read |
| U²-Net | Apache-2.0 | unstated | unclear | needs review |
| BRIA RMBG | — | CC BY-NC | no | rejected |
