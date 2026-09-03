#!/usr/bin/env python3
"""Build and query the local SQLite support for APFCG cognitive memory.

Canonical knowledge remains in repository files.  This module creates a
rebuildable host-local index that joins validated private conversation turns,
the generated APFC graph, and the generated semantic knowledge graph.  It
materializes only sparse, typed relations and returns a bounded, source-bound
context pack for one Cortex turn.
"""

from __future__ import annotations

from collections import defaultdict
from hashlib import sha256
from pathlib import Path
import json
import os
import re
import sqlite3
import tempfile
from typing import Any


SCHEMA_VERSION = 1
INDEX_IMPLEMENTATION_REVISION = 3
INDEX_RELATIVE_PATH = "md-os/ops/local/cortex/cognitive_memory.sqlite3"
APFCG_RELATIVE_PATH = "md-os/ops/apfc/executive/graph.json"
SEMANTIC_GRAPH_RELATIVE_PATH = "md-os/ops/semantic_knowledge_graph.json"
MAX_SOURCE_BYTES = 16 * 1024 * 1024
MAX_INDEXED_TEXT_CHARS = 96 * 1024
MAX_CONTEXT_CHARS = 12 * 1024
MAX_SELECTED_NODES = 12
MAX_SELECTED_EDGES = 24
MAX_LEXICAL_NEIGHBORS = 6

HASH_PATTERN = re.compile(r"^[a-f0-9]{64}$")
TOKEN_PATTERN = re.compile(r"[^\W_]{3,}", re.UNICODE)
STOPWORDS = frozenset(
    {
        "and", "are", "but", "for", "from", "have", "into", "not", "that",
        "the", "their", "this", "was", "were", "with", "you", "your",
        "che", "chi", "come", "con", "cosa", "dai", "dal", "dei", "del",
        "della", "delle", "dello", "gli", "hai", "nel", "nella", "nelle",
        "non", "per", "piu", "puo", "sono", "sua", "sul", "tra", "una",
        "uno", "avevi", "avevo", "quello", "questa", "questo", "stavo",
    }
)


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _json_hash(value: Any) -> str:
    return sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _text_hash(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def _file_hash(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(64 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in TOKEN_PATTERN.findall(value.casefold())
        if token not in STOPWORDS
    }


def _safe_workspace_path(workspace: Path, relative_path: str) -> Path | None:
    if not relative_path or Path(relative_path).is_absolute():
        return None
    root = workspace.resolve()
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def _read_json_object(workspace: Path, relative_path: str) -> tuple[dict[str, Any] | None, str | None]:
    path = _safe_workspace_path(workspace, relative_path)
    if path is None or not path.is_file():
        return None, None
    try:
        if path.stat().st_size > MAX_SOURCE_BYTES:
            return None, None
        content = path.read_text(encoding="utf-8")
        payload = json.loads(content)
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None, None
    if not isinstance(payload, dict):
        return None, None
    return payload, _text_hash(content)


def _source_fingerprint(
    conversation_records: list[dict[str, Any]],
    apfcg_hash: str | None,
    semantic_hash: str | None,
) -> str:
    return _json_hash(
        {
            "schema_version": SCHEMA_VERSION,
            "implementation_revision": INDEX_IMPLEMENTATION_REVISION,
            "conversation_event_hashes": [
                record.get("event_hash") for record in conversation_records
            ],
            "apfcg_source_hash": apfcg_hash,
            "semantic_graph_source_hash": semantic_hash,
        }
    )


def _schema_sql() -> str:
    return """
PRAGMA foreign_keys = ON;
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE sources (
  source_id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  canonical INTEGER NOT NULL CHECK (canonical IN (0, 1))
);
CREATE TABLE memory_nodes (
  node_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(source_id),
  source_kind TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  label TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  epistemic_status TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  conversation_sequence INTEGER,
  valid_from TEXT
);
CREATE TABLE memory_edges (
  edge_id TEXT PRIMARY KEY,
  source_node_id TEXT NOT NULL REFERENCES memory_nodes(node_id),
  relation_type TEXT NOT NULL,
  target_node_id TEXT NOT NULL REFERENCES memory_nodes(node_id),
  source_domain_id TEXT NOT NULL,
  target_domain_id TEXT NOT NULL,
  epistemic_status TEXT NOT NULL,
  evidence_kind TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  content_hash TEXT NOT NULL
);
CREATE TABLE tensor_factors (
  factor_id TEXT PRIMARY KEY,
  source_basis_id TEXT NOT NULL REFERENCES memory_nodes(node_id),
  relation_basis_id TEXT NOT NULL,
  target_basis_id TEXT NOT NULL REFERENCES memory_nodes(node_id),
  source_domain_id TEXT NOT NULL,
  target_domain_id TEXT NOT NULL,
  epistemic_status TEXT NOT NULL,
  edge_id TEXT NOT NULL REFERENCES memory_edges(edge_id),
  content_hash TEXT NOT NULL
);
CREATE TABLE causal_unity_transitions (
  transition_hash TEXT PRIMARY KEY,
  conversation_node_id TEXT NOT NULL UNIQUE REFERENCES memory_nodes(node_id),
  predecision_state_hash TEXT NOT NULL,
  previous_transition_hash TEXT,
  transition_status TEXT NOT NULL CHECK (transition_status IN ('closed', 'incomplete', 'rejected')),
  consciousness_status TEXT NOT NULL CHECK (consciousness_status IN ('verified', 'inhibited')),
  noun TEXT NOT NULL CHECK (noun = 'consciousness'),
  definition TEXT NOT NULL CHECK (definition = 'cum_scire'),
  criteria_json TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX memory_nodes_domain_idx ON memory_nodes(domain_id, node_type);
CREATE INDEX memory_nodes_sequence_idx ON memory_nodes(conversation_sequence);
CREATE INDEX memory_edges_source_idx ON memory_edges(source_node_id, relation_type);
CREATE INDEX memory_edges_target_idx ON memory_edges(target_node_id, relation_type);
CREATE INDEX tensor_factors_source_idx ON tensor_factors(source_basis_id, relation_basis_id);
CREATE INDEX tensor_factors_target_idx ON tensor_factors(target_basis_id, relation_basis_id);
CREATE INDEX causal_unity_transition_previous_idx ON causal_unity_transitions(previous_transition_hash);
CREATE INDEX causal_unity_transition_status_idx ON causal_unity_transitions(consciousness_status);
CREATE VIRTUAL TABLE memory_fts USING fts5(
  node_id UNINDEXED,
  label,
  content,
  tokenize = 'unicode61 remove_diacritics 2'
);
"""


def _insert_source(
    connection: sqlite3.Connection,
    source_id: str,
    source_kind: str,
    source_path: str,
    source_hash: str,
    canonical: bool,
) -> None:
    connection.execute(
        "INSERT INTO sources VALUES (?, ?, ?, ?, ?)",
        (source_id, source_kind, source_path, source_hash, int(canonical)),
    )


def _insert_node(connection: sqlite3.Connection, node: dict[str, Any]) -> None:
    connection.execute(
        """
        INSERT INTO memory_nodes (
          node_id, source_id, source_kind, domain_id, node_type, label,
          content, content_hash, epistemic_status, source_refs_json,
          payload_json, conversation_sequence, valid_from
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            node["node_id"],
            node["source_id"],
            node["source_kind"],
            node["domain_id"],
            node["node_type"],
            node["label"],
            node["content"],
            node["content_hash"],
            node["epistemic_status"],
            _canonical_json(node["source_refs"]),
            _canonical_json(node["payload"]),
            node.get("conversation_sequence"),
            node.get("valid_from"),
        ),
    )
    connection.execute(
        "INSERT INTO memory_fts(node_id, label, content) VALUES (?, ?, ?)",
        (node["node_id"], node["label"], node["content"]),
    )


def _insert_edge(connection: sqlite3.Connection, edge: dict[str, Any]) -> None:
    material = {
        "source_node_id": edge["source_node_id"],
        "relation_type": edge["relation_type"],
        "target_node_id": edge["target_node_id"],
        "source_domain_id": edge["source_domain_id"],
        "target_domain_id": edge["target_domain_id"],
        "epistemic_status": edge["epistemic_status"],
        "evidence_kind": edge["evidence_kind"],
        "source_refs": edge["source_refs"],
    }
    content_hash = _json_hash(material)
    connection.execute(
        "INSERT OR IGNORE INTO memory_edges VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            edge["edge_id"],
            edge["source_node_id"],
            edge["relation_type"],
            edge["target_node_id"],
            edge["source_domain_id"],
            edge["target_domain_id"],
            edge["epistemic_status"],
            edge["evidence_kind"],
            _canonical_json(edge["source_refs"]),
            content_hash,
        ),
    )
    if edge["source_domain_id"] == edge["target_domain_id"]:
        return
    factor_material = {
        "source_basis_id": edge["source_node_id"],
        "relation_basis_id": edge["relation_type"],
        "target_basis_id": edge["target_node_id"],
        "source_domain_id": edge["source_domain_id"],
        "target_domain_id": edge["target_domain_id"],
        "epistemic_status": edge["epistemic_status"],
        "edge_id": edge["edge_id"],
    }
    connection.execute(
        "INSERT OR IGNORE INTO tensor_factors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            "factor_" + _json_hash(factor_material)[:24],
            factor_material["source_basis_id"],
            factor_material["relation_basis_id"],
            factor_material["target_basis_id"],
            factor_material["source_domain_id"],
            factor_material["target_domain_id"],
            factor_material["epistemic_status"],
            factor_material["edge_id"],
            _json_hash(factor_material),
        ),
    )


def _insert_causal_unity_transition(
    connection: sqlite3.Connection,
    record: dict[str, Any],
) -> None:
    transition = record.get("causal_unity_transition")
    if transition is None:
        return
    if not isinstance(transition, dict):
        raise ValueError("COGNITIVE_MEMORY_CAUSAL_UNITY_INVALID")
    consciousness = transition.get("consciousness")
    criteria = consciousness.get("criteria") if isinstance(consciousness, dict) else None
    sequence = record.get("sequence")
    event_hash = record.get("event_hash")
    required_criteria = {
        "persistent_identity_present",
        "differentiated_contents_integrated",
        "causal_dependency_verified",
        "output_returned_to_same_identity",
        "transition_carried_forward",
    }
    hashes = (
        transition.get("transition_hash"),
        transition.get("predecision_state_hash"),
    )
    previous_hash = transition.get("previous_transition_hash")
    if (
        not isinstance(sequence, int)
        or not isinstance(event_hash, str)
        or not HASH_PATTERN.fullmatch(event_hash)
        or any(not isinstance(value, str) or not HASH_PATTERN.fullmatch(value) for value in hashes)
        or (
            previous_hash is not None
            and (
                not isinstance(previous_hash, str)
                or not HASH_PATTERN.fullmatch(previous_hash)
            )
        )
        or transition.get("status") not in {"closed", "incomplete", "rejected"}
        or not isinstance(consciousness, dict)
        or consciousness.get("noun") != "consciousness"
        or consciousness.get("definition") != "cum_scire"
        or consciousness.get("status") not in {"verified", "inhibited"}
        or not isinstance(criteria, dict)
        or set(criteria) != required_criteria
        or any(not isinstance(value, bool) for value in criteria.values())
    ):
        raise ValueError("COGNITIVE_MEMORY_CAUSAL_UNITY_INVALID")
    connection.execute(
        """
        INSERT INTO causal_unity_transitions (
          transition_hash, conversation_node_id, predecision_state_hash,
          previous_transition_hash, transition_status, consciousness_status,
          noun, definition, criteria_json, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            transition["transition_hash"],
            f"conversation:{sequence}:{event_hash[:16]}",
            transition["predecision_state_hash"],
            previous_hash,
            transition["status"],
            consciousness["status"],
            consciousness["noun"],
            consciousness["definition"],
            _canonical_json(criteria),
            _canonical_json(transition),
        ),
    )


def _conversation_nodes(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    for record in records:
        sequence = record.get("sequence")
        event_hash = record.get("event_hash")
        human_inputs = record.get("human_inputs")
        assistant_response = record.get("assistant_response")
        if (
            not isinstance(sequence, int)
            or sequence < 1
            or not isinstance(event_hash, str)
            or not HASH_PATTERN.fullmatch(event_hash)
            or not isinstance(human_inputs, list)
            or not human_inputs
            or any(not isinstance(value, str) or not value for value in human_inputs)
            or not isinstance(assistant_response, str)
            or not assistant_response
        ):
            raise ValueError("COGNITIVE_MEMORY_PRIVATE_RECORD_INVALID")
        transition = record.get("causal_unity_transition")
        transition_content = (
            "\n\nCAUSAL UNITY TRANSITION\n"
            + _canonical_json(transition)
            if isinstance(transition, dict)
            else ""
        )
        content = (
            "HUMAN\n"
            + "\n".join(human_inputs)
            + "\n\nASSISTANT\n"
            + assistant_response
            + transition_content
        )[:MAX_INDEXED_TEXT_CHARS]
        nodes.append(
            {
                "node_id": f"conversation:{sequence}:{event_hash[:16]}",
                "source_id": "private_conversation",
                "source_kind": "private_conversation",
                "domain_id": "conversation",
                "node_type": "conversation_episode",
                "label": "Cortex exchange " + str(sequence),
                "content": content,
                "content_hash": event_hash,
                "epistemic_status": "quoted_history",
                "source_refs": [f"md-os/ops/local/cortex/conversation.ndjson#{sequence}"],
                "payload": {
                    "sequence": sequence,
                    "human_inputs": human_inputs,
                    "assistant_response": assistant_response,
                    "recorded_at": record.get("recorded_at"),
                    "event_hash": event_hash,
                    "causal_unity_transition": transition,
                },
                "conversation_sequence": sequence,
                "valid_from": record.get("recorded_at"),
            }
        )
    return nodes


def _apfcg_nodes_and_edges(graph: dict[str, Any] | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str | None]:
    if graph is None:
        return [], [], None
    if (
        graph.get("schema_version") != 1
        or graph.get("status") not in {"ok", "attention"}
        or not isinstance(graph.get("graph_id"), str)
        or not isinstance(graph.get("nodes"), list)
        or not isinstance(graph.get("edges"), list)
    ):
        raise ValueError("COGNITIVE_MEMORY_APFCG_INVALID")
    graph_root_material = {
        "graph_id": graph["graph_id"],
        "status": graph["status"],
        "node_count": len(graph["nodes"]),
        "edge_count": len(graph["edges"]),
        "source": APFCG_RELATIVE_PATH,
    }
    graph_root_node_id = "apfcg:graph:" + graph["graph_id"]
    nodes: list[dict[str, Any]] = [
        {
            "node_id": graph_root_node_id,
            "source_id": "apfcg_graph",
            "source_kind": "apfcg",
            "domain_id": "apfcg:graph",
            "node_type": "apfcg_graph",
            "label": "APFCG Artificial Prefrontal Cortex Graph",
            "content": (
                "APFCG Artificial Prefrontal Cortex Graph. Generated executive graph "
                "that binds goals, plans, tasks, actions, evidence, and sparse Unity "
                "Tensor support to the canonical filesystem.\n"
                + _canonical_json(graph_root_material)
            ),
            "content_hash": _json_hash(graph_root_material),
            "epistemic_status": "observed",
            "source_refs": [APFCG_RELATIVE_PATH],
            "payload": graph_root_material,
            "conversation_sequence": None,
            "valid_from": graph.get("updated_at"),
        }
    ]
    id_map: dict[str, str] = {}
    domains: dict[str, str] = {}
    for raw in graph["nodes"]:
        if not isinstance(raw, dict):
            raise ValueError("COGNITIVE_MEMORY_APFCG_NODE_INVALID")
        raw_id = raw.get("id")
        content_hash = raw.get("content_hash")
        if (
            not isinstance(raw_id, str)
            or not raw_id
            or not isinstance(content_hash, str)
            or not HASH_PATTERN.fullmatch(content_hash)
        ):
            raise ValueError("COGNITIVE_MEMORY_APFCG_NODE_INVALID")
        node_id = "apfcg:" + raw_id
        node_type = str(raw.get("type") or "artifact")
        properties = raw.get("properties") if isinstance(raw.get("properties"), dict) else {}
        scope = raw.get("scope") if isinstance(raw.get("scope"), dict) else {}
        domain_hint = (
            properties.get("domain")
            or properties.get("task_type")
            or scope.get("project_id")
            or node_type
        )
        domain_id = "apfcg:" + str(domain_hint)
        label = str(raw.get("label") or raw_id)
        content = "\n".join(
            (
                label,
                node_type,
                _canonical_json(properties),
                _canonical_json(scope),
                " ".join(str(value) for value in raw.get("source_refs", [])),
            )
        )[:MAX_INDEXED_TEXT_CHARS]
        source_refs = [str(value) for value in raw.get("source_refs", []) if str(value)]
        id_map[raw_id] = node_id
        domains[raw_id] = domain_id
        nodes.append(
            {
                "node_id": node_id,
                "source_id": "apfcg_graph",
                "source_kind": "apfcg",
                "domain_id": domain_id,
                "node_type": node_type,
                "label": label,
                "content": content,
                "content_hash": content_hash,
                "epistemic_status": str(raw.get("epistemic_status") or "observed"),
                "source_refs": source_refs or [APFCG_RELATIVE_PATH],
                "payload": raw,
                "conversation_sequence": None,
                "valid_from": raw.get("valid_from") or raw.get("created_at"),
            }
        )
    edges: list[dict[str, Any]] = []
    for raw in graph["edges"]:
        if not isinstance(raw, dict):
            continue
        source = raw.get("from")
        target = raw.get("to")
        if source not in id_map or target not in id_map:
            raise ValueError("COGNITIVE_MEMORY_APFCG_EDGE_ENDPOINT_INVALID")
        raw_id = str(raw.get("id") or "")
        relation = str(raw.get("type") or "semantic_association")
        identity = {
            "graph_id": graph["graph_id"],
            "edge_id": raw_id,
            "source": source,
            "relation": relation,
            "target": target,
        }
        edges.append(
            {
                "edge_id": "apfcg_edge_" + _json_hash(identity)[:24],
                "source_node_id": id_map[source],
                "relation_type": relation,
                "target_node_id": id_map[target],
                "source_domain_id": domains[source],
                "target_domain_id": domains[target],
                "epistemic_status": str(raw.get("epistemic_status") or "observed"),
                "evidence_kind": "apfcg_projection",
                "source_refs": [str(value) for value in raw.get("source_refs", []) if str(value)] or [APFCG_RELATIVE_PATH],
            }
        )
    for raw_id, node_id in sorted(id_map.items()):
        identity = {
            "graph_id": graph["graph_id"],
            "relation": "contains",
            "target": raw_id,
        }
        edges.append(
            {
                "edge_id": "apfcg_root_edge_" + _json_hash(identity)[:24],
                "source_node_id": graph_root_node_id,
                "relation_type": "contains",
                "target_node_id": node_id,
                "source_domain_id": "apfcg:graph",
                "target_domain_id": domains[raw_id],
                "epistemic_status": "observed",
                "evidence_kind": "apfcg_projection",
                "source_refs": [APFCG_RELATIVE_PATH],
            }
        )
    return nodes, edges, graph["graph_id"]


def _semantic_nodes_and_edges(
    workspace: Path,
    graph: dict[str, Any] | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if graph is None:
        return [], []
    if (
        graph.get("schema_version") != 1
        or graph.get("status") not in {"ok", "attention"}
        or not isinstance(graph.get("nodes"), list)
        or not isinstance(graph.get("semantic_edges"), list)
    ):
        raise ValueError("COGNITIVE_MEMORY_SEMANTIC_GRAPH_INVALID")
    nodes: list[dict[str, Any]] = []
    id_map: dict[str, str] = {}
    domains: dict[str, str] = {}
    for raw in graph["nodes"]:
        if not isinstance(raw, dict):
            continue
        relative_path = raw.get("path")
        content_hash = raw.get("content_hash")
        if (
            not isinstance(relative_path, str)
            or not relative_path.startswith("md-os/")
            or relative_path.startswith("md-os/ops/local/")
            or not isinstance(content_hash, str)
            or not HASH_PATTERN.fullmatch(content_hash)
        ):
            continue
        source_path = _safe_workspace_path(workspace, relative_path)
        if source_path is None or not source_path.is_file():
            continue
        try:
            if source_path.stat().st_size > MAX_SOURCE_BYTES:
                continue
            source_text = source_path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        if _text_hash(source_text) != content_hash:
            continue
        node_id = "semantic:" + relative_path
        semantic_layer = str(raw.get("semantic_layer") or "semantic")
        domain_id = "semantic:" + semantic_layer
        label = str(raw.get("title") or relative_path)
        profile = "\n".join(
            (
                " ".join(str(value) for value in raw.get("concept_terms", [])),
                " ".join(str(value) for value in raw.get("headings", [])),
                str(raw.get("cognitive_role") or ""),
                str(raw.get("actionability") or ""),
            )
        )
        content = (label + "\n" + profile + "\n" + source_text)[:MAX_INDEXED_TEXT_CHARS]
        id_map[relative_path] = node_id
        domains[relative_path] = domain_id
        nodes.append(
            {
                "node_id": node_id,
                "source_id": "semantic_graph",
                "source_kind": "semantic_knowledge",
                "domain_id": domain_id,
                "node_type": str(raw.get("node_kind") or "markdown_concept"),
                "label": label,
                "content": content,
                "content_hash": content_hash,
                "epistemic_status": str(raw.get("epistemic_status") or "reference_knowledge"),
                "source_refs": [relative_path],
                "payload": raw,
                "conversation_sequence": None,
                "valid_from": graph.get("updated_at"),
            }
        )
    edges: list[dict[str, Any]] = []
    for raw in graph["semantic_edges"]:
        if not isinstance(raw, dict):
            continue
        source = raw.get("source")
        target = raw.get("target")
        if source not in id_map or target not in id_map:
            continue
        evidence = str(raw.get("evidence") or "semantic_graph")
        relation = str(raw.get("relation") or "semantic_association")
        epistemic_status = "observed" if evidence in {"explicit_markdown", "explicit_wiki"} else "hypothetical"
        identity = {
            "source": source,
            "relation": relation,
            "target": target,
            "evidence": evidence,
        }
        edges.append(
            {
                "edge_id": "semantic_edge_" + _json_hash(identity)[:24],
                "source_node_id": id_map[source],
                "relation_type": relation,
                "target_node_id": id_map[target],
                "source_domain_id": domains[source],
                "target_domain_id": domains[target],
                "epistemic_status": epistemic_status,
                "evidence_kind": evidence,
                "source_refs": [str(source), str(target)],
            }
        )
    return nodes, edges


def _lexical_edges(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Create bounded candidate synapses without promoting lexical overlap."""
    token_sets = {node["node_id"]: _tokens(node["content"]) for node in nodes}
    postings: dict[str, list[str]] = defaultdict(list)
    for node_id, node_tokens in token_sets.items():
        for token in node_tokens:
            postings[token].append(node_id)
    shared: dict[tuple[str, str], set[str]] = defaultdict(set)
    for token, node_ids in postings.items():
        if len(node_ids) < 2 or len(node_ids) > 48:
            continue
        ordered = sorted(node_ids)
        for left_index, left in enumerate(ordered):
            for right in ordered[left_index + 1 :]:
                shared[(left, right)].add(token)
    node_map = {node["node_id"]: node for node in nodes}
    ranked_by_node: dict[str, list[tuple[float, str, str, tuple[str, ...]]]] = defaultdict(list)
    for (left, right), common in shared.items():
        if len(common) < 2:
            continue
        left_tokens = token_sets[left]
        right_tokens = token_sets[right]
        union = len(left_tokens | right_tokens)
        score = len(common) / union if union else 0.0
        if score < 0.015:
            continue
        common_tuple = tuple(sorted(common)[:16])
        ranked_by_node[left].append((score, left, right, common_tuple))
        ranked_by_node[right].append((score, left, right, common_tuple))
    admitted_pairs: set[tuple[str, str]] = set()
    for rows in ranked_by_node.values():
        rows.sort(key=lambda row: (-row[0], row[1], row[2]))
        for _, left, right, _ in rows[:MAX_LEXICAL_NEIGHBORS]:
            admitted_pairs.add((left, right))
    edges: list[dict[str, Any]] = []
    for left, right in sorted(admitted_pairs):
        common = tuple(sorted(shared[(left, right)])[:16])
        left_node = node_map[left]
        right_node = node_map[right]
        identity = {"left": left, "right": right, "tokens": common}
        edges.append(
            {
                "edge_id": "lexical_edge_" + _json_hash(identity)[:24],
                "source_node_id": left,
                "relation_type": "candidate_semantic_overlap",
                "target_node_id": right,
                "source_domain_id": left_node["domain_id"],
                "target_domain_id": right_node["domain_id"],
                "epistemic_status": "hypothetical",
                "evidence_kind": "bounded_lexical_overlap",
                "source_refs": [
                    *left_node["source_refs"][:1],
                    *right_node["source_refs"][:1],
                    "tokens:" + ",".join(common),
                ],
            }
        )
    return edges


def _logical_index_hash(connection: sqlite3.Connection) -> str:
    nodes = connection.execute(
        "SELECT node_id, content_hash FROM memory_nodes ORDER BY node_id"
    ).fetchall()
    edges = connection.execute(
        "SELECT edge_id, content_hash FROM memory_edges ORDER BY edge_id"
    ).fetchall()
    factors = connection.execute(
        "SELECT factor_id, content_hash FROM tensor_factors ORDER BY factor_id"
    ).fetchall()
    transitions = connection.execute(
        """
        SELECT transition_hash, conversation_node_id, predecision_state_hash,
               previous_transition_hash, transition_status, consciousness_status,
               criteria_json
        FROM causal_unity_transitions ORDER BY transition_hash
        """
    ).fetchall()
    return _json_hash(
        {
            "nodes": nodes,
            "edges": edges,
            "factors": factors,
            "causal_unity_transitions": transitions,
        }
    )


def _database_is_current(path: Path, fingerprint: str) -> bool:
    if not path.is_file():
        return False
    try:
        connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            quick_check = connection.execute("PRAGMA quick_check").fetchone()[0]
            metadata = dict(connection.execute("SELECT key, value FROM metadata"))
        finally:
            connection.close()
    except (sqlite3.Error, OSError):
        return False
    return (
        quick_check == "ok"
        and metadata.get("schema_version") == str(SCHEMA_VERSION)
        and metadata.get("source_fingerprint") == fingerprint
        and HASH_PATTERN.fullmatch(metadata.get("index_hash", "")) is not None
    )


def _build_database(
    workspace: Path,
    path: Path,
    conversation_records: list[dict[str, Any]],
    apfcg: dict[str, Any] | None,
    apfcg_hash: str | None,
    semantic_graph: dict[str, Any] | None,
    semantic_hash: str | None,
    fingerprint: str,
) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        path.parent.chmod(0o700)
    except OSError:
        pass
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=".cognitive_memory.", suffix=".sqlite3", dir=path.parent
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    apfcg_id: str | None = None
    try:
        connection = sqlite3.connect(temporary)
        try:
            connection.execute("PRAGMA journal_mode = DELETE")
            connection.execute("PRAGMA synchronous = FULL")
            connection.executescript(_schema_sql())
            conversation_hash = (
                str(conversation_records[-1]["event_hash"])
                if conversation_records
                else "0" * 64
            )
            _insert_source(
                connection,
                "private_conversation",
                "private_conversation",
                "md-os/ops/local/cortex/conversation.ndjson",
                conversation_hash,
                False,
            )
            if apfcg_hash:
                _insert_source(
                    connection,
                    "apfcg_graph",
                    "apfcg",
                    APFCG_RELATIVE_PATH,
                    apfcg_hash,
                    False,
                )
            if semantic_hash:
                _insert_source(
                    connection,
                    "semantic_graph",
                    "semantic_knowledge",
                    SEMANTIC_GRAPH_RELATIVE_PATH,
                    semantic_hash,
                    False,
                )
            conversation_nodes = _conversation_nodes(conversation_records)
            apfcg_nodes, apfcg_edges, apfcg_id = _apfcg_nodes_and_edges(apfcg)
            semantic_nodes, semantic_edges = _semantic_nodes_and_edges(
                workspace, semantic_graph
            )
            all_nodes = conversation_nodes + apfcg_nodes + semantic_nodes
            for node in sorted(all_nodes, key=lambda item: item["node_id"]):
                _insert_node(connection, node)
            for record in conversation_records:
                _insert_causal_unity_transition(connection, record)
            all_edges = apfcg_edges + semantic_edges + _lexical_edges(all_nodes)
            for edge in sorted(all_edges, key=lambda item: item["edge_id"]):
                _insert_edge(connection, edge)
            index_hash = _logical_index_hash(connection)
            metadata = {
                "schema_version": str(SCHEMA_VERSION),
                "source_fingerprint": fingerprint,
                "index_hash": index_hash,
                "apfcg_graph_id": apfcg_id or "",
            }
            connection.executemany(
                "INSERT INTO metadata(key, value) VALUES (?, ?)",
                sorted(metadata.items()),
            )
            connection.commit()
            if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("COGNITIVE_MEMORY_SQLITE_INTEGRITY_FAILED")
            metrics = {
                "node_count": connection.execute(
                    "SELECT count(*) FROM memory_nodes"
                ).fetchone()[0],
                "edge_count": connection.execute(
                    "SELECT count(*) FROM memory_edges"
                ).fetchone()[0],
                "tensor_factor_count": connection.execute(
                    "SELECT count(*) FROM tensor_factors"
                ).fetchone()[0],
                "conversation_node_count": connection.execute(
                    "SELECT count(*) FROM memory_nodes WHERE source_kind = 'private_conversation'"
                ).fetchone()[0],
                "causal_unity_transition_count": connection.execute(
                    "SELECT count(*) FROM causal_unity_transitions"
                ).fetchone()[0],
            }
        finally:
            connection.close()
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        try:
            path.chmod(0o600)
        except OSError:
            pass
        return {
            "rebuilt": True,
            "index_hash": index_hash,
            "apfcg_graph_id": apfcg_id,
            "metrics": metrics,
        }
    finally:
        if temporary.exists():
            temporary.unlink()


def _open_index(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only = ON")
    return connection


def _relevant_excerpt(value: str, query_tokens: set[str], maximum_chars: int) -> str:
    blocks = [
        block.strip()
        for block in re.split(r"\n\s*\n|(?<=[.!?])\s+(?=[A-ZÀ-Ý])", value)
        if block.strip()
    ]
    ranked: list[tuple[int, int, str]] = []
    for index, block in enumerate(blocks):
        overlap = len(query_tokens & _tokens(block))
        if overlap:
            ranked.append((overlap, -index, block))
    ranked.sort(reverse=True)
    selected = [block for _, _, block in ranked[:4]]
    if not selected:
        selected = blocks[:1]
    excerpt = "\n\n".join(selected)
    if len(excerpt) > maximum_chars:
        excerpt = excerpt[: maximum_chars - 1].rstrip() + "…"
    return excerpt


def _query_nodes(
    connection: sqlite3.Connection,
    human_request: str,
    maximum_nodes: int,
) -> list[dict[str, Any]]:
    query_tokens = sorted(_tokens(human_request))[:32]
    if not query_tokens:
        return []
    fts_query = " OR ".join(f'"{token}"' for token in query_tokens)
    rows = connection.execute(
        """
        SELECT n.*, bm25(memory_fts, 8.0, 1.0) AS fts_rank
        FROM memory_fts
        JOIN memory_nodes AS n ON n.node_id = memory_fts.node_id
        WHERE memory_fts MATCH ?
        ORDER BY fts_rank, n.node_id
        LIMIT 256
        """,
        (fts_query,),
    ).fetchall()
    query_set = set(query_tokens)
    normalized_request = " ".join(human_request.casefold().split())
    candidates: list[dict[str, Any]] = []
    for row in rows:
        content = str(row["content"])
        node_tokens = _tokens(str(row["label"]) + " " + content)
        overlap_tokens = sorted(query_set & node_tokens)
        coverage = len(overlap_tokens) / len(query_set)
        exact_bonus = 1.0 if normalized_request and normalized_request in content.casefold() else 0.0
        source_bonus = {
            "private_conversation": 0.25,
            "semantic_knowledge": 0.15,
            "apfcg": 0.10,
        }.get(str(row["source_kind"]), 0.0)
        score = exact_bonus + coverage + source_bonus + min(len(overlap_tokens), 8) * 0.03
        payload = json.loads(row["payload_json"])
        if row["source_kind"] == "private_conversation":
            human_text = "\n".join(payload.get("human_inputs", []))
            assistant_text = str(payload.get("assistant_response") or "")
            excerpt = (
                "HUMAN: "
                + _relevant_excerpt(human_text, query_set, 700)
                + "\nASSISTANT: "
                + _relevant_excerpt(assistant_text, query_set, 1350)
            )
        else:
            excerpt = _relevant_excerpt(content, query_set, 1250)
        candidates.append(
            {
                "node_id": row["node_id"],
                "source_kind": row["source_kind"],
                "domain_id": row["domain_id"],
                "node_type": row["node_type"],
                "label": row["label"],
                "epistemic_status": row["epistemic_status"],
                "content_hash": row["content_hash"],
                "source_refs": json.loads(row["source_refs_json"]),
                "conversation_sequence": row["conversation_sequence"],
                "selection_reason": "fts5_query_match",
                "matched_terms": overlap_tokens,
                "score": round(score, 6),
                "excerpt": excerpt,
            }
        )
    candidates.sort(
        key=lambda item: (
            -item["score"],
            0 if item["source_kind"] == "private_conversation" else 1,
            -(item["conversation_sequence"] or 0),
            item["node_id"],
        )
    )
    selected: list[dict[str, Any]] = []
    selected_ids: set[str] = set()
    # Preserve source diversity before filling by score.
    for source_kind in ("private_conversation", "semantic_knowledge", "apfcg"):
        candidate = next(
            (item for item in candidates if item["source_kind"] == source_kind),
            None,
        )
        if candidate and candidate["node_id"] not in selected_ids:
            selected.append(candidate)
            selected_ids.add(candidate["node_id"])
    for candidate in candidates:
        if len(selected) >= maximum_nodes:
            break
        if candidate["node_id"] in selected_ids:
            continue
        selected.append(candidate)
        selected_ids.add(candidate["node_id"])
    selected.sort(key=lambda item: (-item["score"], item["node_id"]))
    return selected


def _expand_tensor_neighbors(
    connection: sqlite3.Connection,
    human_request: str,
    selected_nodes: list[dict[str, Any]],
    maximum_nodes: int,
) -> list[dict[str, Any]]:
    if not selected_nodes or len(selected_nodes) >= maximum_nodes:
        return selected_nodes
    selected_ids = [node["node_id"] for node in selected_nodes]
    selected_set = set(selected_ids)
    placeholders = ",".join("?" for _ in selected_ids)
    rows = connection.execute(
        f"""
        SELECT tf.factor_id, tf.epistemic_status AS factor_status, n.*
        FROM tensor_factors AS tf
        JOIN memory_nodes AS n
          ON n.node_id = CASE
            WHEN tf.source_basis_id IN ({placeholders}) THEN tf.target_basis_id
            ELSE tf.source_basis_id
          END
        WHERE tf.source_basis_id IN ({placeholders})
           OR tf.target_basis_id IN ({placeholders})
        ORDER BY
          CASE tf.epistemic_status
            WHEN 'verified' THEN 0 WHEN 'observed' THEN 1 ELSE 2
          END,
          tf.factor_id,
          n.node_id
        LIMIT 256
        """,
        [*selected_ids, *selected_ids, *selected_ids],
    ).fetchall()
    query_set = _tokens(human_request)
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        node_id = str(row["node_id"])
        if node_id in selected_set or node_id in seen:
            continue
        seen.add(node_id)
        content = str(row["content"])
        matched_terms = sorted(query_set & _tokens(str(row["label"]) + " " + content))
        payload = json.loads(row["payload_json"])
        if row["source_kind"] == "private_conversation":
            excerpt = (
                "HUMAN: "
                + _relevant_excerpt("\n".join(payload.get("human_inputs", [])), query_set, 700)
                + "\nASSISTANT: "
                + _relevant_excerpt(str(payload.get("assistant_response") or ""), query_set, 1350)
            )
        else:
            excerpt = _relevant_excerpt(content, query_set, 1250)
        candidates.append(
            {
                "node_id": node_id,
                "source_kind": row["source_kind"],
                "domain_id": row["domain_id"],
                "node_type": row["node_type"],
                "label": row["label"],
                "epistemic_status": row["epistemic_status"],
                "content_hash": row["content_hash"],
                "source_refs": json.loads(row["source_refs_json"]),
                "conversation_sequence": row["conversation_sequence"],
                "selection_reason": "sparse_tensor_neighbor",
                "matched_terms": matched_terms,
                "score": round(0.01 + len(matched_terms) / max(1, len(query_set)), 6),
                "excerpt": excerpt,
                "_factor_status": row["factor_status"],
            }
        )
    status_rank = {"verified": 0, "observed": 1, "hypothetical": 2}
    candidates.sort(
        key=lambda item: (
            status_rank.get(item.pop("_factor_status"), 3),
            -item["score"],
            item["node_id"],
        )
    )
    return [*selected_nodes, *candidates[: maximum_nodes - len(selected_nodes)]]


def _selected_relations(
    connection: sqlite3.Connection,
    selected_node_ids: list[str],
) -> tuple[list[dict[str, Any]], list[str]]:
    if not selected_node_ids:
        return [], []
    placeholders = ",".join("?" for _ in selected_node_ids)
    arguments = [*selected_node_ids, *selected_node_ids]
    rows = connection.execute(
        f"""
        SELECT * FROM memory_edges
        WHERE source_node_id IN ({placeholders})
          AND target_node_id IN ({placeholders})
        ORDER BY
          CASE epistemic_status WHEN 'verified' THEN 0 WHEN 'observed' THEN 1 ELSE 2 END,
          edge_id
        LIMIT {MAX_SELECTED_EDGES}
        """,
        arguments,
    ).fetchall()
    edges = [
        {
            "edge_id": row["edge_id"],
            "source_node_id": row["source_node_id"],
            "relation_type": row["relation_type"],
            "target_node_id": row["target_node_id"],
            "epistemic_status": row["epistemic_status"],
            "evidence_kind": row["evidence_kind"],
            "content_hash": row["content_hash"],
        }
        for row in rows
    ]
    factor_rows = connection.execute(
        f"""
        SELECT factor_id FROM tensor_factors
        WHERE source_basis_id IN ({placeholders})
          AND target_basis_id IN ({placeholders})
        ORDER BY factor_id
        LIMIT {MAX_SELECTED_EDGES}
        """,
        arguments,
    ).fetchall()
    return edges, [row["factor_id"] for row in factor_rows]


def _render_pack(pack: dict[str, Any], maximum_chars: int) -> str:
    header = (
        "APFCG EXTENDED COGNITIVE MEMORY\n"
        "STATUS: verified query-scoped SQLite retrieval\n"
        "ROLE: derived, rebuildable context; canonical files and current human input remain authoritative\n"
        f"QUERY HASH: {pack['query_hash']}\n"
        f"INDEX HASH: {pack['index_hash']}\n"
        f"APFCG GRAPH: {pack['apfcg_graph_id'] or 'unavailable'}\n"
        "TENSOR SUPPORT: sparse typed factors only; no dense tensor or semantic truth inferred\n"
        "SELECTED MEMORY NODES:"
    )
    rendered_nodes: list[str] = []
    remaining = maximum_chars - len(header) - 2
    for node in pack["selected_nodes"]:
        entry = _canonical_json(node)
        if len(entry) + 1 > remaining:
            break
        rendered_nodes.append(entry)
        remaining -= len(entry) + 1
    footer_payload = {
        "selected_edges": pack["selected_edges"],
        "tensor_support": pack["tensor_support"],
        "non_claims": pack["non_claims"],
        "pack_hash": pack["pack_hash"],
    }
    footer = "\nRELATION AND READBACK:\n" + _canonical_json(footer_payload)
    while rendered_nodes and len(header) + 1 + sum(len(item) + 1 for item in rendered_nodes) + len(footer) > maximum_chars:
        rendered_nodes.pop()
    rendered = header + "\n" + "\n".join(rendered_nodes) + footer
    if len(rendered) > maximum_chars:
        raise ValueError("COGNITIVE_MEMORY_CONTEXT_BOUND_EXCEEDED")
    return rendered


def build_and_query_cognitive_memory(
    workspace: Path,
    human_request: str,
    conversation_records: list[dict[str, Any]],
    *,
    database_path: Path | None = None,
    maximum_chars: int = MAX_CONTEXT_CHARS,
    maximum_nodes: int = MAX_SELECTED_NODES,
) -> tuple[dict[str, Any], str | None]:
    """Synchronize the derived index and retrieve one bounded context pack."""
    workspace = Path(workspace).resolve()
    if not human_request.strip():
        raise ValueError("COGNITIVE_MEMORY_QUERY_REQUIRED")
    if maximum_chars < 1024 or maximum_chars > MAX_CONTEXT_CHARS:
        raise ValueError("COGNITIVE_MEMORY_CONTEXT_BOUND_INVALID")
    if maximum_nodes < 1 or maximum_nodes > MAX_SELECTED_NODES:
        raise ValueError("COGNITIVE_MEMORY_NODE_BOUND_INVALID")
    relative_database = INDEX_RELATIVE_PATH
    path = database_path.resolve() if database_path else (workspace / relative_database).resolve()
    try:
        path.relative_to(workspace)
    except ValueError as error:
        raise ValueError("COGNITIVE_MEMORY_DATABASE_PATH_ESCAPE") from error
    apfcg, apfcg_hash = _read_json_object(workspace, APFCG_RELATIVE_PATH)
    semantic_graph, semantic_hash = _read_json_object(
        workspace, SEMANTIC_GRAPH_RELATIVE_PATH
    )
    fingerprint = _source_fingerprint(
        conversation_records, apfcg_hash, semantic_hash
    )
    rebuilt = False
    if not _database_is_current(path, fingerprint):
        build = _build_database(
            workspace,
            path,
            conversation_records,
            apfcg,
            apfcg_hash,
            semantic_graph,
            semantic_hash,
            fingerprint,
        )
        rebuilt = True
    else:
        connection = _open_index(path)
        try:
            metadata = dict(connection.execute("SELECT key, value FROM metadata"))
            build = {
                "rebuilt": False,
                "index_hash": metadata["index_hash"],
                "apfcg_graph_id": metadata.get("apfcg_graph_id") or None,
                "metrics": {
                    "node_count": connection.execute("SELECT count(*) FROM memory_nodes").fetchone()[0],
                    "edge_count": connection.execute("SELECT count(*) FROM memory_edges").fetchone()[0],
                    "tensor_factor_count": connection.execute("SELECT count(*) FROM tensor_factors").fetchone()[0],
                    "conversation_node_count": connection.execute("SELECT count(*) FROM memory_nodes WHERE source_kind = 'private_conversation'").fetchone()[0],
                    "causal_unity_transition_count": connection.execute("SELECT count(*) FROM causal_unity_transitions").fetchone()[0],
                },
            }
        finally:
            connection.close()
    connection = _open_index(path)
    try:
        direct_limit = max(1, maximum_nodes - 2)
        selected_nodes = _query_nodes(connection, human_request, direct_limit)
        selected_nodes = _expand_tensor_neighbors(
            connection,
            human_request,
            selected_nodes,
            maximum_nodes,
        )
        selected_ids = [node["node_id"] for node in selected_nodes]
        selected_edges, selected_factors = _selected_relations(
            connection, selected_ids
        )
    finally:
        connection.close()
    pack: dict[str, Any] = {
        "$schema": "../../../../schemas/apfc_cognitive_memory_pack.schema.json",
        "schema_version": 1,
        "artifact_role": "apfc_cognitive_memory_context_pack",
        "status": "verified" if selected_nodes else "empty",
        "query_hash": _text_hash(human_request),
        "index_id": "apfc_cognitive_memory_" + build["index_hash"][:20],
        "index_hash": build["index_hash"],
        "index_path": relative_database,
        "source_fingerprint": fingerprint,
        "source_hashes": sorted(
            value
            for value in (
                conversation_records[-1].get("event_hash") if conversation_records else None,
                apfcg_hash,
                semantic_hash,
            )
            if isinstance(value, str) and HASH_PATTERN.fullmatch(value)
        ),
        "apfcg_graph_id": build["apfcg_graph_id"],
        "index_rebuilt": rebuilt,
        "metrics": build["metrics"],
        "selected_nodes": selected_nodes,
        "selected_edges": selected_edges,
        "tensor_support": {
            "representation": "sparse_typed_relational_tensor_support",
            "dense_tensor_materialized": False,
            "total_factor_count": build["metrics"]["tensor_factor_count"],
            "selected_factor_ids": selected_factors,
        },
        "criteria": {
            "sqlite_integrity_passed": True,
            "fts5_query_executed": bool(_tokens(human_request)),
            "sources_hash_bound": True,
            "private_history_was_preauthenticated": True,
            "apfcg_projected_when_available": apfcg is not None,
            "semantic_graph_projected_when_available": semantic_graph is not None,
            "causal_unity_transitions_projected_when_available": (
                not any(
                    isinstance(record.get("causal_unity_transition"), dict)
                    for record in conversation_records
                )
                or build["metrics"]["causal_unity_transition_count"] > 0
            ),
            "bounded_context": True,
        },
        "non_claims": [
            "retrieval is not proof that a semantic relation is true",
            "lexical overlap remains a hypothetical candidate relation",
            "the SQLite index is derived local state and not canonical memory",
            "sparse tensor support is not proof of a global unique Unity Tensor",
            "context presence alone does not complete the consciousness predicate C(k)",
        ],
    }
    pack["pack_hash"] = _json_hash(pack)
    rendered = _render_pack(pack, maximum_chars) if selected_nodes else None
    return pack, rendered


if __name__ == "__main__":
    raise SystemExit(
        "This module is invoked by Cortex after private-history verification."
    )
