"""Synthetic regression cases for discovery, source review and execution ordering."""
from pathlib import Path
import contextlib
import io
import json
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from test_mdos_shell import ENGINE as E, FakeCodex, run_console
P = E.procedure_memory_module()
ROOT = Path(__file__).resolve().parents[1]


class ProcedureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup); self.root = Path(self.tmp.name)
        self.rel = 'md-os/ops/sources/manual/aster.md'
        self.write(self.rel, '# Aster service operations\nRead current service state using the maintained connector.\n')

    def write(self, rel, value):
        path = self.root / rel; path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value if isinstance(value, str) else json.dumps(value)); return path

    def first(self, query='controlla Aster stato'):
        return P.search(self.root, query)['candidates'][0]

    def reviewed(self):
        session = P.ProcedureSession(self.root, 'controlla Aster stato'); c = self.first()
        session.call({'action':'read','procedure_id':c['procedure_id'],'source_hash':c['source_hash']})
        selection=session.call({'action':'select','procedure_id':c['procedure_id'],'source_hash':c['source_hash'],'operation':'read','applicability':'Read current state; authorization and outcome remain separate.'})
        return session, selection

    def test_natural_requests_surface_procedure_without_history_or_magic_word(self):
        for query in ['controlla Aster stato','Aster aggiornamenti','read Aster','Aster non risponde']:
            self.assertEqual(self.first(query)['source_ref'],self.rel)
        self.write('md-os/ops/local/cortex/conversation.ndjson','broken private history')
        self.assertEqual(self.first()['source_ref'],self.rel)
        self.assertFalse((self.root/'md-os/ops/local/cortex/cognitive_memory.sqlite3').exists())

    def test_source_and_unlinked_candidate_appear_without_anchor(self):
        self.write('md-os/ops/skills/candidates/skill_boreal.json',{'skill_id':'skill_boreal','title':'Boreal inspection','status':'candidate','procedure':['Inspect live state']})
        result=P.search(self.root,'controlla Boreal')
        self.assertEqual(result['candidates'][0]['status'],'candidate')
        self.assertEqual(result['authority'],'discovery_only')

    def test_native_prompt_includes_source_pointers_before_any_model_tool(self):
        packet,metrics=E.build_native_codex_input('controlla Aster stato',None,workspace=self.root,return_metrics=True)
        self.assertIn('CURRENT PROCEDURE CANDIDATES',packet); self.assertIn(self.rel,packet)
        self.assertNotIn('Read current service state using',packet)
        self.assertEqual(metrics['automatically_injected_memory_nodes'],0)
        self.assertLessEqual(len(packet.encode())-len('controlla Aster stato'.encode()),E.MAX_TURN_AUX_CONTEXT_CHARS)

    def test_unrelated_conversation_does_not_receive_procedure_cards(self):
        packet,metrics=E.build_native_codex_input('ciao',None,workspace=self.root,return_metrics=True)
        self.assertNotIn('CURRENT PROCEDURE CANDIDATES',packet)
        self.assertEqual(metrics['procedure_discovery']['candidate_count'],0)

    def test_full_read_required_and_pages_cannot_skip_conditions(self):
        self.write(self.rel,'# Aster\n'+('Synthetic context. '*800)+'\nFinal necessary condition.')
        session=P.ProcedureSession(self.root,'Aster');c=self.first();args={'procedure_id':c['procedure_id'],'source_hash':c['source_hash']}
        first=session.call({'action':'read',**args})
        with self.assertRaisesRegex(ValueError,'FULL_READ_REQUIRED'):
            session.call({'action':'select',**args,'operation':'read','applicability':'reviewed'})
        offset=first['next_offset']
        while offset is not None: offset=session.call({'action':'read',**args,'offset':offset})['next_offset']
        self.assertEqual(session.call({'action':'select',**args,'operation':'read','applicability':'reviewed'})['authorization'],'not_granted')

    def test_gate_blocks_operational_action_until_review_but_allows_discovery(self):
        session=P.ProcedureSession(self.root,'Aster')
        self.assertIn('REVIEW_REQUIRED',session.gate());self.assertIsNone(session.gate(discovery=True))
        session,selection=self.reviewed();self.assertIsNone(session.gate())
        self.assertEqual(selection['outcome'],'unverified');self.assertEqual(selection['operation_evidence'],'unspecified')

    def test_changed_source_or_request_or_workspace_cannot_reuse_selection(self):
        session,selection=self.reviewed()
        with self.assertRaisesRegex(ValueError,'REQUEST_CHANGED'):P.validate_selection(self.root,selection,'different')
        with tempfile.TemporaryDirectory() as other:
            with self.assertRaisesRegex(ValueError,'WORKSPACE'):P.validate_selection(Path(other),selection)
        self.write(self.rel,'# Aster changed procedure')
        self.assertIn('SOURCE_CHANGED',session.gate())
        self.assertIn('REVIEW_REQUIRED',P.ProcedureSession(self.root,'Aster').gate())

    def test_operation_scope_conditions_and_descriptor_changes_are_checked(self):
        self.write('md-os/ops/sources/ready.txt','ready')
        descriptor={'schema_version':1,'procedures':[{'source_ref':self.rel,'operations':[{'operation_id':'read','effect':'read','verification_status':'observed','state_guards':[{'path':'md-os/ops/sources/ready.txt','exists':True,'sha256':P.digest('ready')}]}]}]}
        self.write(P.REGISTRIES[0],descriptor);session,selection=self.reviewed()
        self.assertEqual(selection['operation_evidence'],'observed')
        self.write('md-os/ops/sources/ready.txt','changed');self.assertIn('STATE_CHANGED',session.gate())
        self.write('md-os/ops/sources/ready.txt','ready')
        descriptor['procedures'][0]['operations'][0]['verification_status']='revoked';self.write(P.REGISTRIES[0],descriptor)
        self.assertIn('DEFINITION_CHANGED',session.gate())

    def test_private_documents_need_explicit_registration_and_cannot_escape(self):
        rel='md-os/ops/local/procedures/private.md';self.write(rel,'# Boreal private procedure')
        self.assertFalse(P.search(self.root,'Boreal')['candidates'])
        self.write(P.REGISTRIES[1],{'schema_version':1,'procedures':[{'source_ref':rel}]})
        self.assertTrue(P.search(self.root,'Boreal')['candidates'][0]['private'])
        self.write(P.REGISTRIES[0],{'schema_version':1,'procedures':[{'source_ref':rel}]})
        self.assertEqual(P.search(self.root,'Boreal')['status'],'partial')
        with self.assertRaisesRegex(ValueError,'PATH'):P.safe_file(self.root,'md-os/../../outside.md')

    def test_unreadable_missing_and_symlinked_sources_are_not_absence(self):
        self.write(P.REGISTRIES[0],{'schema_version':1,'procedures':[{'source_ref':'md-os/kb/missing.md'}]})
        result=P.search(self.root,'unknown');self.assertEqual(result['status'],'partial')
        self.assertIn('INCOMPLETE',P.ProcedureSession(self.root,'unknown').gate())
        source=self.root/self.rel;source.unlink()
        with tempfile.TemporaryDirectory() as other:
            target=Path(other)/'secret.md';target.write_text('hidden');source.symlink_to(target)
            self.assertEqual(P.search(self.root,'hidden')['status'],'partial')
            self.assertFalse(P.search(self.root,'hidden')['candidates'])

    def test_cursor_is_invalidated_when_registry_changes(self):
        result=P.search(self.root,'Aster')
        self.write(P.REGISTRIES[0],{'schema_version':1,'procedures':[{'source_ref':self.rel,'title':'Aster revised'}]})
        with self.assertRaisesRegex(ValueError,'CURSOR_STALE'):P.search(self.root,'Aster',offset=1,expected_hash=result['catalog_hash'])

    def test_dynamic_tool_is_turn_bound_and_gate_actually_declines_then_accepts(self):
        client=object.__new__(E.CodexAppServerClient)
        client.active_binding=E.CodexThreadBinding('t',self.root,self.root,False,());client.active_context_turn_id='u'
        client.procedure_session=P.ProcedureSession(self.root,'Aster');client.procedure_tool_calls=0
        client.active_apfc_frame=object();replies=[];client._reply=lambda msg,val:replies.append(val);client._record_apfc_decision=lambda *args:None
        msg={'method':'item/commandExecution/requestApproval','params':{'command':'perform-operation','cwd':str(self.root)}}
        with patch.object(E,'decide_apfc_command_approval',return_value=('accept','authorized')):
            client._handle_server_request(msg);self.assertEqual(replies[-1]['decision'],'decline')
            c=self.first();params={'threadId':'t','turnId':'u','tool':'mdos_procedure'}
            self.assertFalse(client._procedure_tool({**params,'threadId':'wrong','arguments':{'action':'status'}})['success'])
            self.assertTrue(client._procedure_tool({**params,'arguments':{'action':'read','procedure_id':c['procedure_id'],'source_hash':c['source_hash']}})['success'])
            self.assertTrue(client._procedure_tool({**params,'arguments':{'action':'select','procedure_id':c['procedure_id'],'source_hash':c['source_hash'],'operation':'read','applicability':'current read'}})['success'])
            client._handle_server_request(msg);self.assertEqual(replies[-1]['decision'],'accept')

    def test_task_binding_bridge_rejects_stale_source(self):
        session,selection=self.reviewed();keys=['procedure_id','source_hash','definition_hash','operation','workspace_hash'];binding={k:selection[k] for k in keys}
        script="const m=require(process.argv[1]);try{console.log(JSON.stringify(m.checkProcedureBinding(process.argv[2],JSON.parse(process.argv[3]))))}catch(e){console.error(e.message);process.exit(1)}"
        command=['node','-e',script,str(ROOT/'md-os/kernel/cognition/procedure_binding.js'),str(self.root),json.dumps(binding)]
        self.assertEqual(subprocess.run(command,capture_output=True).returncode,0)
        self.write(self.rel,'# Aster changed')
        self.assertNotEqual(subprocess.run(command,capture_output=True).returncode,0)

    def test_native_roundtrip_registers_tool_and_records_review_scope(self):
        with FakeCodex('Source discovered.',tool_events=[{'tool':'mdos_procedure','arguments':{'action':'search','query':'Aster'}}]) as fake:
            result=run_console(['controlla Aster stato'],fake,self.root)
            self.assertEqual(result.returncode,0,result.stderr)
            reply=next(m for m in fake.protocol_requests() if m.get('id')==7000)
            self.assertTrue(reply['result']['success'])
            self.assertIn('Aster',reply['result']['contentItems'][0]['text'])
        receipt=json.loads((self.root/'md-os/ops/local/apfc/turn_receipts.ndjson').read_text().splitlines()[-1])
        self.assertEqual(receipt['procedure_selection']['semantic_success'],'unverified')
        self.assertEqual(receipt['procedure_selection']['candidate_count'],1)

    def test_oversized_undelivered_read_does_not_authorize_selection(self):
        ops=[{'operation_id':'read'+str(i),'effect':'read','evidence_refs':['x'*1024]*32} for i in range(3)]
        self.write(P.REGISTRIES[0],{'schema_version':1,'procedures':[{'source_ref':self.rel,'operations':ops}]})
        session=P.ProcedureSession(self.root,'Aster');c=self.first()
        with self.assertRaisesRegex(ValueError,'OUTPUT_BOUND'):
            session.call({'action':'read','procedure_id':c['procedure_id'],'source_hash':c['source_hash']})
        self.assertFalse(session.reads)
        with self.assertRaisesRegex(ValueError,'FULL_READ_REQUIRED'):
            session.call({'action':'select','procedure_id':c['procedure_id'],'source_hash':c['source_hash'],'operation':'read0','applicability':'current'})

    def test_descriptor_change_requires_another_delivered_read(self):
        session,selection=self.reviewed()
        self.write(P.REGISTRIES[0],{'schema_version':1,'procedures':[{'source_ref':self.rel,'operations':[{'operation_id':'read','effect':'read'}]}]})
        with self.assertRaisesRegex(ValueError,'FULL_READ_REQUIRED'):
            session.call({'action':'select','procedure_id':selection['procedure_id'],'source_hash':selection['source_hash'],'operation':'read','applicability':'old review'})

    def test_steering_invalidates_selection_preserves_request_and_audit(self):
        session,selection=self.reviewed();old_count=len(session.events)
        session.steer('aggiungi anche i test')
        self.assertIsNone(session.selection);self.assertFalse(session.reads)
        self.assertGreater(len(session.events),old_count)
        self.assertIn('Aster',session.request);self.assertIn('REVIEW_REQUIRED',session.gate())
        self.assertNotEqual(selection['request_hash'],session.request_hash)

    def test_malformed_anchor_registry_and_directory_fail_explicitly(self):
        self.write('md-os/ops/apfc/cognitive/pathfinding/anchor_memory.json',{'anchors':None})
        self.assertEqual(P.search(self.root,'Aster')['status'],'partial')
        self.write(P.REGISTRIES[0],{'schema_version':1,'procedures':[{'source_ref':self.rel,'title':False}]})
        self.assertEqual(P.search(self.root,'Aster')['status'],'partial')
        import shutil
        shutil.rmtree(self.root/'md-os/ops/sources/manual')
        with tempfile.TemporaryDirectory() as other:
            (self.root/'md-os/ops/sources/manual').symlink_to(other,target_is_directory=True)
            self.assertEqual(P.ProcedureSession(self.root,'Aster').initial['status'],'partial')

    def test_legacy_stored_thread_cannot_silently_lose_procedure_tool(self):
        with FakeCodex('unused',existing_threads={str(self.root):'old-thread'}) as fake:
            import os
            env={**os.environ,'MDOS_CODEX_BIN':str(fake.executable),'MDOS_PROMPT_COLOR':'never'}
            result=subprocess.run(['python3',str(ROOT/'md-os/shell/bin/mdos-console')],input='/resume\ncontinue\nexit\n',text=True,capture_output=True,cwd=self.root,env=env,timeout=30)
            self.assertIn('Stored thread predates the procedure interface',result.stderr)
            self.assertFalse(any(m.get('method')=='thread/resume' for m in fake.protocol_requests()))


    def test_native_call_budget_allows_complete_maximum_source_review(self):
        self.write(self.rel,'# Aster\n'+'a'*(P.MAX_SOURCE_BYTES-9))
        session=P.ProcedureSession(self.root,'Aster');c=self.first()
        client=object.__new__(E.CodexAppServerClient)
        client.active_binding=E.CodexThreadBinding('t',self.root,self.root,False,())
        client.active_context_turn_id='u';client.procedure_session=session;client.procedure_tool_calls=0
        params={'threadId':'t','turnId':'u','tool':'mdos_procedure'};offset=0
        while offset is not None:
            result=client._procedure_tool({**params,'arguments':{'action':'read','procedure_id':c['procedure_id'],'source_hash':c['source_hash'],'offset':offset}})
            self.assertTrue(result['success'],result)
            offset=json.loads(result['contentItems'][0]['text'])['next_offset']
        result=client._procedure_tool({**params,'arguments':{'action':'select','procedure_id':c['procedure_id'],'source_hash':c['source_hash'],'operation':'read','applicability':'all pages received'}})
        self.assertTrue(result['success'],result);self.assertGreater(client.procedure_tool_calls,32)

    def test_inapplicable_source_requires_review_and_reason_before_exploration(self):
        session=P.ProcedureSession(self.root,'Aster');c=self.first()
        args={'action':'dismiss','procedure_id':c['procedure_id'],'source_hash':c['source_hash'],'reason':'Status-only source does not document the requested installation.'}
        with self.assertRaisesRegex(ValueError,'FULL_READ_REQUIRED'):session.call(args)
        session.call({'action':'read','procedure_id':c['procedure_id'],'source_hash':c['source_hash']})
        with self.assertRaisesRegex(ValueError,'REASON_REQUIRED'):session.call({**args,'reason':' '})
        self.assertEqual(session.call(args)['status'],'reviewed_not_applicable')
        self.assertIsNone(session.gate());self.assertIsNone(session.selection)
        self.write(self.rel,'# Aster updated installation procedure')
        self.assertIn('REVIEW_REQUIRED',session.gate())
        session.steer('nuove condizioni');self.assertFalse(session.dismissals)


if __name__=='__main__':unittest.main()
