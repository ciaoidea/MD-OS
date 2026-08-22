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

The 22 August corrected B2 snapshot documents bounded critical-reflection routing from semantic intent and expected--observed event mismatch, cost-aware path selection, evidence-qualified cognitive anchors, controlled multilingual intent equivalence, fail-closed readback, and a non-overriding turn contract in which the current human request remains the target while explicit goals remain persistent context. It does not claim universal language understanding, parameter learning, consciousness, AGI, or cross-model superiority.
