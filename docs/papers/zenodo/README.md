# MD-OS CORTEX — definitive paper

Files:

- `paper.tex` — editable LaTeX manuscript.
- `references.bib` — bibliography database.
- `figures/` — publication figures used by the manuscript.
- `paper.pdf` — the single definitive compiled manuscript.
- `REVISION_NOTES.md` — editorial and structural changes.
- `SHA256SUMS` — file-integrity manifest.
- `MD-OS_CORTEX_Zenodo.zip` — upload-ready source, figures, bibliography, and definitive PDF.

## Build

Standard TeX installation:

```bash
pdflatex paper.tex
bibtex paper
pdflatex paper.tex
pdflatex paper.tex
```

Or:

```bash
latexmk -pdf paper.tex
```

The manuscript uses only conventional TeX Live packages and embedded PNG figures.

The 22 August corrected B2 snapshot documents bounded critical-reflection routing from semantic intent and expected--observed event mismatch, cost-aware path selection, evidence-qualified cognitive anchors, controlled multilingual intent equivalence, fail-closed readback, and a non-overriding turn contract in which the current human request remains the target while explicit goals remain persistent context. It also records the principle-first, Einstein-inspired thought-experiment discipline and its regression boundary: the method may generate or criticize a hypothesis, but external observation, calculation, formal proof, or experiment remains necessary for closure. The aligned frame-sensitive branch exposes the hidden frame, declares source and target domains plus an admissible transformation and its preserved structure, tracks surviving invariants, and seeks the smallest general representation. It is documented as an Einstein-inspired methodological lineage and an MD-OS/APFC operational synthesis, not as an exact algorithm published by Einstein. The local distribution candidate was reverified on 23 August 2026 with 243/243 Node tests and 58/58 shell-parity tests; runtime, compiler, APFC, semantic-integrity, publication, and security readbacks were `ok`; `runtime_operable` and `publishable` were `true`; `release_blocked` was `false`; and two consecutive replay passes reached the same fixed point. Overall health remained `attention` because exploratory AGI evidence and local-hygiene findings remained visible but non-blocking. The stable-distribution gate keeps those exploratory findings non-promotable while still blocking critical states, regressions, and failed checks explicitly marked `release_required: true`. This is local candidate readback, not evidence that the external Zenodo record has already been updated. MD-OS/APFC is explicitly designed for persistent, verification-bound operational learning in the real world, where situations may be novel, observations incomplete, outcomes uncertain, and actions consequential. The present evidence validates the architecture and its bounded controlled mechanisms; the next empirical step is independent, longitudinal evaluation of the complete learning cycle under real-world open conditions.
