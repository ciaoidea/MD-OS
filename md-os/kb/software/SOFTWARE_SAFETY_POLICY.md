# Software Safety Policy

Application and service control must be explicit, bounded, and auditable.

## Discovery Is Read-Only

The software bootstrap may inventory applications and services, but it must not
activate them.

Read-only discovery may include:

- listing desktop entries
- listing app bundles
- listing Start menu applications
- listing package-manager application surfaces
- listing service unit files
- reading service status summaries

It must not:

- launch applications
- inspect private application windows
- start services
- stop services
- restart services
- install or remove packages
- kill processes
- edit service definitions

## Control Requires A Connector

Natural-language intents such as:

```text
open firefox
start libreoffice
show ssh status
restart nginx
stop this service
```

must be routed through dedicated connectors with explicit capabilities and
policy. Discovery alone is not permission to act.

Service start, stop, restart, package install, package removal, and process
termination are write actions. They require explicit user intent, connector
policy, and audit records.

## Locality

Software inventory is private host shape. It must stay under:

```text
md-os/ops/local/software/
```

It must remain cleanable with:

```bash
mdos software clean
```

The portable MD-OS package should include the software model and connector
code, not the private list of applications and services installed on a user's
machine.
