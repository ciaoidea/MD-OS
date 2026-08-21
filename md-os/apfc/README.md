# APFC Cognitive Runtime

Canonical model: [BIO_MULTIMODAL_CORTICAL_TRANSFORMER.md](../kb/BIO_MULTIMODAL_CORTICAL_TRANSFORMER.md)

The APFC Cognitive Runtime is the first implementation slice of BMCT. It
converts raw text or document-like sources into experience tokens, binds those
tokens into an event graph, selects a bounded workspace, proposes gated
actions, and records prediction/error state. Executive APFC event, context,
graph, and consolidation modules live under `executive/`.

## Runtime Surface

```text
cortex apfc cognitive ingest <source.json>
cortex apfc cognitive bind [frame_id]
cortex apfc cognitive workspace [frame_id]
cortex apfc cognitive gate [frame_id]
cortex apfc cognitive predict [frame_id]
cortex apfc cognitive run-cycle <source.json>
cortex apfc cognitive reflect <request.json>
cortex apfc cognitive reflect-intent <intent.json>
cortex apfc cognitive status
```

Generated and live state is written under `md-os/ops/apfc/cognitive/`.

`reflect` executes one bounded critical-judgment cycle. It ranks semantic uncertainties and authorized actions by expected progress, information gain, cost, and risk. A persistent cognitive anchor is created only when independent readback passes with evidence. Matching anchors can be reused by later cycles or disabled for causal ablation. The command never starts an autonomous loop.

`reflect-intent` routes a model-classified natural-language intent to exactly one `reflect` cycle. Routing depends on a language-independent semantic contract rather than keywords: critical reflection must be relevant to the active problem, require verification, include the complete critical method, exceed the confidence gate, and request only a single bounded cycle. Opinions, ambiguous classifications, and continuous autonomy are not executed.
