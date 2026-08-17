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
cortex apfc cognitive status
```

Generated and live state is written under `md-os/ops/apfc/cognitive/`.
