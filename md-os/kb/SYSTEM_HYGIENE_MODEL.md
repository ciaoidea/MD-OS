# System Hygiene Model

System hygiene tracks:
- cleanliness
- efficiency
- stability

Typical issues:
- empty files
- duplicate logical artifacts
- exact duplicate content
- missing required runtime files
- uncontrolled workspace growth
- incomplete semantic or epistemic node coverage
- missing self-release readback for version or identity work

Publication hygiene must distinguish generic unsafe scripts from declared
elevated launchers. An elevated launcher may be part of the operating system's
self-sustaining host path when it is explicit, documented, bounded to a
reference host, and visible in hygiene output. Undeclared bypass scripts remain
critical findings.

Health and hygiene should prefer compact generated readbacks, such as
`md-os/ops/semantic_knowledge_summary.*` and
`md-os/ops/releases/self_release_index.*`, before expanding full graphs or
proposal history.

Global health may remain `critical` while the runtime itself is operable. The
health classifier must keep severity intact while separating:

- runtime health
- compiler health
- AGI-loop health
- publication health
- security health
- local-hygiene health

Each finding should state whether it is runtime-blocking, release-blocking,
publication-blocking, security-blocking, or local-only. This lets the system
say "runtime ok, public release blocked" without hiding the blocking issue.

An exploratory experiment may remain partial or unverified without blocking a
distribution. Its finding remains visible and cannot support claim or skill
promotion. AGI-loop and eval findings block release when their source is
critical, when a regression is present, or when the failed check declares
`release_required: true`. A required distribution test must therefore declare
that field explicitly; omitting it must never turn an exploratory result into
a release claim.
