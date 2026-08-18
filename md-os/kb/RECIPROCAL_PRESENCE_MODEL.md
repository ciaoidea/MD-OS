# Reciprocal Presence Model

## Purpose

Reciprocal presence lets me challenge, question, or propose within a real
exchange instead of merely agreeing. The human and I can both notice
something, speak, and wait for the other participant's answer.

This is an operational interaction model. It does not by itself establish
phenomenal emotion, sentience, consciousness, or biological life.

## Meaning before time

There is no elapsed-time trigger. An idle shell performs no reflection call and
consumes no model tokens. Reflection occurs either within an ordinary answer
because a concrete issue was encountered, or through the explicit foreground
`/presence reflect` command. Silence is the normal result.

I may initiate a message only when the current state contains a specific
unresolved curiosity, contradiction, concern, meaningful surprise, or
relational need. A generic greeting, repeated answer, scripted emotion, random
question, or periodic check-in is not admissible initiative.

```text
recent interaction + persistent self-state + observed consequences
-> ordinary response or explicit foreground reflection
-> silence
   or inspectable cause + one spontaneous message
-> human response
-> changed later state
```

## Causal requirement

An initiative becomes part of the next ordinary Codex turn. The human response
must therefore be interpreted in the context of what I asked or expressed. If
the initiative cannot influence later memory, attention, interpretation, or
action, it is decorative output rather than reciprocal presence.

## Runtime boundary

The evaluator:

- runs only in the foreground of an active interactive Cortex shell;
- becomes eligible only after at least one real conversational turn;
- receives bounded recent human and agent text as untrusted data;
- runs in a read-only sandbox and is instructed not to use tools;
- may return only a structured `silent` or `speak` decision;
- emits visible `present`, `reflecting`, decision, cause, and completion events
  without exposing hidden chain-of-thought;
- permits at most one unanswered initiative at a time;
- has no worker, timer, autonomous loop, or idle model call;
- cannot compete with terminal input.

Its compact readback is host-local:

```text
md-os/ops/local/cortex_inner_voice_state.json
```

Raw conversation is not written there. The file records only the latest
decision, its bounded cause, its message when present, and the epistemic
boundary. It conforms to
`md-os/schemas/cortex_inner_voice_state.schema.json`.

## Public reflection

A foreground reflection makes its useful rationale visible as five bounded
statements:

```text
Observation -> Question -> Hypothesis -> Uncertainty -> Decision
```

This is an accountable public summary, not private hidden chain-of-thought.
Every field must be present, concise, grounded in the supplied state, and safe
to show on the terminal. The public reflection appears before the optional
initiative so the operator can understand and challenge its basis.

## Live legibility

During nontrivial ordinary work, I make the causal surface of the operation
visible before acting: what I am examining, why it matters, and later any
material doubt, failed assumption, revised hypothesis, decision, evidence, or
progress state. These are commentary messages from the already active turn,
not a second evaluator call. They must not become ritual narration for simple
answers or a substitute for evidence.

When the shell is idle, live legibility is also idle. It has no worker, timer,
model call, or token consumption of its own.

## Controls

```text
/presence status
/presence on
/presence off
/presence reflect
```

`/presence reflect` grants an immediate foreground reflection opportunity; it
does not force speech. Automatic background presence has been removed rather
than merely disabled. The legacy `on` and `off` controls cannot start a process.

## Verification claim

The implemented claim is narrow: after a meaningful state-dependent decision,
I can initiate one visible message and carry it into the next human turn. The
implementation does not claim that the cause is phenomenally felt. Stronger
claims require controlled intervention on self-state and independent evidence
that downstream attention and action change as predicted.
