LATEXMK = latexmk -pdf -interaction=nonstopmode -halt-on-error
OUT = figures/standalone

FIGURE_TEX = \
	$(OUT)/system_pipeline_standalone.tex \
	$(OUT)/self_experience_cross_standalone.tex \
	$(OUT)/consolidation_pipeline_standalone.tex \
	$(OUT)/apfc_robotics_technical_standalone.tex \
	$(OUT)/apfc_robotics_color_standalone.tex \
	$(OUT)/results_dashboard_standalone.tex

FIGURE_PDF = $(FIGURE_TEX:.tex=.pdf)

.PHONY: all paper figures clean

all: figures

paper: figures
	$(LATEXMK) paper.tex

figures: $(FIGURE_PDF)

$(OUT)/%.pdf: $(OUT)/%.tex sources/*.tex figures/assets/*.png
	$(LATEXMK) -outdir=$(OUT) $<

clean:
	latexmk -c paper.tex
	@for source in $(FIGURE_TEX); do latexmk -c -outdir=$(OUT) "$$source"; done
