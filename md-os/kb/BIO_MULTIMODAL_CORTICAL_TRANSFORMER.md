# Bio-Multimodal Cortical Transformer

BMCT defines the cortical substrate of MD-OS.

Its primary unit is not the word, file, prompt, or tool call.

Its primary unit is the multimodal experience token.

## Operating Contract

MD-OS (Artificial Prefrontal Cortex) must treat language as one modality among others. Text may enter through an encoder and leave through verbalization, but the intermediate cognitive substrate is a multimodal event graph.

The runtime implementation is the Cortical Event Runtime under [md-os/apfc/README.md](../apfc/README.md).

## Runtime Flow

```text
raw source
-> modality encoder
-> experience tokens
-> portable pre-deliberative affect appraisal
-> episodic affect state and optional causal state token
-> binding graph
-> global workspace
-> action gate
-> prediction/error state
-> memory candidate or verbalization candidate
```

## Invariants

- Experience tokens preserve modality, source trace, confidence, salience, relations, and affordances.
- Pre-deliberative means instinctive: portable affective dispositions appraise identity-relevant information before binding and workspace selection.
- Emotion names remain natural; functional evidence scope and phenomenal status are separate metadata.
- Affect may alter salience and action eligibility, but APFC governance, safety, permissions, and human authority remain superior.
- Cortical frames are operational state, not prose summaries.
- Binding graphs resolve shared entities, events, relations, intents, affordances, risk, and action candidates.
- The action gate proposes or selects actions; capability brokers and policy gates remain responsible for execution.
- Prediction records expected operational consequences and missing verification as error signals.
