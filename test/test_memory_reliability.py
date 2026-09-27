"""Regression tests use synthetic workspaces only, never instance chronology."""
import contextlib
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import importlib.machinery
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

from test_mdos_shell import ENGINE as E

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("reliability_memory", ROOT / "md-os/os/cognitive_memory_index.py")
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)


class MemoryReliabilityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "md-os").mkdir()

    def append(self, text="Synthetic maintenance question"):
        return E.append_private_conversation_turn(self.root, [text], "Synthetic response")

    def records(self):
        status, rows = E.read_private_conversation_history(self.root)
        self.assertEqual(status["status"], "verified", status)
        return rows

    def graph(self, sources):
        nodes = []
        for relative, title, content in sources:
            p = self.root / relative
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)
            nodes.append({"path": relative, "title": title, "content_hash": M._text_hash(content)})
        p = self.root / M.SEMANTIC_GRAPH_RELATIVE_PATH
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"schema_version": 1, "status": "ok", "nodes": nodes, "semantic_edges": []}))

    def test_concurrent_processes_preserve_all_sequences(self):
        script = """import importlib.machinery,importlib.util,sys
from pathlib import Path
l=importlib.machinery.SourceFileLoader('writer',sys.argv[1])
s=importlib.util.spec_from_loader(l.name,l); m=importlib.util.module_from_spec(s);sys.modules[l.name]=m;l.exec_module(m)
for i in range(4):m.append_private_conversation_turn(Path(sys.argv[2]),[sys.argv[3]+str(i)],'Synthetic response')
"""
        def writer(i):
            return subprocess.run([sys.executable, "-c", script, str(ROOT / "md-os/shell/bin/mdos-console"), str(self.root), str(i)], capture_output=True, text=True, timeout=30)
        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(writer, range(6)))
        for result in results:
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([r["sequence"] for r in self.records()], list(range(1, 25)))

    def test_concurrent_first_load_never_exposes_half_loaded_storage(self):
        module_name = "_mdos_private_conversation_store"
        saved = sys.modules.pop(module_name, None)
        original = importlib.machinery.SourceFileLoader.exec_module
        def delayed(loader, module):
            if module.__name__ == module_name:
                time.sleep(0.03)
            return original(loader, module)
        try:
            with patch.object(importlib.machinery.SourceFileLoader, "exec_module", delayed):
                with ThreadPoolExecutor(max_workers=8) as pool:
                    list(pool.map(lambda n: self.append(f"Concurrent first turn {n}"), range(8)))
            self.assertEqual(len(self.records()), 8)
        finally:
            if saved is not None:
                sys.modules[module_name] = saved

    def test_reader_waits_for_writer_and_lock_has_timeout(self):
        self.append()
        store = E._conversation_store()
        path = self.root / E.PRIVATE_CONVERSATION_PATH
        with store.file_lock(path.parent / "conversation.lock"):
            with self.assertRaisesRegex(RuntimeError, "LOCK_TIMEOUT"):
                with store.file_lock(path.parent / "conversation.lock", timeout=0.02):
                    pass
            with ThreadPoolExecutor(max_workers=1) as pool:
                # A released lock lets a subsequent reader observe a complete record.
                future = pool.submit(lambda: store.file_lock(path.parent / "conversation.lock", timeout=0.02).__enter__())
                with self.assertRaisesRegex(RuntimeError, "LOCK_TIMEOUT"):
                    future.result()
        self.assertEqual(len(self.records()), 1)

    def test_rotation_preserves_original_bytes_and_global_chain_across_copy(self):
        with patch.object(E, "MAX_PRIVATE_CONVERSATION_RECORDS", 2):
            self.append("first"); self.append("second")
            source = self.root / E.PRIVATE_CONVERSATION_PATH
            original = source.read_bytes()
            for i in range(5):
                self.append(f"later {i}")
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual([r["sequence"] for r in self.records()], list(range(1, 8)))
            with tempfile.TemporaryDirectory() as copied:
                shutil.copytree(self.root, Path(copied) / "workspace")
                rb, rows = E.read_private_conversation_history(Path(copied) / "workspace")
                self.assertEqual(rb["status"], "verified")
                self.assertEqual(len(rows), 7)
            source.write_bytes(original.replace(b"first", b"wrong"))
            rb, rows = E.read_private_conversation_history(self.root)
            self.assertEqual(rb["status"], "rejected")
            self.assertEqual(rows, [])

    def test_byte_rotation_missing_segment_and_interrupted_append_fail_closed(self):
        with patch.object(E, "MAX_PRIVATE_CONVERSATION_BYTES", 800):
            self.append(); self.append(); self.append()
            self.assertEqual(len(self.records()), 3)
            manifest = self.root / "md-os/ops/local/cortex/conversation.segments.json"
            self.assertTrue(manifest.exists())
            active = manifest.parent / json.loads(manifest.read_text())["active"]["path"]
            complete = active.read_bytes()
            active.write_bytes(complete + b'{"partial":')
            self.assertEqual(E.read_private_conversation_history(self.root)[0]["status"], "rejected")
            with self.assertRaisesRegex(RuntimeError, "REJECTED"):
                self.append()
            active.unlink()
            self.assertEqual(E.read_private_conversation_history(self.root)[0]["status"], "rejected")

    def test_manifest_publication_failure_keeps_original_readable(self):
        with patch.object(E, "MAX_PRIVATE_CONVERSATION_RECORDS", 1):
            self.append()
            store = E._conversation_store()
            with patch.object(store.os, "replace", side_effect=OSError("injected publication failure")):
                with self.assertRaises(OSError):
                    self.append("second")
            self.assertEqual(len(self.records()), 1)
            self.append("second")
            self.assertEqual(len(self.records()), 2)

    def test_deduplication_compares_complete_messages(self):
        self.append("Procediamo con la revisione del contratto.")
        status, text = E.render_private_conversation_history(self.root, excluded_exact_texts={"si"})
        self.assertEqual(status["rendered_record_count"], 1)
        status, text = E.render_private_conversation_history(self.root, excluded_exact_texts={"Procediamo con la revisione del contratto."})
        self.assertEqual(status["rendered_record_count"], 0)

    def test_modified_and_removed_canonical_sources_are_not_reused_from_cache(self):
        relative = "md-os/kb/example.md"
        self.graph([(relative, "quarzo lunare", "quarzo lunare ALFA")])
        first, _ = M.build_and_query_cognitive_memory(self.root, "quarzo lunare", [])
        self.assertEqual(len(first["selected_nodes"]), 1)
        source = self.root / relative
        source.write_text("quarzo lunare BETA")
        second, _ = M.build_and_query_cognitive_memory(self.root, "quarzo lunare", [])
        self.assertTrue(second["index_rebuilt"])
        self.assertEqual(second["selected_nodes"], [])
        self.assertEqual(second["source_freshness"]["excluded_stale_count"], 1)
        source.unlink()
        third, _ = M.build_and_query_cognitive_memory(self.root, "quarzo lunare", [])
        self.assertEqual(third["selected_nodes"], [])

    def test_procedural_query_keeps_maintained_source_ahead_of_legacy(self):
        self.graph([
            ("md-os/ops/sources/manual/provider_ticket.md", "Provider ticket preparation", "Provider ticket preparation observations."),
            ("md-os/ops/imports/old.md", "Provider preparazione ticket", "Provider preparazione ticket historical observations."),
        ])
        for i in range(6):
            self.append(f"Provider preparazione ticket past conversation {i}")
        pack, _ = M.build_and_query_cognitive_memory(self.root, "Provider preparazione ticket", self.records())
        self.assertEqual(pack["selected_nodes"][0]["node_id"], "semantic:md-os/ops/sources/manual/provider_ticket.md")
        self.assertEqual(pack["selected_nodes"][0]["epistemic_status"], "reference_knowledge")

    def test_lexical_pages_cover_matches_and_reject_stale_cursor(self):
        for i in range(8):
            self.append(f"quarzo lunare evidence {i}")
        rows = self.records()
        seen = []
        offset = 0
        digest = None
        while True:
            pack, _ = M.build_and_query_cognitive_memory(self.root, "quarzo lunare", rows, offset=offset, expected_index_hash=digest)
            result = E.bounded_memory_search_result(pack, 4096, 3)
            self.assertTrue(result["selected_nodes"])
            seen.extend(n["node_id"] for n in result["selected_nodes"])
            if not result["search_page"]["has_more"]:
                break
            offset = result["search_page"]["next_offset"]
            digest = result["index_hash"]
        self.assertEqual(len(seen), 8)
        self.assertEqual(len(set(seen)), 8)
        self.append("new quarzo lunare evidence")
        with self.assertRaisesRegex(ValueError, "CURSOR_STALE"):
            M.build_and_query_cognitive_memory(self.root, "quarzo lunare", self.records(), offset=3, expected_index_hash=digest)

    def test_cli_paging_and_dates_read_all_segments(self):
        with patch.object(E, "MAX_PRIVATE_CONVERSATION_RECORDS", 2):
            for i in range(5):
                self.append(f"quarzo lunare {i}")
            with patch.object(E, "resolve_codex_workspace", return_value=self.root):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    E.run_memory_search_command(["quarzo lunare", "--json"])
                first = json.loads(out.getvalue())
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    E.run_memory_search_command(["quarzo lunare", "--offset", str(first["search_page"]["next_offset"]), "--index-hash", first["index_hash"]])
                second = json.loads(out.getvalue())
                ids1 = {n["node_id"] for n in first["selected_nodes"]}
                self.assertFalse(ids1 & {n["node_id"] for n in second["selected_nodes"]})
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    E.run_memory_search_command(["--date", self.records()[0]["recorded_at"][:10]])
                self.assertEqual(json.loads(out.getvalue())["page"]["total_matches"], 5)

    def test_incremental_index_matches_full_rebuild(self):
        self.append("quarzo lunare first")
        first, _ = M.build_and_query_cognitive_memory(self.root, "quarzo lunare", self.records())
        self.assertEqual(first["index_update_mode"], "full")
        self.append("quarzo lunare second")
        updated, rendered = M.build_and_query_cognitive_memory(self.root, "quarzo lunare", self.records())
        self.assertEqual(updated["index_update_mode"], "incremental")
        self.assertEqual(updated["index_updated_node_count"], 1)
        rebuilt, _ = M.build_and_query_cognitive_memory(self.root, "quarzo lunare", self.records(), database_path=self.root / "rebuilt.sqlite3")
        self.assertEqual(updated["index_hash"], rebuilt["index_hash"])
        self.assertEqual(updated["selected_nodes"], rebuilt["selected_nodes"])
        self.assertEqual(updated["selected_edges"], rebuilt["selected_edges"])
        self.assertIn(updated["pack_hash"], rendered)

    def test_metrics_distinguish_empty_results_from_unreadable_output(self):
        self.assertEqual(E.parse_memory_search_readback("/some/workspace/cortex memory search example", '{"selected_nodes":[]}'), (True, 0))
        self.assertEqual(E.parse_memory_search_readback("./cortex memory search example", 'not json'), (True, None))
        self.assertEqual(E.parse_memory_search_readback("cat some_file", 'text'), (False, None))

    def test_cursor_binds_graph_metadata_not_only_document_content(self):
        self.graph([("md-os/kb/example.md", "quarzo lunare", "quarzo lunare evidence")])
        first, _ = M.build_and_query_cognitive_memory(self.root, "quarzo lunare", [])
        file = self.root / M.SEMANTIC_GRAPH_RELATIVE_PATH
        graph = json.loads(file.read_text())
        graph["nodes"][0]["title"] = "A different retrieval title"
        file.write_text(json.dumps(graph))
        with self.assertRaisesRegex(ValueError, "CURSOR_STALE"):
            M.build_and_query_cognitive_memory(self.root, "quarzo lunare", [], offset=1, expected_index_hash=first["index_hash"])

    def test_lexical_pages_do_not_silently_include_unpageable_graph_neighbors(self):
        self.append("quarzo lunare")
        with patch.object(M, "_expand_tensor_neighbors", side_effect=AssertionError("lexical page used advisory expansion")):
            pack, _ = M.build_and_query_cognitive_memory(self.root, "quarzo lunare", self.records(), lexical_only=True)
        self.assertEqual(pack["search_page"]["total_matches"], 1)


if __name__ == "__main__":
    unittest.main()
