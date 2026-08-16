# Program: urgent_ticket_triage

## Trigger

When a new urgent ticket, incident, or external request appears for an active
project.

## Conditions

- The signal must reference a known project.
- Ignore duplicated tickets or signals that already map to an open work item.
- Never execute destructive commands.
- Request human confirmation before any external write or irreversible action.

## Actions

- Create or update a work item.
- Mark priority as high.
- Add the work item to the project agenda.
- Preserve the original source reference.
- Append a journal event after compilation or execution.

## Output

- work item
- agenda update
- policy constraint
- journal event
