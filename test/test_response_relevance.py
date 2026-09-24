"""Generic policy wiring, budget and rejection regressions."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from test_mdos_shell import ENGINE


class ResponseRelevanceTests(unittest.TestCase):
    def test_thread_instruction_preserves_effective_configuration(self):
        client = object.__new__(ENGINE.CodexAppServerClient)
        client.runtime = ENGINE.load_runtime()
        with patch.object(client, '_request', return_value={'config': {'developer_instructions': 'Preserve the existing operator rule.'}}) as request:
            params = client._thread_params(Path('/tmp'), Path('/tmp'))
        request.assert_called_once_with('config/read', {'cwd': '/tmp', 'includeLayers': False})
        self.assertEqual(params['developerInstructions'], 'Preserve the existing operator rule.\n\n' + ENGINE.render_response_relevance_contract()[0])
        self.assertEqual(params['approvalPolicy'], 'untrusted')
        self.assertEqual(params['sandbox'], 'workspace-write')
        with patch.object(client, '_request', return_value={}):
            with self.assertRaisesRegex(RuntimeError, 'CONFIG_UNAVAILABLE'):
                client._thread_params(Path('/tmp'), Path('/tmp'))

    def test_source_hash_and_no_semantic_success_claim(self):
        text, digest = ENGINE.render_response_relevance_contract()
        self.assertEqual(digest, hashlib.sha256(ENGINE.RESPONSE_RELEVANCE_PATH.read_bytes()).hexdigest())
        self.assertIn(digest, text)
        self.assertIn('not independent semantic verification', text)
        self.assertLessEqual(len(text.encode()), 1792)

    def test_fresh_reused_and_topic_change_keep_request_and_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            request = 'Explain the previous event.'
            packet, metrics = ENGINE.build_native_codex_input(request, None, workspace=root, return_metrics=True)
            self.assertTrue(packet.startswith(request + '\n\n'))
            self.assertEqual(packet.count('RESPONSE RELEVANCE CONTRACT'), 1)
            session = ENGINE.ShellSession(codex_thread_id='synthetic', codex_workspace=str(root),
                codex_bootstrap_hash=metrics['bootstrap_hash'], codex_bootstrap_thread_id='synthetic',
                codex_bootstrap_workspace=str(root))
            for request in ('Continue.', 'Change topic: inspect the build failure.', 'λ' * 16000):
                packet, metrics = ENGINE.build_native_codex_input(request, session, workspace=root, return_metrics=True)
                self.assertTrue(packet.startswith(request + '\n\n'))
                self.assertEqual(packet.count(request), 1)
                self.assertEqual(packet.count('RESPONSE RELEVANCE CONTRACT'), 1)
                self.assertEqual(metrics['response_relevance_contract_hash'], ENGINE.render_response_relevance_contract()[1])
                self.assertLessEqual(metrics['auxiliary_bytes'], ENGINE.MAX_ORDINARY_AUX_CONTEXT_CHARS)
                self.assertFalse(metrics['bootstrap_sent'])

    def test_steering_is_verbatim_with_same_policy(self):
        request = 'Use only the second source.\nPreserve uncertainty.'
        self.assertEqual(ENGINE.build_relevance_steering_input(request),
                         request + '\n\n' + ENGINE.render_response_relevance_contract()[0])

    def test_invalid_or_missing_policy_cannot_silently_disable_check(self):
        original = json.loads(ENGINE.RESPONSE_RELEVANCE_PATH.read_text())
        cases = [[], {}, {**original, 'schema_version': True}, {**original, 'extra': 1},
                 {**original, 'rules': {}}, {**original, 'rules': {**original['rules'], 'response_check': ''}},
                 {**original, 'rules': {**original['rules'], 'response_check': 'x' * 321}},
                 {**original, 'rules': {**original['rules'], 'response_check': 'é'}}]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'policy.json'
            with patch.object(ENGINE, 'RESPONSE_RELEVANCE_PATH', source):
                for value in cases:
                    source.write_text(json.dumps(value))
                    with self.subTest(value=value), self.assertRaisesRegex(RuntimeError, 'CONTRACT_INVALID'):
                        ENGINE.render_response_relevance_contract()
                for raw in ('{', ' ' * 2049):
                    source.write_text(raw)
                    with self.assertRaisesRegex(RuntimeError, 'CONTRACT_INVALID'):
                        ENGINE.render_response_relevance_contract()
                source.unlink()
                with self.assertRaisesRegex(RuntimeError, 'CONTRACT_INVALID'):
                    ENGINE.build_relevance_steering_input('Continue.')

    def test_policy_changes_are_reloaded_and_hash_bound(self):
        policy = json.loads(ENGINE.RESPONSE_RELEVANCE_PATH.read_text())
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'policy.json'
            source.write_text(json.dumps(policy))
            with patch.object(ENGINE, 'RESPONSE_RELEVANCE_PATH', source):
                before = ENGINE.render_response_relevance_contract()[1]
                policy['rules']['response_check'] = 'Retain only relevant supported conclusions.'
                source.write_text(json.dumps(policy))
                after = ENGINE.render_response_relevance_contract()[1]
                self.assertNotEqual(before, after)
                self.assertIn(policy['rules']['response_check'], ENGINE.build_relevance_steering_input('Continue.'))


if __name__ == '__main__':
    unittest.main()
