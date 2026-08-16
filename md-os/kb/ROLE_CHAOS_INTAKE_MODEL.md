# Role Chaos Intake Model

Role Chaos Intake is the MD-OS fast path for forming a role agent from the
messy operational material a new employee would normally receive.

It is the workplace insertion path for MD-OS APFC: assign one real role, collect
the raw material that role actually receives, and convert the pile into
auditable operating state instead of asking the organization to prepare a clean
course first.

The practical user is often a new hire. The new hire works with MD-OS APFC through
Codex chat, asks how to handle concrete work, and receives role-bounded answers
based on the reconstructed material. MD-OS APFC should reduce the training burden
and avoid repeated internal errors by surfacing role boundaries, recurring
patterns, known exceptions, and expert questions at the moment of work.

The work tools should be the new hire's normal authorized tools: mail,
calendar, agenda, planning boards, ticketing, documents, folders, and internal
applications exposed through MCP resources or tools where available. Those
systems are already authenticated for the new hire and supervised by the new
hire during use. MD-OS APFC operates inside that bounded authority; it does not
claim separate credentials or unsupervised internal access.

The starting point is not a clean knowledge base. The starting point is:

```text
one role
+ a disorderly pile of files
+ examples of work already done
+ a few hard boundaries about what the role may not do
```

The goal is to discover the repetitive operational work inside that pile and
turn it into auditable MD-OS state, candidate procedures, and targeted
questions for a human expert.

## Core Rule

Do not ask the organization to explain everything first.

Instead:

```text
dump the material
inventory it
extract weak signals
group likely tasks
ask only the questions that block action
promote validated patterns into programs
```

## Directory Layout

For each role:

```text
md-os/ops/roles/<role_id>/ROLE.md
md-os/ops/roles/<role_id>/intake/raw/
md-os/ops/roles/<role_id>/intake/inventory.json
md-os/ops/roles/<role_id>/intake/inventory.md
md-os/ops/roles/<role_id>/intake/entities.json
md-os/ops/roles/<role_id>/intake/task_map.md
md-os/ops/roles/<role_id>/intake/questions_for_expert.md
md-os/ops/roles/<role_id>/intake/candidate_operations.md
```

The `raw/` directory is the calderone. Put PDFs, spreadsheets, CSV files,
exports, emails, notes, procedures, screenshots, logs, and old examples there.
Do not clean the material before intake. The builder records what exists and
what still needs extraction.

## Role Contract First

The role is the anchor. Without a role, the same file pile can mean many
different things. Before interpreting the calderone, MD-OS must know what role
it is being formed for.

Before or during intake, create a minimal `ROLE.md`:

```md
# Role: backoffice_ordini

## Mission

Handle routine order back-office work.

## Expected Outputs

- order entered
- anomaly reported
- customer updated

## Systems

- ERP
- email
- shared folders

## Hard Boundaries

- do not issue credit notes without approval
- do not modify customer master data without approval
```

The role anchor prevents the system from trying to understand the whole
organization. It only needs to discover what matters for that role.

The minimum role contract is:

```text
mission -> why this role exists
expected outputs -> what the role must produce
systems -> where the role works
hard boundaries -> what the role must not do without approval
escalation -> when the role stops and asks
```

Every later case, relation, and root-cause hypothesis should be filtered
through that role contract.

## Intake Stages

1. Raw capture
   - copy files into `intake/raw/`
   - preserve original names and folder structure
   - do not overwrite or rewrite source material

2. Inventory
   - list every file
   - record size, extension, hash, and relative path
   - classify formats as text-readable or extractor-required

3. Weak extraction
   - read text-like files directly
   - extract headings, repeated terms, likely systems, likely entities, and
     operational keywords
   - mark binary or proprietary formats as requiring a connector or extractor

4. Task discovery
   - infer possible repetitive tasks from filenames, headings, and content
   - group signals by operational verbs such as approve, insert, verify,
     escalate, reconcile, close, notify, update, and block

5. Expert questions
   - generate short questions only where ambiguity blocks action
   - prioritize ownership, precedence, permissions, stale documents, and
     exception handling

6. Promotion
   - validated candidates move into `md-os/ops/programs/`
   - stable rules move into `md-os/kb/roles/<role_id>/`
   - repeated real cases become eval scenarios under `md-os/ops/evals/`

## Lifecycle

Raw role intake files under `md-os/ops/roles/<role_id>/intake/raw/` are live
source material. Generated inventory and maps under `intake/` are rebuildable
views. Stable validated knowledge should be promoted out of the intake area.

## Builder

Use:

```bash
node md-os/os/build_role_intake.js <role_id>
```

The builder is deterministic and does not require external services. It does
not claim to fully understand PDFs, spreadsheets, images, or proprietary
exports. It inventories them and asks for the extractor or connector needed to
turn them into readable operational text.
