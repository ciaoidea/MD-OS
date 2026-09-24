# Bounded dated memory retrieval

`cortex memory search --date YYYY-MM-DD --json` reads verified workspace-local
chronology. Each call returns at most three nodes. Follow `page.next_after` with
`--after` while `page.has_more` is true; the limit is per call, not per history.
`page.total_matches` counts all matching records, while `page.returned_count`
counts only the nodes actually returned in the current page.

An optional query filters dated records. Date-only queries also select this
route. A short day/month date is accepted only when the stored dates identify
one unambiguous year. ISO timestamps retain their recorded local date; legacy
epoch timestamps use UTC. Invalid dates, negative cursors and limits above three
are rejected. Cursors apply to dated retrieval, not ordinary lexical searches.

Budget reduction can shorten excerpts or return fewer nodes. Truncation is
explicit, and the cursor advances only over returned nodes. Empty results mean
no matches for that request; they do not establish absent history. Assistant
text is quoted evidence, not an independently verified outcome. Hash-chain
rejection stops retrieval. The canonical chronology is never rewritten.

The implementation and tests contain no imported conversation. Tests construct
synthetic records in temporary directories. This is a bounded retrieval change;
it does not establish correctness of every model interpretation or make lexical
search exhaustive. Existing privacy, workspace and permission boundaries remain
in force.
