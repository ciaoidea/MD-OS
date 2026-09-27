"""Workspace-local procedural discovery. No transcript, provider call or promotion.

Catalogs are derived in memory from existing skills, maintained manuals, patterns
and explicitly registered documents. Selection proves source review, not semantic
understanding, authorization or task success.
"""
from collections import Counter
from hashlib import sha256
from pathlib import Path
import json
import math
import re
import unicodedata

VERSION = 1
MAX_FILES = 1024
MAX_SOURCE_BYTES = 262144
MAX_TOTAL_BYTES = 16 * 1024 * 1024
REGISTRIES = ('md-os/procedures/registry.json', 'md-os/ops/local/cortex/procedure_registry.json')
_CACHE = {}
STOP = set('a ad al alla alle allo ai agli anche che chi ci con da dal dalla dalle dei del della delle di e ed è gli ha hai ho i il in la le lo ma mi nel nella nelle no non o per più poi quale quali questo questa se si su sul sulla the to of and or for with is are please check show get stato status controlla controllare controllo verifica verificare mostra leggi leggere aggiorna aggiornare apri aprire procedura procedure preparazione preparation istruzioni instructions servizio service ticket caso case come how'.split())


def digest(value):
    return sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def json_hash(value):
    return digest(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')))


def tokens(text):
    text = ''.join(c for c in unicodedata.normalize('NFKD', str(text).casefold()) if not unicodedata.combining(c))
    return {t for t in re.findall(r'[a-z0-9]{3,}', text) if t not in STOP}


def safe_file(root, relative, *, private=False):
    if not isinstance(relative, str) or len(relative) > 512 or not relative.startswith('md-os/') or '\\' in relative:
        raise ValueError('PROCEDURE_SOURCE_PATH_INVALID')
    parts = Path(relative).parts
    if any(part in ('.', '..') or part.startswith('.') for part in parts):
        raise ValueError('PROCEDURE_SOURCE_PATH_INVALID')
    if relative.startswith('md-os/ops/local/') and not private:
        raise ValueError('PROCEDURE_PRIVATE_SOURCE_NOT_REGISTERED')
    path = root / relative
    if path.is_symlink() or path.resolve() != path.absolute() or not path.resolve().is_relative_to(root):
        raise ValueError('PROCEDURE_SOURCE_PATH_ESCAPE')
    return path


def read_source(root, relative, *, private=False):
    path = safe_file(root, relative, private=private)
    stat = path.stat()
    if not path.is_file() or stat.st_size > MAX_SOURCE_BYTES:
        raise ValueError('PROCEDURE_SOURCE_BOUND')
    key = (str(path), stat.st_mtime_ns, stat.st_ctime_ns, stat.st_size, stat.st_ino)
    cached = _CACHE.get(key)
    if cached is None:
        data = path.read_bytes()
        if len(data) > MAX_SOURCE_BYTES:
            raise ValueError('PROCEDURE_SOURCE_BOUND')
        cached = (data.decode('utf-8'), digest(data))
        if len(_CACHE) >= 2048:
            _CACHE.clear()
        _CACHE[key] = cached
    return cached


def strings(value, maximum=32):
    return [str(x)[:1024] for x in value[:maximum] if isinstance(x, str)] if isinstance(value, list) else []


def _entry(relative, content, source_hash, kind, value=None, *, private=False, fragment=None):
    value = value or {}
    title = value.get('title') or value.get('principle') or next((line.lstrip('# ').strip() for line in content.splitlines() if line.startswith('# ')), Path(relative).stem)
    operations = value.get('operations', [])
    if not isinstance(operations, list) or len(operations) > 32:
        raise ValueError('PROCEDURE_OPERATIONS_INVALID')
    operation_ids = set()
    for op in operations:
        if not isinstance(op, dict) or set(op) - {'operation_id', 'effect', 'verification_status', 'evidence_refs', 'state_guards'} or not isinstance(op.get('operation_id'), str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', op['operation_id']):
            raise ValueError('PROCEDURE_OPERATION_INVALID')
        if op['operation_id'] in operation_ids:
            raise ValueError('PROCEDURE_DUPLICATE_OPERATION')
        operation_ids.add(op['operation_id'])
        if op.get('effect') not in ('read', 'prepare', 'write', 'unknown'):
            raise ValueError('PROCEDURE_EFFECT_INVALID')
        if op.get('verification_status', 'unverified') not in ('unverified', 'observed', 'verified', 'stale', 'revoked'):
            raise ValueError('PROCEDURE_VERIFICATION_INVALID')
    reference = relative + ('#' + fragment if fragment else '')
    # Only working-pattern material is exposed from an anchor container.
    body = json.dumps(value, ensure_ascii=False, indent=2) if fragment else content
    metadata = ' '.join([str(title), str(value.get('description', '')), ' '.join(strings(value.get('aliases'))), ' '.join(strings(value.get('tools'))), Path(relative).stem.replace('_', ' ')])
    references = strings(value.get('source_refs'))
    declared = value.get('private_procedure')
    if isinstance(declared, str) and declared.startswith('md-os/') and declared.endswith('.md'):
        references.append(declared)
    return {'procedure_id': 'proc_' + digest(reference)[:20], 'source_ref': relative,
            'source_hash': source_hash, 'fragment': fragment, 'title': str(title)[:200],
            'kind': kind, 'status': str(value.get('status') or ('documented' if kind == 'manual' else 'candidate')),
            'private': private, 'operations': operations, 'preconditions': strings(value.get('preconditions') or value.get('conditions')),
            'evidence_refs': strings(value.get('evals')) + strings(value.get('source_episodes')),
            'references': sorted(set(references)), 'verification_scope': str(value.get('verification_scope', 'Not established by discovery'))[:1024],
            '_metadata_tokens': tokens(metadata), '_tokens': tokens(metadata + ' ' + body[:65536]), '_body': body}


def catalog(workspace):
    root = Path(workspace).resolve()
    entries, issues, bindings = [], [], {}
    paths = set()
    for directory, pattern in [('md-os/ops/skills/candidates', '*.json'), ('md-os/ops/skills/promoted', '*.json'), ('md-os/ops/sources/manual', '*.md')]:
        try:
            folder = safe_file(root, directory)
            if not folder.exists():
                continue
            for path in folder.glob(pattern):
                paths.add(path.relative_to(root).as_posix())
        except (ValueError, OSError):
            issues.append({'source_ref': directory, 'code': 'source_directory_unavailable'})
    descriptors = {}
    for relative in REGISTRIES:
        try:
            path = safe_file(root, relative, private=True)
            if not path.exists():
                continue
            text, h = read_source(root, relative, private=True); bindings[relative] = h
            value = json.loads(text)
            if not isinstance(value, dict) or set(value) != {'schema_version', 'procedures'} or value.get('schema_version') != 1 or not isinstance(value.get('procedures'), list) or len(value['procedures']) > MAX_FILES:
                raise ValueError('PROCEDURE_REGISTRY_INVALID')
            pending = {}
            for row in value['procedures']:
                if not isinstance(row, dict) or set(row) - {'source_ref', 'title', 'description', 'aliases', 'operations'} or not isinstance(row.get('source_ref'), str):
                    raise ValueError('PROCEDURE_DESCRIPTOR_INVALID')
                ref = row['source_ref']; private = ref.startswith('md-os/ops/local/')
                if private and relative != REGISTRIES[1]:
                    raise ValueError('PROCEDURE_PUBLIC_REGISTRY_PRIVATE_REFERENCE')
                safe_file(root, ref, private=private)
                if Path(ref).suffix not in ('.md', '.json'):
                    raise ValueError('PROCEDURE_DOCUMENT_TYPE_INVALID')
                if ref in descriptors or ref in pending:
                    raise ValueError('PROCEDURE_DUPLICATE_DESCRIPTOR')
                for key, bound in [('title', 200), ('description', 2048)]:
                    if key in row and (not isinstance(row[key], str) or len(row[key]) > bound):
                        raise ValueError('PROCEDURE_DESCRIPTOR_INVALID')
                if 'aliases' in row and (not isinstance(row['aliases'], list) or len(row['aliases']) > 32 or any(not isinstance(v, str) or len(v) > 120 for v in row['aliases'])):
                    raise ValueError('PROCEDURE_DESCRIPTOR_INVALID')
                pending[ref] = row
            descriptors.update(pending); paths.update(pending)
        except (ValueError, OSError, UnicodeError) as error:
            issues.append({'source_ref': relative, 'code': str(error)[:100] if isinstance(error, ValueError) else 'unreadable'})
    if len(paths) > MAX_FILES:
        issues.append({'code': 'file_limit'}); paths = set(sorted(paths)[:MAX_FILES])
    consumed = 0
    for relative in sorted(paths):
        try:
            private = relative.startswith('md-os/ops/local/')
            text, h = read_source(root, relative, private=private); consumed += len(text.encode())
            if consumed > MAX_TOTAL_BYTES:
                issues.append({'code': 'total_bytes_limit'}); break
            value = json.loads(text) if relative.endswith('.json') else {}
            if not isinstance(value, dict):
                raise ValueError('PROCEDURE_DOCUMENT_INVALID')
            kind = 'skill' if '/skills/' in relative else 'manual'
            if kind == 'skill' and (not value.get('skill_id') or not isinstance(value.get('procedure'), list)):
                raise ValueError('PROCEDURE_SKILL_INVALID')
            value = {**value, **descriptors.get(relative, {})}
            bindings[relative] = h
            entries.append(_entry(relative, text, h, kind, value, private=private))
        except (ValueError, OSError, UnicodeError) as error:
            issues.append({'source_ref': relative, 'code': str(error)[:100] if isinstance(error, ValueError) else 'unreadable'})
    anchor_ref = 'md-os/ops/apfc/cognitive/pathfinding/anchor_memory.json'
    if (root / anchor_ref).exists():
        try:
            text, h = read_source(root, anchor_ref); value = json.loads(text); bindings[anchor_ref] = h
            for anchor in value.get('anchors', [])[:MAX_FILES - len(entries)]:
                pattern = anchor.get('working_pattern')
                if isinstance(pattern, dict) and isinstance(anchor.get('anchor_id'), str):
                    entries.append(_entry(anchor_ref, '', h, 'pattern', {**pattern, 'status': 'candidate'}, fragment=anchor['anchor_id']))
        except (ValueError, OSError, UnicodeError, AttributeError, TypeError) as error:
            issues.append({'source_ref': anchor_ref, 'code': 'pattern_source_unavailable'})
    return {'root': root, 'entries': entries, 'issues': issues,
            'catalog_hash': json_hash({'version': VERSION, 'workspace': str(root), 'bindings': bindings, 'issues': issues})}


def card(entry):
    return {k: entry[k] for k in ('procedure_id', 'source_ref', 'source_hash', 'title', 'kind', 'status', 'private')}


def search(workspace, query, *, offset=0, expected_hash=None, limit=3):
    if not isinstance(query, str) or len(query) > 8192 or not isinstance(offset, int) or offset < 0 or not 1 <= limit <= 8:
        raise ValueError('PROCEDURE_QUERY_INVALID')
    c = catalog(workspace)
    if offset and expected_hash is None:
        raise ValueError('PROCEDURE_OFFSET_REQUIRES_CATALOG_HASH')
    if expected_hash is not None and expected_hash != c['catalog_hash']:
        raise ValueError('PROCEDURE_CURSOR_STALE')
    q = tokens(query); entries = c['entries']; df = Counter(t for e in entries for t in e['_tokens'])
    ranked = []
    for e in entries:
        overlap = q & e['_tokens']; metadata = q & e['_metadata_tokens']
        if not overlap or e['status'] in ('revoked', 'deprecated'):
            continue
        # Service names can identify an applicable source without the word procedure.
        distinctive = {t for t in overlap if df[t] <= max(2, len(entries) * .4)}
        if not metadata and not distinctive:
            continue
        score = sum(math.log((len(entries) + 1) / (df[t] + .5)) + 1 for t in overlap) + 2 * len(metadata)
        ranked.append((score, e))
    ranked.sort(key=lambda item: (-item[0], item[1]['source_ref'], item[1]['procedure_id']))
    chosen = [card(e) for _, e in ranked[offset:offset + limit]]
    next_offset = offset + len(chosen) if offset + len(chosen) < len(ranked) else None
    return {'schema_version': 1, 'mode': 'procedure_search', 'catalog_hash': c['catalog_hash'],
            'status': 'partial' if c['issues'] else 'matched' if ranked else 'no_match',
            'catalog_count': len(entries), 'issues': c['issues'][:8], 'issue_count': len(c['issues']),
            'query_hash': digest(query), 'candidates': chosen, 'total_matches': len(ranked),
            'next_offset': next_offset, 'authority': 'discovery_only',
            'coverage': 'registered_skills_maintained_manuals_patterns_and_explicit_documents'}


def read(workspace, procedure_id, source_hash, *, offset=0, maximum_chars=6000):
    if not isinstance(offset, int) or offset < 0 or not isinstance(maximum_chars, int) or not 512 <= maximum_chars <= 12000:
        raise ValueError('PROCEDURE_READ_BOUND')
    c = catalog(workspace)
    e = next((e for e in c['entries'] if e['procedure_id'] == procedure_id), None)
    if e is None:
        raise ValueError('PROCEDURE_NOT_FOUND')
    if source_hash != e['source_hash']:
        raise ValueError('PROCEDURE_SOURCE_CHANGED')
    body = e['_body']; chunk = body[offset:offset + maximum_chars]
    if offset > len(body):
        raise ValueError('PROCEDURE_OFFSET_INVALID')
    end = offset + len(chunk)
    return {'schema_version': 1, 'mode': 'procedure_read', **card(e), 'catalog_hash': c['catalog_hash'],
            'content': chunk, 'offset': offset, 'end_offset': end, 'total_chars': len(body),
            'next_offset': end if end < len(body) else None,
            'operations': e['operations'], 'preconditions': e['preconditions'], 'evidence_refs': e['evidence_refs'],
            'references': e['references'], 'verification_scope': e['verification_scope'],
            'definition_hash': json_hash({k: e[k] for k in ('source_hash', 'status', 'operations', 'preconditions', 'references')}),
            'authority': 'source_content_not_authorization'}


def validate_selection(workspace, selection, request_hash=None, *, check_conditions=True):
    if not isinstance(selection, dict) or selection.get('workspace_hash') != digest(str(Path(workspace).resolve())):
        raise ValueError('PROCEDURE_SELECTION_WORKSPACE')
    if request_hash is not None and selection.get('request_hash') != request_hash:
        raise ValueError('PROCEDURE_SELECTION_REQUEST_CHANGED')
    view = read(workspace, selection.get('procedure_id'), selection.get('source_hash'))
    if selection.get('definition_hash') != view['definition_hash']:
        raise ValueError('PROCEDURE_DEFINITION_CHANGED')
    if view['status'] in ('revoked', 'deprecated', 'stale'):
        raise ValueError('PROCEDURE_WITHDRAWN')
    operation = next((o for o in view['operations'] if o['operation_id'] == selection.get('operation')), None)
    if view['operations'] and operation is None:
        raise ValueError('PROCEDURE_OPERATION_UNKNOWN')
    if operation and operation.get('verification_status') in ('stale', 'revoked'):
        raise ValueError('PROCEDURE_OPERATION_WITHDRAWN')
    if operation and check_conditions:
        check_state_guards(Path(workspace).resolve(), operation.get('state_guards', []))
    return view


def check_state_guards(root, guards):
    if not isinstance(guards, list) or len(guards) > 16:
        raise ValueError('PROCEDURE_STATE_GUARDS_INVALID')
    for guard in guards:
        if not isinstance(guard, dict) or set(guard) - {'path', 'exists', 'sha256'} or type(guard.get('exists')) is not bool:
            raise ValueError('PROCEDURE_STATE_GUARD_INVALID')
        path = safe_file(root, guard.get('path'), private=True)
        if path.exists() != guard['exists']:
            raise ValueError('PROCEDURE_STATE_CHANGED')
        if 'sha256' in guard:
            if not guard['exists'] or not re.fullmatch(r'[a-f0-9]{64}', str(guard['sha256'])) or not path.is_file():
                raise ValueError('PROCEDURE_STATE_GUARD_INVALID')
            with path.open('rb') as stream:
                h = sha256()
                for chunk in iter(lambda: stream.read(65536), b''): h.update(chunk)
            if h.hexdigest() != guard['sha256']:
                raise ValueError('PROCEDURE_STATE_CHANGED')


class ProcedureSession:
    """Per-turn review receipts; a complete source read is enforced, not asserted."""
    def __init__(self, workspace, request):
        self.workspace = Path(workspace).resolve(); self.request = request
        self.request_hash = digest(request); self.reads = {}; self.selection = None; self.dismissals = {}; self.events = []
        self.initial = search(self.workspace, request)

    def call(self, args):
        if not isinstance(args, dict) or args.get('action') not in ('search', 'read', 'select', 'dismiss', 'status'):
            raise ValueError('PROCEDURE_ACTION_INVALID')
        action = args['action']
        allowed = {'search': {'action', 'query', 'offset', 'catalog_hash'},
                   'read': {'action', 'procedure_id', 'source_hash', 'offset'},
                   'select': {'action', 'procedure_id', 'source_hash', 'operation', 'applicability'},
                   'dismiss': {'action', 'procedure_id', 'source_hash', 'reason'},
                   'status': {'action'}}[action]
        if set(args) - allowed:
            raise ValueError('PROCEDURE_ARGUMENTS_INVALID')
        if action == 'search':
            result = search(self.workspace, args.get('query', self.request), offset=args.get('offset', 0), expected_hash=args.get('catalog_hash'))
        elif action == 'read':
            result = read(self.workspace, args.get('procedure_id'), args.get('source_hash'), offset=args.get('offset', 0))
            # A rejected oversized response must never count as delivered source review.
            if len(json.dumps(result, ensure_ascii=False).encode()) > 32768:
                raise ValueError('PROCEDURE_OUTPUT_BOUND: reduce source metadata')
            key = (result['procedure_id'], result['source_hash'], result['definition_hash']); intervals = self.reads.setdefault(key, [])
            intervals.append((result['offset'], result['end_offset']))
        elif action in ('select', 'dismiss'):
            key = (args.get('procedure_id'), args.get('source_hash'))
            result = read(self.workspace, *key)
            intervals = sorted(self.reads.get((*key, result['definition_hash']), [])); end = 0
            for start, stop in intervals:
                if start > end: break
                end = max(end, stop)
            if end < result['total_chars']:
                raise ValueError('PROCEDURE_FULL_READ_REQUIRED')
            if action == 'dismiss':
                if not isinstance(args.get('reason'), str) or not 1 <= len(args['reason'].strip()) <= 1024:
                    raise ValueError('PROCEDURE_DISMISSAL_REASON_REQUIRED')
                result = {'procedure_id': key[0], 'source_hash': key[1], 'definition_hash': result['definition_hash'],
                          'reason': args['reason'], 'status': 'reviewed_not_applicable', 'authority': 'assessment_not_verified_fact'}
                self.dismissals[key[0]] = result
                if self.selection and self.selection['procedure_id'] == key[0]: self.selection = None
            else:
                if not isinstance(args.get('operation'), str) or not 1 <= len(args['operation']) <= 120 or not isinstance(args.get('applicability'), str) or not 1 <= len(args['applicability']) <= 1024:
                    raise ValueError('PROCEDURE_APPLICABILITY_REQUIRED')
                selection = {'schema_version': 1, 'mode': 'procedure_selection', 'workspace_hash': digest(str(self.workspace)),
                             'request_hash': self.request_hash, 'procedure_id': key[0], 'source_hash': key[1],
                             'operation': args['operation'], 'applicability': args['applicability'], 'definition_hash': result['definition_hash'],
                             'review_status': 'source_reviewed', 'authorization': 'not_granted', 'outcome': 'unverified'}
                view = validate_selection(self.workspace, selection, self.request_hash)
                selection['operation_evidence'] = next((o.get('verification_status', 'unverified') for o in view['operations'] if o['operation_id'] == args['operation']), 'unspecified')
                selection['procedure_binding'] = {k: selection[k] for k in ('procedure_id', 'source_hash', 'definition_hash', 'operation', 'workspace_hash')}
                selection['selection_hash'] = json_hash(selection); self.selection = selection; result = selection
                self.dismissals.pop(key[0], None)
        else:
            result = {'selection': self.selection, 'dismissals': list(self.dismissals.values()), 'coverage': 'approval_requests_only; external_tools_observed'}
        self.events.append({'action': action, 'result_hash': json_hash(result)})
        return result

    def steer(self, request):
        # Preserve active task scope and audit events; invalidate the earlier selection.
        self.request += '\n' + request
        self.request_hash = digest(self.request)
        self.reads = {}; self.selection = None; self.dismissals = {}
        self.events.append({'action': 'request_changed', 'request_hash': self.request_hash})

    def gate(self, *, discovery=False):
        if discovery:
            return None
        if self.selection:
            try: validate_selection(self.workspace, self.selection, self.request_hash)
            except ValueError as error: return str(error)
            return None
        current = search(self.workspace, self.request)
        pending = []
        for candidate in current['candidates']:
            dismissed = self.dismissals.get(candidate['procedure_id'])
            try:
                view = read(self.workspace, candidate['procedure_id'], candidate['source_hash'])
                reviewed = dismissed and dismissed['source_hash'] == view['source_hash'] and dismissed['definition_hash'] == view['definition_hash']
            except ValueError:
                reviewed = False
            if not reviewed: pending.append(candidate)
        if pending:
            return 'PROCEDURE_REVIEW_REQUIRED: use mdos_procedure read then select, or dismiss a reviewed source with a concrete applicability reason'
        if current['status'] == 'partial':
            return 'PROCEDURE_CATALOG_INCOMPLETE: repair or inspect unavailable procedure sources first'
        return None

    def receipt(self):
        return {'schema_version': 1, 'request_hash': self.request_hash, 'initial_catalog_hash': self.initial['catalog_hash'],
                'candidate_count': self.initial['total_matches'], 'selection': self.selection, 'dismissals': list(self.dismissals.values()), 'events': self.events,
                'coverage': 'approval_requests_only; external_tools_observed', 'semantic_success': 'unverified'}


if __name__ == '__main__':
    import sys
    try:
        if len(sys.argv) != 3 or sys.argv[1] not in ('check-binding', 'check-source'):
            raise ValueError('PROCEDURE_CHECK_USAGE')
        binding = json.load(sys.stdin)
        if not isinstance(binding, dict) or set(binding) != {'procedure_id', 'source_hash', 'definition_hash', 'operation', 'workspace_hash'}:
            raise ValueError('PROCEDURE_BINDING_INVALID')
        view = validate_selection(Path(sys.argv[2]), binding, check_conditions=sys.argv[1] == 'check-binding')
        print(json.dumps({'status':'current', 'source_ref':view['source_ref'], 'source_hash':view['source_hash'], 'scope':'source_and_declared_conditions_not_authorization' if sys.argv[1] == 'check-binding' else 'source_and_definition_not_authorization'}))
    except (OSError, ValueError, TypeError, KeyError) as error:
        print(str(error), file=sys.stderr); sys.exit(65)
