# Response relevance contract

Thread creation and explicit thread resume merge the policy into the effective
App Server developer instructions. Existing host/project developer instructions
are read through `config/read` and preserved. Missing configuration readback
fails explicitly. This placement matters: user-message-only policy candidates
failed bounded semantic probes.

The ordinary chat packet and active-turn steering also load
`response_relevance.json` from the running shell engine directory. The original
human request stays verbatim. The generic English policy binds the response to
that request, relevant dialogue and appropriate evidence. Operating context is
not automatically the subject of the conversation. Explicit topic changes remain
valid; an unresolved reference remains unresolved.

The engine validates the policy structure and bounds before sending it. Missing,
malformed or oversized policies raise an explicit error. The per-packet metrics
include the policy source SHA-256; the prompt includes that same digest. No case
facts, entity names, history or response templates belong in this policy. The
schema is `md-os/schemas/response_relevance.schema.json`. Its structural checks
are implemented with the Python standard library; no new runtime dependency is
required. The renderer additionally enforces file and prompt byte limits.

The policy is supplied on fresh and reused turns, and on steering, within the
existing context budget. It neither retrieves memory automatically nor adds a
model call. Model-selected retrieval remains responsible for obtaining relevant
sources. The experimental evidence-contract CLI remains a separate path.

This is an instruction-level relevance correction. Structural validation and
source hashes do not prove that an answer is semantically correct. Synthetic
model evaluations test a bounded sample, not universal reliability. No factual,
identity, permission or skill authority is promoted.

Restart an already running shell process to load the changed Python code. The
policy file itself is read on every new packet and steering message. Do not kill
an active user turn to activate this update. Test the installed engine with
`python3 test/test_response_relevance.py` and `python3 test/test_mdos_shell.py`.
Deployment must preserve existing workspace-specific differences, compare source
hashes before replacement, and retain exact backups and a rollback record.
