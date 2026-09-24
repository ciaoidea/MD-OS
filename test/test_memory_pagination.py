"""Synthetic pagination and date-routing regressions; no imported history."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from test_mdos_shell import ENGINE


def records(count=8):
    return [dict(sequence=n, recorded_at='2030-04-05T12:00:00+02:00',
                 human_inputs=['Synthetic observation ' + str(n)],
                 assistant_response='Synthetic proposed result, not verified.',
                 event_hash=format(n, '064x')) for n in range(1, count + 1)]


class MemoryPaginationTests(unittest.TestCase):
    def query(self, args, data=None):
        output = io.StringIO()
        with patch.object(ENGINE, 'read_private_conversation_history', return_value=({'status': 'verified'}, records() if data is None else data)), contextlib.redirect_stdout(output):
            self.assertEqual(ENGINE.run_memory_search_command(args), 0)
        return json.loads(output.getvalue())

    def test_pages_reach_all_nodes_without_duplicates(self):
        after = 0
        seen = []
        while True:
            result = self.query(['--date', '2030-04-05', '--after', str(after), '--json'])
            page = result['page']
            ids = [n['conversation_sequence'] for n in result['selected_nodes']]
            self.assertLessEqual(len(ids), 3)
            self.assertEqual(page['total_matches'], 8)
            self.assertEqual(page['returned_count'], len(ids))
            seen.extend(ids)
            if not page['has_more']:
                self.assertIsNone(page['next_after'])
                break
            self.assertGreater(page['next_after'], after)
            after = page['next_after']
        self.assertEqual(seen, list(range(1, 9)))

    def test_date_only_query_and_short_date_resolve_same_records(self):
        for query in ('2030-04-05', '5/4'):
            self.assertEqual(self.query([query])['page']['date'], '2030-04-05')

    def test_ambiguous_short_date_rejected(self):
        data = records(2)
        data[1]['recorded_at'] = '2031-04-05T12:00:00+02:00'
        with self.assertRaises(SystemExit) as failure, contextlib.redirect_stderr(io.StringIO()):
            self.query(['5/4'], data)
        self.assertEqual(failure.exception.code, 64)

    def test_invalid_date_cursor_and_limit_are_rejected(self):
        for args in (['--date', '2030-02-30'], ['--date', '2030-04-05', '--after', '-1'],
                     ['--date', '2030-04-05', '--limit', '4'], ['observation', '--after', '1']):
            with self.subTest(args=args), self.assertRaises(SystemExit) as failure, contextlib.redirect_stderr(io.StringIO()):
                self.query(args)
            self.assertEqual(failure.exception.code, 64)

    def test_empty_filter_does_not_claim_missing_history(self):
        result = self.query(['absentterm', '--date', '2030-04-05'])
        self.assertEqual(result['status'], 'empty')
        self.assertEqual(result['page']['total_matches'], 0)
        self.assertFalse(result['page']['has_more'])
        self.assertFalse(result['mutation_authority'])

    def test_excerpt_truncation_keeps_a_resumable_cursor(self):
        data = records()
        for row in data: row['human_inputs'] = ['Synthetic observation ' * 160]
        result = self.query(['--date', '2030-04-05', '--max-chars', '2048'], data)
        self.assertLessEqual(len(json.dumps(result, ensure_ascii=False, sort_keys=True)), 2048)
        self.assertTrue(result['page']['has_more'])
        self.assertEqual(result['page']['next_after'], result['selected_nodes'][-1]['conversation_sequence'])
        self.assertTrue(all(n['excerpt_truncated'] for n in result['selected_nodes']))
        self.assertTrue(all(n['epistemic_status'] == 'quoted_history' for n in result['selected_nodes']))

    def test_tampered_history_is_rejected(self):
        with patch.object(ENGINE, 'read_private_conversation_history', return_value=({'status': 'rejected', 'reason': 'hash_mismatch'}, [])), self.assertRaises(SystemExit) as failure, contextlib.redirect_stderr(io.StringIO()):
            ENGINE.run_memory_search_command(['--date', '2030-04-05'])
        self.assertEqual(failure.exception.code, 65)

    def test_local_date_and_epoch_handling(self):
        self.assertEqual(ENGINE.memory_record_date({'recorded_at': '2030-04-05T00:30:00+02:00'}), '2030-04-05')
        self.assertEqual(ENGINE.memory_record_date({'recorded_at': '0'}), '1970-01-01')
        self.assertIsNone(ENGINE.memory_record_date({'recorded_at': 'invalid'}))

    def test_verified_synthetic_history_is_read_without_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'md-os').mkdir()
            with patch.dict(ENGINE.os.environ, {'MDOS_PRIVATE_CONVERSATION': 'on'}):
                for n in range(4):
                    ENGINE.append_private_conversation_turn(root, ['Synthetic input ' + str(n)], 'Synthetic answer.')
            source = root / ENGINE.PRIVATE_CONVERSATION_PATH
            before = source.read_bytes()
            date = json.loads(before.splitlines()[0])['recorded_at'][:10]
            output = io.StringIO()
            with patch.object(ENGINE, 'resolve_codex_workspace', return_value=root), contextlib.redirect_stdout(output):
                self.assertEqual(ENGINE.run_memory_search_command(['--date', date]), 0)
            self.assertEqual(json.loads(output.getvalue())['page']['total_matches'], 4)
            self.assertEqual(source.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
