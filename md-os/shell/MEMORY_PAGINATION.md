# Bounded dated memory retrieval

Lexical retrieval also supports bounded pages. Repeat the same query with
`--offset <search_page.next_offset> --index-hash <index_hash>` from the previous
result. A changed index rejects the cursor: restart at offset zero. Offsets
advance only over returned nodes, including when the output budget shortens a
page. `candidate_pool_limited` means the FTS candidate pool reached its bound;
refine the query rather than treating the last page as exhaustive history.
Each lexical result also reports source freshness, index update mode and local
retrieval duration. These are not provider token counts or task-success proof.

Chronology is read under the same process lock used by writers. At 4,096 records
or 16 MiB per file, the writer seals that file in a hash-bound
`conversation.segments.json` manifest and appends to `conversation-segments/`.
The initial `conversation.ndjson` stays byte-for-byte intact after sealing.
Sequence numbers and predecessor hashes span all segments. Dated and lexical
reads validate and include the full chain; missing or altered segments fail
closed. The manifest follows `private_conversation_segments.schema.json`.
Copy the complete `ops/local/cortex/` directory for private continuity.

Restart long-lived Cortex processes after installing this storage version.
Older processes do not implement its lock or segmented format. Do not run old
and new writers against the same chronology. The writer does not silently repair
partial records left by a crashed process; report and review them before reuse.
The maximum segment count is 4,096; this is bounded storage, not infinite memory.

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
