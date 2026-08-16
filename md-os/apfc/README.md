# APFC Cognitive Runtime

Canonical model: [BIO_MULTIMODAL_CORTICAL_TRANSFORMER.md](../kb/BIO_MULTIMODAL_CORTICAL_TRANSFORMER.md)

The APFC Cognitive Runtime is the first implementation slice of BMCT. It
converts raw text or document-like sources into experience tokens, binds those
tokens into an event graph, selects a bounded workspace, proposes gated
actions, and records prediction/error state. Executive APFC event, context,
graph, and consolidation modules live under `executive/`.

## Runtime Surface

```text
mdos apfc cognitive ingest <source.json>
mdos apfc cognitive bind [frame_id]
mdos apfc cognitive workspace [frame_id]
mdos apfc cognitive gate [frame_id]
mdos apfc cognitive predict [frame_id]
mdos apfc cognitive run-cycle <source.json>
mdos apfc cognitive status
```

Generated and live state is written under `md-os/ops/apfc/cognitive/`.
