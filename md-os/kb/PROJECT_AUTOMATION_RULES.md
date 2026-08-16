# Project Automation Rules

Deterministic rules:
1. connector snapshots are read from `md-os/ops/sources/*/*.json`
2. only snapshots matching the project are included
3. each signal becomes a canonical work item
4. dependencies become relation edges
5. due dates and priorities become agenda items and scheduler buckets
6. entities and suspected causes feed active memory
7. builders write canonical state into `md-os/ops/projects/<project_id>/`

Human rule:
- edit the knowledge base or the source signals
- do not hand-edit generated project files unless doing explicit emergency repair

