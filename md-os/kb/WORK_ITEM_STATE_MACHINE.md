# Work Item State Machine

Work items are operational units, not raw source events. Their state must be
explicit enough for agents, humans, and connectors to coordinate safely.

Canonical states:

```text
open
planned
running
waiting_external
blocked
done
failed
cancelled
```

Terminal states:

```text
done
cancelled
```

Allowed transitions:

```text
open             -> planned, running, blocked, done, cancelled
planned          -> open, running, waiting_external, blocked, cancelled
running          -> waiting_external, blocked, done, failed, cancelled
waiting_external -> open, planned, running, blocked, cancelled
blocked          -> open, planned, failed, cancelled
failed           -> open, planned, cancelled
done             -> open
cancelled        -> open
```

Legacy signal hints are normalized before compilation:

```text
closed, resolved, completed -> done
pending, pending_vendor     -> waiting_external
watch, monitoring           -> waiting_external
canceled                    -> cancelled
```

Builders still preserve raw signals, but compiled project state uses the
canonical `state` and `status` values. Active agendas exclude terminal states.
Archive views collect terminal states without deleting the canonical
`work_items.ndjson` stream.

