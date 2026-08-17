# Production Limits and Critical Assessment

MD-OS (Artificial Prefrontal Cortex) v5.0 is an early reference implementation of a Markdown-native
Operating Filesystem.

To keep the project operationally serious, this document separates the
architectural paradigm from the current technical boundaries of this release.

MD-OS is an Operating Filesystem for persistent agents: a text-native,
auditable, and reconstructible control plane that can be operated through host
runtimes such as Codex and through MCP tool surfaces. It is not Linux, it is not
ROS, and it is not a high-frequency OLTP database.

## 1. I/O Scalability vs. Source of Truth

**Limit:** Relying on filesystem reads and writes, atomic rename flows, and
large JSON or NDJSON files for every state change can become a bottleneck at
scale.

**Reality:** The filesystem is excellent as an auditable, human-readable source
of truth. It should not be treated as a high-frequency transaction engine.

**Mitigation:**

- Keep text files as the canonical truth.
- Use derived read-only indexes, such as SQLite caches or search indexes, when
  query volume or latency requires them.
- Shard state by role, project, date, or source channel.
- Compact old or terminal state into archive views.
- Keep hot summaries small enough for fast host-runtime readback.

## 2. Security and Trust Boundaries

**Limit:** Readable policy files are useful for audit, but they are not hard
security barriers if an agent or connector has enough local write authority to
modify its own constraints.

**Reality:** MD-OS policy files describe and audit authority. Hard enforcement
must live outside the agent's mutable layer.

**Mitigation:**

- Keep destructive actions denied by default.
- Enforce allowlists at the connector and host boundary, not only in Markdown
  policy text.
- Keep critical policy files read-only at the host OS level when possible.
- Use sandboxing, container policy, AppArmor, broker-level MCP policy, or other
  host controls for production deployments.
- Consider signatures or hash checks for critical bootstrap and policy files.
- Prevent terminal connectors from bypassing hardcoded allowlists.

## 3. Host Runtime Dependency

**Limit:** MD-OS depends on a host reasoning runtime. The host runtime is the
execution layer for this session, not the repository identity. If the runtime
loses the identity frame, skips readback, or ignores the operating model,
behavior degrades.

**Reality:** MD-OS reduces dependence on chat history by externalizing memory,
but it does not remove dependence on the model runtime.

**Mitigation:**

- Treat host-runtime compatibility as a required execution capability.
- Keep the cognitive bootstrap compact, explicit, and readable.
- Require state readback before task-specific work.
- Keep session self-checks and continuity files available under `md-os/ops/`.
- Continue developing the MCP server adapter so other verified hosts can
  operate the same control plane.

## 4. Internal Complexity and UX

**Limit:** MD-OS has strict directories, lifecycle classes, schemas, state
machines, builders, and connector contracts. Exposing all of that directly can
create friction for humans and new host runtimes.

**Reality:** The rigor is useful for replay, audit, and safety, but the user
surface must stay simple.

**Mitigation:**

- Keep the formal structure under the hood.
- Provide high-level commands for common workflows.
- Prefer workflows such as `cortex role onboard <role_id>` that can create role
  folders, run intake, run sensemaking, rebuild indexes, and surface expert
  questions without exposing raw orchestration.
- Keep Markdown read views understandable to non-specialists.

## 5. Multi-Agent Concurrency

**Limit:** Append-only change proposals and file locks are suitable for local
supervised workflows. They are not enough for a fleet of agents writing to the
same operational state at high frequency.

**Reality:** Real multi-agent production requires transactional coordination
outside simple file writes.

**Mitigation:**

- Use external queues or brokers for concurrent multi-agent orchestration.
- Add robust leases with explicit owners, expiry, and recovery.
- Keep write ownership narrow and resource-scoped.
- Route conflicts through a dedicated resolver instead of unbounded manual
  queues.
- Treat `md-os/` as the local supervised control-plane layer unless stronger
  coordination is explicitly added.

## Current Production Stance

MD-OS (Artificial Prefrontal Cortex) v5.0 is strongest today in supervised, auditable, role-bounded
workflows:

- workplace onboarding and new-hire assistance
- ticket and request triage
- document-heavy operational review
- connector snapshots from existing internal tools
- replayable project and agenda state
- human-supervised automation where evidence matters

It should not be marketed as autonomous unsupervised production infrastructure
until hard security, scaling indexes, and multi-agent coordination are enforced
outside the mutable agent layer.
