# MD-OS CORTEX — clarity revision

Files:

- `paper.tex` — editable LaTeX manuscript.
- `references.bib` — bibliography database.
- `figures/` — publication figures used by the manuscript.
- `MD_OS_CORTEX_Clarity_Revision.pdf` — compiled manuscript.
- `REVISION_NOTES.md` — editorial and structural changes.
- `SHA256SUMS` — file-integrity manifest.

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
