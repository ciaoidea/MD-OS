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

The 21 August B2 snapshot documents bounded critical-reflection routing, cost-aware path selection, evidence-qualified cognitive anchors, controlled multilingual intent equivalence, and the live fail-closed readback. It does not claim universal language understanding, parameter learning, consciousness, AGI, or cross-model superiority.
