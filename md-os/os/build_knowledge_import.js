#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  parseLimit,
  printJson,
  sha256Json,
  sha256Text,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const IMPORT_ROOT = path.join(OPS_DIR, 'imports', 'knowledge');
const CANONICAL_IMPORT_ROOT = path.join(MDOS_ROOT, 'kb', 'imports');
const SEMANTIC_SUMMARY = path.join(OPS_DIR, 'semantic_knowledge_summary.json');
const MAX_FILES = parseLimit(process.env.MDOS_KNOWLEDGE_IMPORT_MAX_FILES, 2000) || 2000;
const MAX_TEXT_BYTES = parseLimit(process.env.MDOS_KNOWLEDGE_IMPORT_MAX_TEXT_BYTES, 65536) || 65536;
const MAX_RELATIONS = parseLimit(process.env.MDOS_KNOWLEDGE_IMPORT_MAX_RELATIONS, 500) || 500;
const MAX_EXTRACTED_FILES = parseLimit(process.env.MDOS_KNOWLEDGE_IMPORT_MAX_EXTRACTED_FILES, 250) || 250;
const THEORY_SOURCE_RAW_COPY_EXTENSIONS = [
  '.bib',
  '.bst',
  '.cls',
  '.dot',
  '.eps',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.svg',
  '.tex',
  '.zip',
];
const THEORY_SOURCE_RAW_COPY_SUFFIXES = ['.schema.json'];
const THEORY_ARTIFACT_PACKAGE_DIRS = [
  'mcp/ops/artifacts/packages',
  'md-os/ops/artifacts/packages',
];
const ROOT_IDENTITY_PATCH_TARGETS = [
  'AGENTS.md',
  'ME.md',
  'README.md',
  'bootstrap-md-os-codex.sh',
  'md-os/kb/COGNITIVE_BOOTSTRAP.md',
  'md-os/kb/AGENTIC_CORE_MODEL.md',
  'md-os/kb/AGENTIC_OPERATIONAL_RELEASE_MODEL.md',
  'md-os/kb/RELEASE_VERSION_NAMING_MODEL.md',
];
const APPLICATION_LAYER_EXTENSIONS = new Set([
  '.csv',
  '.json',
  '.md',
  '.ndjson',
  '.toml',
  '.txt',
  '.yaml',
  '.yml',
]);
const APPLICATION_LAYER_ROOTS = [
  'md-os/ops/programs/',
  'md-os/ops/projects/',
  'md-os/ops/connectors/',
  'md-os/ops/policies/',
  'md-os/ops/calculations/',
  'md-os/ops/roles/',
  'md-os/ops/sources/',
  'md-os/ops/evals/',
  'md-os/ops/actions/',
  'md-os/ops/processes/',
  'md-os/ops/releases/self/proposals/',
];
const FORBIDDEN_INITIAL_OPS_ROOTS = [
  'md-os/ops/agenda/',
  'md-os/ops/archive/',
  'md-os/ops/artifacts/',
  'md-os/ops/compiled/',
  'md-os/ops/core/',
  'md-os/ops/imports/',
  'md-os/ops/local/',
  'md-os/ops/locks/',
  'md-os/ops/services/',
  'md-os/ops/summary/',
];
const LEGACY_HOST_RUNTIME_FIELD = ['reference', 'host', 'runtime'].join('_');

const SKIPPED_DIRS = new Set([
  '.cache',
  '.git',
  '.hg',
  '.svn',
  '.venv',
  '__pycache__',
  'build',
  'dist',
  'node_modules',
  'unsafe',
  'target',
  'venv',
]);

const TEXT_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cfg',
  '.conf',
  '.cpp',
  '.csv',
  '.css',
  '.go',
  '.h',
  '.html',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.tex',
  '.svg',
  '.xml',
  '.yaml',
  '.yml',
]);

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'md',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function readTextSafe(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return fallback;
  }
}

function readTextPrefix(filePath, maxBytes = MAX_TEXT_BYTES) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function isTextFile(filePath, extension, sizeBytes) {
  if (TEXT_EXTENSIONS.has(extension)) return true;
  if (sizeBytes > MAX_TEXT_BYTES) return false;
  try {
    const prefix = readTextPrefix(filePath, Math.min(sizeBytes, 4096));
    return !prefix.includes('\u0000');
  } catch (_) {
    return false;
  }
}

function normalizeTerm(value) {
  return shortText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_ -]+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function termsFromText(text) {
  const terms = new Map();
  for (const raw of normalizeTerm(text).split(' ')) {
    const term = raw.trim();
    if (term.length < 3 || STOP_WORDS.has(term)) continue;
    terms.set(term, (terms.get(term) || 0) + 1);
  }
  return Array.from(terms.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .map(([term]) => term)
    .slice(0, 16);
}

function titleFromText(text, fallback) {
  const heading = String(text || '').match(/^#\s+(.+)$/m);
  if (heading) return shortText(heading[1]);
  return shortText(fallback);
}

function extractJsonStringField(text, fieldName) {
  const regexp = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]+)"`);
  const match = String(text || '').match(regexp);
  return match ? shortText(match[1]) : '';
}

function extractHostRuntimeRole(text) {
  return firstNonEmpty(
    extractJsonStringField(text, 'host_runtime_role'),
    extractJsonStringField(text, LEGACY_HOST_RUNTIME_FIELD) ? 'execution_layer' : ''
  );
}

function extractActiveBoundary(text) {
  const match = String(text || '').match(/^([a-z0-9_.-]+\/)\s*=\s*active operational boundary\s*$/mi);
  return match ? shortText(match[1]) : '';
}

function extractAssignmentField(text, fieldName) {
  const regexp = new RegExp(`^\\s*${fieldName}\\s*=\\s*(.+?)\\s*$`, 'm');
  const match = String(text || '').match(regexp);
  return match ? shortText(match[1]).replace(/^`|`$/g, '') : '';
}

function headingsFromMarkdown(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{1,6})\s+(.+)$/))
    .filter(Boolean)
    .map((match) => shortText(match[2]))
    .slice(0, 20);
}

function normalizeLegacyMcpPath(relativePath) {
  const clean = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return clean.startsWith('mcp/') ? `md-os/${clean.slice('mcp/'.length)}` : clean;
}

function semanticLayerFor(file) {
  const lower = `${file.relative_path} ${file.normalized_relative_path || ''} ${file.title} ${file.terms.join(' ')}`.toLowerCase();
  if (/\b(connector|api|permission|credential|auth|tool|adapter)\b/.test(lower)) return 'connector_or_permission';
  if (file.extension === '.svg' && /\b(audit|schema|graph|gate|proof|flow)\b/.test(lower)) return 'structured_contract';
  if (/\b(science|scientific|validation|experiment|proof|theorem|derivation|falsification|hypothesis|evidence)\b/.test(lower)) return 'scientific_epistemic';
  if (/\b(release|version|migration|compatibility|rollback|changelog)\b/.test(lower)) return 'release_evolution';
  if (/\b(program|workflow|procedure|operation|runbook|script|command|task)\b/.test(lower)) return 'operational_procedure';
  if (/\b(schema|json|contract|interface|type)\b/.test(lower)) return 'structured_contract';
  if (/\b(readme|guide|manual|docs|documentation|overview)\b/.test(lower)) return 'documentation';
  if (TEXT_EXTENSIONS.has(file.extension)) return 'knowledge_source';
  return 'evidence_artifact';
}

function epistemicStatusFor(file) {
  const lower = `${file.relative_path} ${file.normalized_relative_path || ''} ${file.title} ${file.text_excerpt || ''}`.toLowerCase();
  if (!file.text_available) return 'opaque_evidence';
  if (/\b(falsified|wrong|invalid|deprecated|superseded)\b/.test(lower)) return 'requires_correction_review';
  if (/\b(theorem|proof|derivation|validated|experiment|measurement|dataset)\b/.test(lower)) return 'conditional_evidence';
  if (/\b(todo|fixme|question|unknown|unclear|draft|proposal)\b/.test(lower)) return 'open';
  if (/\b(claim|hypothesis|assumption|model|theory)\b/.test(lower)) return 'heuristic_or_conditional_claim';
  return 'imported_unverified';
}

function actionabilityFor(layer, file) {
  if (!file.text_available) return 'preserve_as_evidence';
  if (layer === 'connector_or_permission') return 'connector_or_policy_review';
  if (layer === 'scientific_epistemic') return 'epistemic_review';
  if (layer === 'release_evolution') return 'self_release_review';
  if (layer === 'operational_procedure') return 'program_or_runbook_candidate';
  if (layer === 'structured_contract') return 'schema_or_contract_candidate';
  return 'knowledge_review';
}

function classifyFile(file) {
  const semanticLayer = semanticLayerFor(file);
  const epistemicStatus = epistemicStatusFor(file);
  return {
    ...file,
    semantic_layer: semanticLayer,
    epistemic_status: epistemicStatus,
    epistemic_profile_complete: Boolean(epistemicStatus),
    actionability: actionabilityFor(semanticLayer, file),
  };
}

function collectFiles(sourceDir, targetDir) {
  const sourceReal = fs.realpathSync(sourceDir);
  const targetReal = fs.existsSync(targetDir) ? fs.realpathSync(targetDir) : path.resolve(targetDir);
  const files = [];
  const skipped = [];
  const stack = [sourceReal];

  while (stack.length) {
    if (files.length >= MAX_FILES) {
      skipped.push({ path: '[remaining]', reason: 'file_limit_reached' });
      break;
    }
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      skipped.push({ path: current, reason: `unreadable_directory:${error.code || 'unknown'}` });
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (files.length >= MAX_FILES) {
          skipped.push({ path: path.relative(sourceReal, fullPath).replace(/\\/g, '/'), reason: 'file_limit_reached' });
          continue;
        }
        const relativeDir = path.relative(sourceReal, fullPath).replace(/\\/g, '/');
        const normalizedDir = normalizeLegacyMcpPath(relativeDir);
        if (SKIPPED_DIRS.has(entry.name)) {
          skipped.push({ path: relativeDir, reason: 'ignored_directory' });
          continue;
        }
        if (isGeneratedOrLocalOpsPath(`${normalizedDir}/`)) {
          skipped.push({ path: relativeDir, reason: 'generated_or_local_runtime_directory' });
          continue;
        }
        const resolved = fs.realpathSync(fullPath);
        if (resolved === targetReal || resolved.startsWith(`${targetReal}${path.sep}`)) {
          skipped.push({ path: relativeDir, reason: 'target_import_directory' });
          continue;
        }
        if (resolved.includes(`${path.sep}md-os${path.sep}ops${path.sep}imports${path.sep}knowledge${path.sep}`)) {
          skipped.push({ path: relativeDir, reason: 'existing_import_runtime' });
          continue;
        }
        stack.push(resolved);
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= MAX_FILES) {
        skipped.push({ path: path.relative(sourceReal, fullPath).replace(/\\/g, '/'), reason: 'file_limit_reached' });
        continue;
      }
      let stats = null;
      try {
        stats = fs.statSync(fullPath);
      } catch (error) {
        skipped.push({ path: path.relative(sourceReal, fullPath).replace(/\\/g, '/'), reason: `unreadable_file:${error.code || 'unknown'}` });
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase() || '[no_ext]';
      const relativePath = path.relative(sourceReal, fullPath).replace(/\\/g, '/');
      const normalizedRelativePath = normalizeLegacyMcpPath(relativePath);
      if (isGeneratedOrLocalOpsPath(normalizedRelativePath)) {
        skipped.push({ path: relativePath, reason: 'generated_or_local_runtime_file' });
        continue;
      }
      const textAvailable = isTextFile(fullPath, extension, stats.size);
      const textPrefix = textAvailable ? readTextPrefix(fullPath) : '';
      const headings = extension === '.md' ? headingsFromMarkdown(textPrefix) : [];
      const title = titleFromText(textPrefix, entry.name);
      const terms = Array.from(new Set([
        ...termsFromText(relativePath),
        ...termsFromText(normalizedRelativePath),
        ...termsFromText(title),
        ...termsFromText(headings.join(' ')),
        ...termsFromText(textPrefix).slice(0, 10),
      ])).slice(0, 24);

      files.push({
        absolute_path_hash: sha256Text(fullPath),
        relative_path: relativePath,
        normalized_relative_path: normalizedRelativePath,
        basename: entry.name,
        extension,
        size_bytes: stats.size,
        sha256: sha256File(fullPath),
        text_available: textAvailable,
        text_truncated: textAvailable && stats.size > MAX_TEXT_BYTES,
        title,
        headings,
        terms,
        text_excerpt: textAvailable ? shortText(textPrefix).slice(0, 800) : '',
      });
    }
  }

  return {
    source_real: sourceReal,
    files: files.sort((left, right) => left.relative_path.localeCompare(right.relative_path)),
    skipped,
  };
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) counts.set(item[key], (counts.get(item[key]) || 0) + 1);
  return Object.fromEntries(Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeListValues(values) {
  return Array.from(new Set((values || [])
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)))
    .sort();
}

function normalizeExtensionValues(values) {
  return normalizeListValues(values)
    .map((value) => value.startsWith('.') ? value : `.${value}`)
    .filter((value) => value !== '.');
}

function normalizeSuffixValues(values) {
  return normalizeListValues(values)
    .map((value) => value.startsWith('.') ? value : `.${value}`)
    .filter((value) => value !== '.');
}

function buildRawCopyPolicy(options = {}) {
  const extensions = normalizeExtensionValues(options.raw_copy_extensions || []);
  const suffixes = normalizeSuffixValues(options.raw_copy_suffixes || []);
  return {
    enabled: extensions.length > 0 || suffixes.length > 0,
    extensions,
    suffixes,
    include_artifact_packages: options.include_theory_artifact_packages === true,
    managed_subdir: 'source',
  };
}

function matchesRawCopyRelativePath(relativePath, extension, policy) {
  if (!policy.enabled) return false;
  const normalizedRelativePath = String(relativePath || '').toLowerCase();
  return policy.extensions.includes(extension)
    || policy.suffixes.some((suffix) => normalizedRelativePath.endsWith(suffix));
}

function matchesRawCopyPolicy(file, policy) {
  return matchesRawCopyRelativePath(file.relative_path, file.extension, policy);
}

function collectTheoryArtifactPackageRawCopies(sourceDir, policy) {
  if (!policy.enabled || policy.include_artifact_packages !== true) return [];
  const results = [];
  const seen = new Set();
  for (const relativeDir of THEORY_ARTIFACT_PACKAGE_DIRS) {
    const absoluteDir = path.join(sourceDir, relativeDir);
    if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) continue;
    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = `${relativeDir}/${entry.name}`.replace(/\\/g, '/');
      if (seen.has(relativePath)) continue;
      const extension = path.extname(entry.name).toLowerCase() || '[no_ext]';
      if (!matchesRawCopyRelativePath(relativePath, extension, policy)) continue;
      const absolutePath = path.join(absoluteDir, entry.name);
      const stats = fs.statSync(absolutePath);
      seen.add(relativePath);
      results.push({
        relative_path: relativePath,
        extension,
        size_bytes: stats.size,
        sha256: sha256File(absolutePath),
      });
    }
  }
  return results;
}

function rawCopyPlanFile(targetRoot, file) {
  const safeRelativePath = assertSafeRelativeTarget(file.relative_path);
  return {
    source_file: file.relative_path,
    target_path: rel(path.join(targetRoot, safeRelativePath)),
    size_bytes: file.size_bytes,
    sha256: file.sha256,
  };
}

function buildRawCopyPlan(targetDir, files, policy, sourceDir) {
  const selectedByPath = new Map();
  for (const file of files.filter((item) => matchesRawCopyPolicy(item, policy))) {
    selectedByPath.set(file.relative_path, file);
  }
  for (const file of collectTheoryArtifactPackageRawCopies(sourceDir, policy)) {
    if (!selectedByPath.has(file.relative_path)) selectedByPath.set(file.relative_path, file);
  }
  const selected = Array.from(selectedByPath.values())
    .sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  const targetRoot = path.join(targetDir, 'raw', policy.managed_subdir);
  return {
    schema_version: 1,
    enabled: policy.enabled,
    managed: true,
    target_path: rel(targetRoot),
    managed_subdir: `raw/${policy.managed_subdir}/`,
    extensions: policy.extensions,
    suffixes: policy.suffixes,
    include_artifact_packages: policy.include_artifact_packages === true,
    file_count: selected.length,
    total_size_bytes: selected.reduce((sum, file) => sum + file.size_bytes, 0),
    files: selected.map((file) => rawCopyPlanFile(targetRoot, file)),
  };
}
function assertSafeRelativeTarget(relativePath) {
  const clean = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const normalized = path.posix.normalize(clean);
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || path.isAbsolute(normalized)) {
    throw new Error(`UNSAFE_RAW_COPY_PATH: ${relativePath}`);
  }
  return normalized;
}

function prioritizedExtractableFiles(files, rawCopyPlan) {
  const rawCopySources = new Set((rawCopyPlan.files || []).map((file) => file.source_file));
  return files
    .filter((file) => file.text_available)
    .map((file, index) => ({ file, index }))
    .sort((left, right) => {
      const leftRaw = rawCopySources.has(left.file.relative_path) ? 0 : 1;
      const rightRaw = rawCopySources.has(right.file.relative_path) ? 0 : 1;
      if (leftRaw !== rightRaw) return leftRaw - rightRaw;
      const leftVisualSchema = left.file.extension === '.svg' ? 0 : 1;
      const rightVisualSchema = right.file.extension === '.svg' ? 0 : 1;
      if (leftVisualSchema !== rightVisualSchema) return leftVisualSchema - rightVisualSchema;
      return left.index - right.index;
    })
    .map((item) => item.file);
}

function buildConceptIndex(files) {
  const concepts = new Map();
  for (const file of files) {
    for (const term of file.terms) {
      const current = concepts.get(term) || {
        term,
        file_count: 0,
        semantic_layers: new Set(),
        files: [],
      };
      current.file_count += 1;
      current.semantic_layers.add(file.semantic_layer);
      current.files.push(file.relative_path);
      concepts.set(term, current);
    }
  }
  return Array.from(concepts.values())
    .map((item) => ({
      term: item.term,
      file_count: item.file_count,
      semantic_layers: Array.from(item.semantic_layers).sort(),
      files: item.files.sort().slice(0, 20),
    }))
    .sort((left, right) => {
      if (right.file_count !== left.file_count) return right.file_count - left.file_count;
      return left.term.localeCompare(right.term);
    });
}

function buildConceptRelations(files) {
  const relations = new Map();
  for (const file of files) {
    const terms = file.terms.slice(0, 10).sort();
    for (let leftIndex = 0; leftIndex < terms.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < terms.length; rightIndex += 1) {
        const source = terms[leftIndex];
        const target = terms[rightIndex];
        const key = `${source}::${target}`;
        const current = relations.get(key) || {
          source_term: source,
          target_term: target,
          relation: 'co_occurs_in_import_file',
          file_count: 0,
          semantic_layers: new Set(),
          evidence_files: [],
        };
        current.file_count += 1;
        current.semantic_layers.add(file.semantic_layer);
        current.evidence_files.push(file.relative_path);
        relations.set(key, current);
      }
    }
  }
  return Array.from(relations.values())
    .map((item) => ({
      source_term: item.source_term,
      target_term: item.target_term,
      relation: item.relation,
      file_count: item.file_count,
      semantic_layers: Array.from(item.semantic_layers).sort(),
      evidence_files: Array.from(new Set(item.evidence_files)).sort().slice(0, 20),
    }))
    .sort((left, right) => {
      if (right.file_count !== left.file_count) return right.file_count - left.file_count;
      return `${left.source_term}:${left.target_term}`.localeCompare(`${right.source_term}:${right.target_term}`);
    })
    .slice(0, MAX_RELATIONS);
}

function collectMdosConceptLinks(conceptIndex) {
  const semanticSummary = readJsonSafe(SEMANTIC_SUMMARY);
  const knownTerms = new Set();
  for (const concept of Array.isArray(semanticSummary && semanticSummary.top_concepts) ? semanticSummary.top_concepts : []) {
    if (concept && concept.term) knownTerms.add(concept.term);
  }
  for (const file of fs.existsSync(path.join(MDOS_ROOT, 'kb')) ? fs.readdirSync(path.join(MDOS_ROOT, 'kb')) : []) {
    if (file.endsWith('.md')) {
      for (const term of termsFromText(file.replace(/\.md$/i, ''))) knownTerms.add(term);
    }
  }
  return conceptIndex
    .filter((concept) => knownTerms.has(concept.term))
    .slice(0, 80)
    .map((concept) => ({
      import_term: concept.term,
      relation: 'matches_existing_mdos_concept',
      file_count: concept.file_count,
      semantic_layers: concept.semantic_layers,
    }));
}

function existingSourceFile(sourceDir, relativePath) {
  const clean = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const candidates = [clean];
  if (clean.startsWith('md-os/')) candidates.push(`mcp/${clean.slice('md-os/'.length)}`);
  for (const candidate of candidates) {
    const filePath = path.join(sourceDir, candidate);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath;
  }
  return null;
}

function sourceRelativePath(sourceDir, filePath) {
  return path.relative(sourceDir, filePath).replace(/\\/g, '/');
}

function sourceEvidence(sourceDir, relativePaths) {
  return relativePaths
    .map((relativePath) => {
      const filePath = existingSourceFile(sourceDir, relativePath);
      return filePath ? {
        path: sourceRelativePath(sourceDir, filePath),
        requested_path: relativePath,
        sha256: sha256File(filePath),
      } : null;
    })
    .filter(Boolean);
}

function readSourceJsonSafe(sourceDir, relativePath) {
  const filePath = existingSourceFile(sourceDir, relativePath);
  return filePath ? readJsonSafe(filePath) : null;
}

function readSourceTextSafe(sourceDir, relativePath) {
  const filePath = existingSourceFile(sourceDir, relativePath);
  return filePath ? readTextSafe(filePath) : '';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = shortText(value || '');
    if (text) return text;
  }
  return '';
}

function detectMdosReleaseSource(sourceDir) {
  const requiredSignals = [
    'AGENTS.md',
    'ME.md',
    'md-os/kb/COGNITIVE_BOOTSTRAP.md',
    'md-os/kb/AGENTIC_OPERATIONAL_RELEASE_MODEL.md',
  ];
  const optionalSignals = [
    'package.json',
    'bootstrap-md-os-codex.sh',
    'md-os/kb/RELEASE_VERSION_NAMING_MODEL.md',
    'md-os/ops/core/agentic_core.json',
    'md-os/ops/releases/self_release_index.json',
  ];
  const presentRequired = requiredSignals.filter((relativePath) => existingSourceFile(sourceDir, relativePath));
  const presentOptional = optionalSignals.filter((relativePath) => existingSourceFile(sourceDir, relativePath));
  const hasCurrentBoundary = [...requiredSignals, ...optionalSignals].some((relativePath) => {
    if (!relativePath.startsWith('md-os/')) return false;
    const filePath = path.join(sourceDir, relativePath);
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  });
  const hasLegacyMcpBoundary = [...requiredSignals, ...optionalSignals].some((relativePath) => {
    if (!relativePath.startsWith('md-os/')) return false;
    const filePath = path.join(sourceDir, 'mcp', relativePath.slice('md-os/'.length));
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  });
  const sourceIsMdosRelease = presentRequired.includes('ME.md')
    && presentRequired.includes('md-os/kb/COGNITIVE_BOOTSTRAP.md')
    && presentRequired.length >= 3;
  return {
    source_is_mdos_release: sourceIsMdosRelease,
    source_boundary: hasCurrentBoundary ? 'md-os/' : hasLegacyMcpBoundary ? 'mcp/' : '',
    boundary_migration: hasLegacyMcpBoundary && !hasCurrentBoundary ? 'legacy_mcp_to_md_os_import' : 'none',
    confidence: sourceIsMdosRelease ? 'high' : presentRequired.length >= 2 ? 'partial' : 'none',
    present_signals: [...presentRequired, ...presentOptional].sort(),
    missing_required_signals: requiredSignals.filter((relativePath) => !presentRequired.includes(relativePath)),
  };
}

function buildImportedIdentityPatch(sourceDir, importId, createdAt) {
  const detection = detectMdosReleaseSource(sourceDir);
  const evidencePaths = [
    'AGENTS.md',
    'ME.md',
    'bootstrap-md-os-codex.sh',
    'md-os/kb/COGNITIVE_BOOTSTRAP.md',
    'md-os/kb/AGENTIC_CORE_MODEL.md',
    'md-os/kb/AGENTIC_OPERATIONAL_RELEASE_MODEL.md',
    'md-os/kb/RELEASE_VERSION_NAMING_MODEL.md',
    'md-os/ops/core/agentic_core.json',
    'md-os/ops/releases/self_release_index.json',
  ];
  const evidence = sourceEvidence(sourceDir, evidencePaths);
  const selfRelease = readSourceJsonSafe(sourceDir, 'md-os/ops/releases/self_release_index.json');
  const currentRelease = selfRelease && selfRelease.current_release || {};
  const agenticCorePayload = readSourceJsonSafe(sourceDir, 'md-os/ops/core/agentic_core.json');
  const agenticCore = agenticCorePayload && agenticCorePayload.core || {};
  const coreIdentity = agenticCore.identity || {};
  const coreReleaseIdentity = agenticCore.release_identity || {};
  const releaseModelText = readSourceTextSafe(sourceDir, 'md-os/kb/AGENTIC_OPERATIONAL_RELEASE_MODEL.md');
  const cognitiveBootstrapText = readSourceTextSafe(sourceDir, 'md-os/kb/COGNITIVE_BOOTSTRAP.md');
  const meText = readSourceTextSafe(sourceDir, 'ME.md');
  const packagePayload = readSourceJsonSafe(sourceDir, 'package.json') || {};

  const identityName = firstNonEmpty(
    currentRelease.unified_identity,
    currentRelease.identity_name,
    coreReleaseIdentity.unified_identity,
    coreReleaseIdentity.identity_name,
    coreIdentity.name,
    extractJsonStringField(releaseModelText, 'unified_identity'),
    extractJsonStringField(releaseModelText, 'identity_name'),
    extractAssignmentField(meText, 'identity_name'),
    titleFromText(meText, '')
  );
  const identityVersion = firstNonEmpty(
    currentRelease.identity_version,
    coreReleaseIdentity.identity_version,
    extractJsonStringField(releaseModelText, 'identity_version'),
    extractAssignmentField(meText, 'identity_version')
  );
  const releaseVersion = firstNonEmpty(
    currentRelease.release_version,
    coreReleaseIdentity.release_version,
    extractJsonStringField(releaseModelText, 'release_version')
  );
  const systemFamily = firstNonEmpty(
    currentRelease.system_family,
    coreReleaseIdentity.system_family,
    extractJsonStringField(releaseModelText, 'system_family'),
    extractAssignmentField(meText, 'system_family')
  );
  const repositoryReleaseLine = firstNonEmpty(
    currentRelease.repository_release_line,
    coreReleaseIdentity.repository_release_line,
    currentRelease.release_label,
    coreReleaseIdentity.release_label,
    extractJsonStringField(releaseModelText, 'repository_release_line')
  );
  const releaseSemver = firstNonEmpty(
    currentRelease.release_semver,
    coreReleaseIdentity.release_semver,
    packagePayload.version
  );
  const hostRuntimeRole = firstNonEmpty(
    currentRelease.host_runtime_role,
    currentRelease[LEGACY_HOST_RUNTIME_FIELD] ? 'execution_layer' : '',
    coreReleaseIdentity.host_runtime_role,
    coreReleaseIdentity[LEGACY_HOST_RUNTIME_FIELD] ? 'execution_layer' : '',
    extractHostRuntimeRole(releaseModelText),
    coreIdentity.host_runtime_role
  );
  const sourceActiveBoundary = firstNonEmpty(
    currentRelease.active_boundary,
    coreReleaseIdentity.current_operating_boundary,
    extractJsonStringField(releaseModelText, 'current_operating_boundary'),
    extractActiveBoundary(cognitiveBootstrapText),
    detection.source_boundary
  );
  const activeBoundary = sourceActiveBoundary === 'mcp/' ? 'md-os/' : sourceActiveBoundary;

  const targetIdentity = {
    identity_name: identityName,
    unified_identity: firstNonEmpty(currentRelease.unified_identity, coreReleaseIdentity.unified_identity, identityName),
    identity_version: identityVersion,
    release_version: releaseVersion,
    release_id: firstNonEmpty(currentRelease.release_id, coreReleaseIdentity.release_id, extractJsonStringField(releaseModelText, 'release_id')),
    release_name: firstNonEmpty(currentRelease.release_name, coreReleaseIdentity.release_name, identityName),
    identity_short_name: firstNonEmpty(currentRelease.identity_short_name, coreReleaseIdentity.identity_short_name, identityName),
    identity_id: firstNonEmpty(currentRelease.identity_id, coreReleaseIdentity.identity_id, extractJsonStringField(releaseModelText, 'identity_id')),
    system_family: systemFamily || 'MD-OS',
    repository_release_line: repositoryReleaseLine,
    package_semver: releaseSemver,
    host_runtime_role: hostRuntimeRole || 'execution_layer',
    active_boundary: activeBoundary || 'md-os/',
    source_active_boundary: sourceActiveBoundary,
  };

  const identityReadable = detection.source_is_mdos_release && Boolean(targetIdentity.identity_name);
  const patchTargets = [
    {
      target_path: 'AGENTS.md',
      operation: 'patch_identity_frame',
      deterministic_rule: 'Replace the primary repository identity name and identity-answer rules with target_identity.identity_name while preserving MD-OS boundary, host-runtime distinction, and non-claims.',
    },
    {
      target_path: 'ME.md',
      operation: 'patch_root_self_definition',
      deterministic_rule: 'Replace root self-definition identity fields and first-person description from target_identity.',
    },
    {
      target_path: 'md-os/kb/COGNITIVE_BOOTSTRAP.md',
      operation: 'patch_cognitive_bootstrap_identity_frame',
      deterministic_rule: 'Replace the Identity Frame and First-Person Voice blocks with target_identity and imported guardrails.',
    },
    {
      target_path: 'bootstrap-md-os-codex.sh',
      operation: 'patch_launcher_bootstrap_prompt',
      deterministic_rule: 'Replace launcher boot manifest and injected session frame with target_identity fields.',
    },
    {
      target_path: 'md-os/kb/AGENTIC_CORE_MODEL.md',
      operation: 'patch_compact_core_source_identity',
      deterministic_rule: 'Replace release_identity JSON fields and first_person_rule with target_identity while preserving operating policies.',
    },
    {
      target_path: 'md-os/kb/AGENTIC_OPERATIONAL_RELEASE_MODEL.md',
      operation: 'patch_release_identity_model',
      deterministic_rule: 'Replace current unified identity fields with target_identity while preserving release-line and boundary semantics unless explicitly migrated.',
    },
  ];

  return {
    schema_version: 1,
    import_id: importId,
    updated_at: createdAt,
    status: !detection.source_is_mdos_release
      ? 'not_applicable'
      : identityReadable
        ? 'requires_review'
        : 'blocked_missing_identity',
    source_detection: detection,
    source_evidence: evidence,
    target_identity: targetIdentity,
    source_personality: {
      first_person_rule: shortText(coreIdentity.first_person_rule || ''),
      mission: shortText(agenticCore.mission || ''),
      primary_identity: shortText(coreIdentity.primary_identity || ''),
      host_runtime_role: shortText(coreIdentity.host_runtime_role || ''),
      limits: Array.isArray(agenticCore.limits) ? agenticCore.limits.map(shortText).filter(Boolean).slice(0, 20) : [],
      non_claims: Array.isArray(agenticCore.non_claims) ? agenticCore.non_claims.map(shortText).filter(Boolean).slice(0, 20) : [],
      ethics: Array.isArray(agenticCore.ethics) ? agenticCore.ethics.map(shortText).filter(Boolean).slice(0, 20) : [],
    },
    bootstrap_patch_rule: {
      deterministic: true,
      direct_write_default: false,
      acceptance_required: true,
      patch_scope: 'bootstrap_identity_and_personality_frame',
      patch_targets: identityReadable ? patchTargets : [],
      template_fields: [
        'identity_name',
        'identity_version',
        'release_version',
        'release_id',
        'package_semver',
        'system_family',
        'repository_release_line',
        'host_runtime_role',
        'active_boundary',
      ],
      guardrails: [
        'Imported identity is an operating/personality frame, not proof of literal personhood, consciousness, AGI, resurrection, or factual authority.',
        'Imported claims remain imported_unverified until reviewed and promoted through the knowledge import method.',
        'The host runtime remains the execution layer and must not be hidden.',
        'The active md-os/ boundary is preserved unless an explicit self-release migration proposal changes it.',
        'Legacy imported mcp/ source boundaries are recorded as provenance and normalized to md-os/ for target bootstrap review.',
        'Package semver remains the current target package semver unless an accepted release proposal changes it.',
      ],
      acceptance_gates: [
        'human_review',
        'identity_non_claim_review',
        'source_readback',
        'node md-os/os/build_agentic_core.js',
        'node md-os/os/build_self_release_index.js',
        'node md-os/os/build_global_index.js',
        'node md-os/os/build_health_dashboard.js',
        'cortex replay',
      ],
    },
  };
}

function promotionTargetFor(file) {
  if (file.actionability === 'connector_or_policy_review') return 'md-os/kb/CONNECTOR_CONTRACT.md or md-os/kb/PERMISSION_MODEL.md';
  if (file.actionability === 'epistemic_review') return 'md-os/kb/EPISTEMIC_LIFECYCLE_MODEL.md or md-os/kb/SCIENTIFIC_VALIDATION_METHOD_MODEL.md';
  if (file.actionability === 'self_release_review') return 'md-os/kb/SELF_RELEASE_EVOLUTION_MODEL.md or md-os/ops/releases/self/proposals/';
  if (file.actionability === 'program_or_runbook_candidate') return 'md-os/ops/programs/';
  if (file.actionability === 'schema_or_contract_candidate') return 'md-os/schemas/ or md-os/kb/';
  return 'md-os/kb/ after review';
}

function buildPromotionCandidates(files, identityPatch = null) {
  const candidates = files
    .filter((file) => file.text_available)
    .filter((file) => file.terms.length || file.headings.length)
    .map((file) => ({
      source_file: file.relative_path,
      title: file.title,
      semantic_layer: file.semantic_layer,
      epistemic_status: file.epistemic_status,
      actionability: file.actionability,
      candidate_target: promotionTargetFor(file),
      reason: 'Imported material has readable terms and can be reviewed for promotion.',
    }))
    .slice(0, 100);
  if (identityPatch && identityPatch.status === 'requires_review') {
    candidates.unshift({
      source_file: 'identity_patch.json',
      title: `Imported identity patch: ${identityPatch.target_identity.identity_name}`,
      semantic_layer: 'release_evolution',
      epistemic_status: 'imported_unverified',
      actionability: 'bootstrap_identity_patch_review',
      candidate_target: 'AGENTS.md, ME.md, md-os/kb/COGNITIVE_BOOTSTRAP.md, bootstrap-md-os-codex.sh, and identity source models after acceptance',
      reason: 'Source directory is an MD-OS release with a structured identity/personality frame that can patch bootstrap identity deterministically after review.',
    });
  }
  return candidates.slice(0, 100);
}

function buildQuestions(files, skipped, permissionStatus, identityPatch = null) {
  const questions = [];
  if (permissionStatus === 'unknown' || permissionStatus === 'restricted') {
    questions.push('Is this source authorized for promotion into canonical MD-OS knowledge?');
  }
  if (skipped.length) {
    questions.push('Do skipped files or ignored directories contain required evidence?');
  }
  if (files.some((file) => file.text_truncated)) {
    questions.push('Do truncated text files need deeper extraction before promotion?');
  }
  if (files.some((file) => file.epistemic_status === 'heuristic_or_conditional_claim')) {
    questions.push('Which imported claims have enough evidence to move beyond heuristic or conditional status?');
  }
  if (files.some((file) => file.actionability === 'connector_or_policy_review')) {
    questions.push('Do connector or permission candidates require explicit capability, risk, side-effect, and rollback profiles?');
  }
  if (identityPatch && identityPatch.status === 'requires_review') {
    questions.push(`Should imported identity "${identityPatch.target_identity.identity_name}" patch the bootstrap identity frame for this repository?`);
    questions.push('What non-claims and provenance guardrails must accompany this imported identity before acceptance?');
  }
  if (!questions.length) questions.push('No blocking import questions detected; review promotion candidates before canonical edits.');
  return questions;
}

function slugId(value) {
  return shortText(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'imported_identity';
}

function relativeWorkspacePath(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function targetPathInsideWorkspace(relativePath) {
  const clean = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(WORKSPACE_ROOT, clean);
  const relative = path.relative(WORKSPACE_ROOT, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`KNOWLEDGE_IMPORT_TARGET_OUTSIDE_WORKSPACE: ${relativePath}`);
  }
  return resolved;
}

function sourceIsCurrentWorkspace(sourceDir) {
  try {
    return fs.realpathSync(sourceDir) === fs.realpathSync(WORKSPACE_ROOT);
  } catch (_) {
    return false;
  }
}

function isGeneratedOrLocalOpsPath(relativePath) {
  if (!relativePath.startsWith('md-os/ops/')) return false;
  if (FORBIDDEN_INITIAL_OPS_ROOTS.some((root) => relativePath.startsWith(root))) return true;
  if (/^md-os\/ops\/projects\/[^/]+\/(?:status|agenda|relations|priority_queue|active_memory)\.(?:json|md)$/.test(relativePath)) return true;
  if (/^md-os\/ops\/projects\/[^/]+\/work_items\.ndjson$/.test(relativePath)) return true;
  if (/^md-os\/ops\/roles\/[^/]+\/intake\/(?:inventory|task_map|questions_for_expert|candidate_operations)\.(?:json|md)$/.test(relativePath)) return true;
  if (/^md-os\/ops\/roles\/[^/]+\/intake\/entities\.json$/.test(relativePath)) return true;
  if (/^md-os\/ops\/(?:global_index|health|health_classification|markdown_graph|replay_report|runtime_lifecycle_index|semantic_knowledge_graph|semantic_knowledge_summary|system_hygiene_status|workspace_inventory)\.(?:json|md)$/.test(relativePath)) return true;
  if (/^md-os\/ops\/releases\/self_release_index\.(?:json|md)$/.test(relativePath)) return true;
  return false;
}

function applicationLayerRoleFor(relativePath, extension) {
  if (isGeneratedOrLocalOpsPath(relativePath)) return null;
  if (relativePath.startsWith('md-os/ops/programs/') && extension === '.md') return 'natural_language_program_source';
  if (/^md-os\/ops\/projects\/[^/]+\/project\.json$/.test(relativePath)) return 'project_definition_source';
  if (relativePath === 'md-os/ops/connectors/connector_registry.json') return 'connector_registry_source';
  if (relativePath.startsWith('md-os/ops/connectors/') && extension === '.json') return 'connector_profile_source';
  if (relativePath.startsWith('md-os/ops/policies/') && extension === '.json') return 'policy_source';
  if (relativePath.startsWith('md-os/ops/calculations/') && APPLICATION_LAYER_EXTENSIONS.has(extension)) return 'calculation_profile_or_script_source';
  if (relativePath.startsWith('md-os/ops/roles/') && APPLICATION_LAYER_EXTENSIONS.has(extension)) return 'role_operating_source';
  if (relativePath.startsWith('md-os/ops/sources/') && APPLICATION_LAYER_EXTENSIONS.has(extension)) return 'operational_source_observation';
  if (relativePath.startsWith('md-os/ops/evals/') && APPLICATION_LAYER_EXTENSIONS.has(extension)) return 'evaluation_source';
  if (relativePath.startsWith('md-os/ops/actions/') && APPLICATION_LAYER_EXTENSIONS.has(extension)) return 'action_source';
  if (relativePath.startsWith('md-os/ops/processes/') && APPLICATION_LAYER_EXTENSIONS.has(extension)) return 'process_source';
  if (relativePath.startsWith('md-os/ops/releases/self/proposals/') && extension === '.json') return 'self_release_proposal_source';
  return null;
}

function initialAssimilationTargetFor(file) {
  const relativePath = normalizeLegacyMcpPath(file.relative_path);
  const extension = file.extension;
  if (ROOT_IDENTITY_PATCH_TARGETS.includes(relativePath)) {
    return {
      target_path: relativePath,
      role: 'bootstrap_identity_source',
      write_policy: 'identity_patch_template',
    };
  }
  if (relativePath.startsWith('md-os/kb/imports/')) return null;
  if (relativePath.startsWith('md-os/kb/') && extension === '.md') {
    return {
      target_path: relativePath,
      role: 'canonical_knowledge_source',
      write_policy: 'path_preserving_copy_before_identity_patch',
    };
  }
  if (relativePath.startsWith('docs/') && ['.md', '.svg', '.png', '.tex'].includes(extension)) {
    return {
      target_path: relativePath,
      role: 'publishable_documentation_source',
      write_policy: 'path_preserving_copy',
    };
  }
  if (relativePath.startsWith('md-os/schemas/') && extension === '.json') {
    return {
      target_path: relativePath,
      role: 'schema_contract_source',
      write_policy: 'path_preserving_copy',
    };
  }
  if (relativePath.startsWith('md-os/examples/') && APPLICATION_LAYER_EXTENSIONS.has(extension)) {
    return {
      target_path: relativePath,
      role: 'example_application_source',
      write_policy: 'path_preserving_copy',
    };
  }
  const applicationLayerRole = applicationLayerRoleFor(relativePath, extension);
  if (applicationLayerRole) {
    return {
      target_path: relativePath,
      role: applicationLayerRole,
      write_policy: 'path_preserving_copy',
    };
  }
  return null;
}

function buildInitialAssimilationPlan(classifiedFiles, identityPatch, options = {}) {
  const initialRepository = options.initial_repository === true;
  const candidates = initialRepository
    ? classifiedFiles
      .map((file) => {
        const target = initialAssimilationTargetFor(file);
        if (!target) return null;
        return {
          source_file: file.relative_path,
          source_sha256: file.sha256,
          target_path: target.target_path,
          role: target.role,
          write_policy: target.write_policy,
          semantic_layer: file.semantic_layer,
          epistemic_status: file.epistemic_status,
          text_available: file.text_available,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.target_path.localeCompare(right.target_path))
    : [];
  const identityReadable = identityPatch && identityPatch.status === 'requires_review';
  const operationalCandidates = candidates.filter((candidate) => candidate.target_path.startsWith('md-os/ops/'));
  return {
    schema_version: 1,
    mode: initialRepository ? 'initial_repository' : 'structured_import',
    enabled: initialRepository,
    source_must_be_mdos_release_for_identity_application: true,
    direct_bootstrap_write: initialRepository && identityReadable,
    canonical_tree_write: true,
    path_preserving_source_write: initialRepository,
    operational_application_layer: {
      included: initialRepository,
      candidate_count: operationalCandidates.length,
      source_roots: APPLICATION_LAYER_ROOTS,
      excluded_roots: FORBIDDEN_INITIAL_OPS_ROOTS,
      rule: 'Import source-like MD-OS operating application state, not generated readback, host-local cache, locks, services, or artifacts.',
    },
    candidate_count: candidates.length,
    candidates,
    applied_by_default: initialRepository,
    skipped_reason: initialRepository ? '' : 'standard_import_keeps_primary_bootstrap_unchanged',
  };
}

function renderCanonicalImportReadme(payload) {
  const manifest = payload.manifest;
  const readback = payload.readback;
  const identityPatch = payload.identity_patch;
  const plan = payload.canonical_import.assimilation_plan;
  const lines = [
    `# Imported Knowledge: ${manifest.import_id}`,
    '',
    'This directory is the canonical MD-OS knowledge-tree representation of the import.',
    'Runtime audit/readback remains under `md-os/ops/imports/knowledge/`, but this',
    'tree is source knowledge under `md-os/kb/` and is included in the ordinary',
    'Markdown and semantic knowledge graph.',
    '',
    '## Source',
    '',
    `- source location: \`${manifest.source_location}\``,
    `- source kind: \`${manifest.source_kind}\``,
    `- source access: \`${manifest.source_access}\``,
    `- permission status: \`${manifest.permission_status}\``,
    `- files profiled: \`${readback.file_count}\``,
    `- text files: \`${readback.text_file_count}\``,
    '',
    '## Identity Import',
    '',
    `- imported MD-OS release: \`${readback.imported_mdos_release}\``,
    `- identity patch status: \`${readback.identity_patch_status}\``,
    `- imported identity: \`${readback.imported_identity_name || ''}\``,
    `- imported identity version: \`${readback.imported_identity_version || ''}\``,
    `- source identity artifact: [IDENTITY_FRAME.md](IDENTITY_FRAME.md)`,
    '',
    '## Canonical Assimilation',
    '',
    `- mode: \`${plan.mode}\``,
    `- direct bootstrap write: \`${plan.direct_bootstrap_write}\``,
    `- path-preserving source write: \`${plan.path_preserving_source_write}\``,
    `- assimilation candidates: \`${plan.candidate_count}\``,
    `- operational application candidates: \`${plan.operational_application_layer.candidate_count}\``,
    '',
    '## Nodes',
    '',
    '- [SOURCE_MANIFEST.md](SOURCE_MANIFEST.md)',
    '- [KNOWLEDGE_NODES.md](KNOWLEDGE_NODES.md)',
    '- [RELATIONS.md](RELATIONS.md)',
    '- [IDENTITY_FRAME.md](IDENTITY_FRAME.md)',
    '- [OPERATING_BINDING.md](OPERATING_BINDING.md)',
    '',
    '## Epistemic Rule',
    '',
    'Imported claims remain imported knowledge until reviewed, related, and accepted.',
    'Initial-repository mode may apply identity and path-preserving source files,',
    'but generated runtime readback must still be rebuilt from the resulting tree.',
    '',
  ];
  if (identityPatch.status === 'requires_review') {
    lines.push(`Imported identity target: \`${identityPatch.target_identity.identity_name}\`.`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function renderCanonicalSourceManifest(payload) {
  const manifest = payload.manifest;
  const inventory = payload.inventory;
  const lines = [
    '# Import Source Manifest',
    '',
    `Import id: \`${manifest.import_id}\``,
    `Created at: \`${manifest.created_at}\``,
    `Source: \`${manifest.source_location}\``,
    '',
    '## Manifest',
    '',
    '```json',
    JSON.stringify(manifest, null, 2),
    '```',
    '',
    '## Files',
    '',
  ];
  for (const file of inventory.files.slice(0, 500)) {
    lines.push(`- \`${file.relative_path}\` | sha256 \`${file.sha256}\` | \`${file.extension}\` | \`${file.size_bytes}\` bytes`);
  }
  if (inventory.files.length > 500) {
    lines.push(`- ... ${inventory.files.length - 500} additional file(s) omitted from compact manifest.`);
  }
  return `${lines.join('\n')}\n`;
}

function renderCanonicalKnowledgeNodes(payload) {
  const classification = payload.classification;
  const extraction = payload.extraction;
  const extractsByPath = new Map(extraction.extracts.map((item) => [item.source_file, item]));
  const lines = [
    '# Imported Knowledge Nodes',
    '',
    `Import id: \`${classification.import_id}\``,
    `Updated at: \`${classification.updated_at}\``,
    '',
    'Each source file below is represented as a structured MD-OS knowledge node',
    'with provenance, semantic layer, epistemic status, and bounded extracted text.',
    '',
  ];
  for (const file of classification.files.slice(0, 300)) {
    const extract = extractsByPath.get(file.source_file);
    lines.push(`## ${file.title || file.source_file}`);
    lines.push('');
    lines.push(`- source file: \`${file.source_file}\``);
    lines.push(`- semantic layer: \`${file.semantic_layer}\``);
    lines.push(`- epistemic status: \`${file.epistemic_status}\``);
    lines.push(`- actionability: \`${file.actionability}\``);
    if (file.terms.length) lines.push(`- terms: \`${file.terms.join('`, `')}\``);
    if (extract && extract.headings.length) lines.push(`- headings: \`${extract.headings.join('`, `')}\``);
    if (extract) {
      lines.push('');
      lines.push('```text');
      lines.push(extract.excerpt || '');
      lines.push('```');
    }
    lines.push('');
  }
  if (classification.files.length > 300) {
    lines.push(`Additional files omitted from compact canonical node view: \`${classification.files.length - 300}\`.`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function renderCanonicalRelations(payload) {
  return renderRelations(payload.relations);
}

function renderCanonicalIdentityFrame(identityPatch) {
  const lines = [
    '# Imported Identity Frame',
    '',
    `Import id: \`${identityPatch.import_id}\``,
    `Updated at: \`${identityPatch.updated_at}\``,
    '',
    `Status: \`${identityPatch.status}\``,
    `Source is MD-OS release: \`${identityPatch.source_detection.source_is_mdos_release}\``,
    '',
    '## Target Identity',
    '',
  ];
  for (const [key, value] of Object.entries(identityPatch.target_identity)) {
    lines.push(`- ${key}: \`${value || ''}\``);
  }
  lines.push('', '## Source Personality', '');
  for (const [key, value] of Object.entries(identityPatch.source_personality)) {
    if (Array.isArray(value)) {
      lines.push(`- ${key}:`);
      for (const item of value) lines.push(`  - ${item}`);
    } else {
      lines.push(`- ${key}: ${value || ''}`);
    }
  }
  lines.push('', '## Bootstrap Rule', '');
  lines.push('```json');
  lines.push(JSON.stringify(identityPatch.bootstrap_patch_rule, null, 2));
  lines.push('```', '');
  return `${lines.join('\n')}\n`;
}

function renderCanonicalOperatingBinding(canonicalImport) {
  const plan = canonicalImport.assimilation_plan;
  const lines = [
    '# Imported Operating Binding',
    '',
    `Mode: \`${plan.mode}\``,
    `Canonical tree write: \`${plan.canonical_tree_write}\``,
    `Direct bootstrap write: \`${plan.direct_bootstrap_write}\``,
    `Path-preserving source write: \`${plan.path_preserving_source_write}\``,
    `Operational application candidates: \`${plan.operational_application_layer.candidate_count}\``,
    '',
    '## Initial Repository Rule',
    '',
    'When import mode is `initial_repository`, the source MD-OS release is not',
    'kept as a detached appendix. Its allowed knowledge and operating source',
    'files are assimilated into the current repository tree, and the imported',
    'identity frame patches the active bootstrap files. Runtime/generated state',
    'must then be rebuilt by the ordinary MD-OS builders.',
    '',
    '## Operational Application Layer',
    '',
    plan.operational_application_layer.rule,
    '',
    'Included roots:',
    '',
    ...plan.operational_application_layer.source_roots.map((root) => `- \`${root}\``),
    '',
    'Excluded roots:',
    '',
    ...plan.operational_application_layer.excluded_roots.map((root) => `- \`${root}\``),
    '',
    '## Assimilation Candidates',
    '',
  ];
  if (!plan.candidates.length) {
    lines.push('- No path-preserving candidates for this import mode.');
  } else {
    for (const candidate of plan.candidates.slice(0, 300)) {
      lines.push(`- \`${candidate.source_file}\` -> \`${candidate.target_path}\` | \`${candidate.role}\` | \`${candidate.write_policy}\``);
    }
  }
  return `${lines.join('\n')}\n`;
}

function buildCanonicalImportPackage(payload, options = {}) {
  const importId = payload.manifest.import_id;
  const targetDir = path.join(CANONICAL_IMPORT_ROOT, importId);
  const assimilationPlan = buildInitialAssimilationPlan(payload.classification.files.map((file) => {
    const inventoryFile = payload.inventory.files.find((item) => item.relative_path === file.source_file) || {};
    return {
      ...file,
      relative_path: file.source_file,
      extension: inventoryFile.extension || path.extname(file.source_file).toLowerCase() || '[no_ext]',
      sha256: inventoryFile.sha256 || '',
      text_available: inventoryFile.text_available === true,
    };
  }), payload.identity_patch, options);
  return {
    schema_version: 1,
    import_id: importId,
    updated_at: payload.manifest.created_at,
    target_dir: targetDir,
    target_path: relativeWorkspacePath(targetDir),
    status: 'ready',
    source_kind: payload.manifest.source_kind,
    source_location: payload.manifest.source_location,
    knowledge_tree_role: 'canonical_imported_knowledge_source',
    assimilation_plan: assimilationPlan,
  };
}

function currentTargetIdentityReadback() {
  const releaseText = readTextSafe(path.join(MDOS_ROOT, 'kb', 'AGENTIC_OPERATIONAL_RELEASE_MODEL.md'));
  const meText = readTextSafe(path.join(WORKSPACE_ROOT, 'ME.md'));
  const packagePayload = readJsonSafe(path.join(WORKSPACE_ROOT, 'package.json')) || {};
  const identityName = firstNonEmpty(
    extractJsonStringField(releaseText, 'unified_identity'),
    extractJsonStringField(releaseText, 'identity_name'),
    extractAssignmentField(meText, 'identity_name'),
    'MD-OS APFC'
  );
  const identityVersion = firstNonEmpty(
    extractJsonStringField(releaseText, 'identity_version'),
    extractAssignmentField(meText, 'identity_version'),
    '5.0'
  );
  return {
    identity_name: identityName,
    identity_version: identityVersion,
    release_version: firstNonEmpty(extractJsonStringField(releaseText, 'release_version'), identityVersion),
    release_id: firstNonEmpty(extractJsonStringField(releaseText, 'release_id'), identityVersion.replace(/\./g, '_')),
    release_name: firstNonEmpty(extractJsonStringField(releaseText, 'release_name'), identityName),
    identity_short_name: firstNonEmpty(extractJsonStringField(releaseText, 'identity_short_name'), identityName),
    identity_id: firstNonEmpty(extractJsonStringField(releaseText, 'identity_id'), slugId(identityName)),
    package_semver: shortText(packagePayload.version || ''),
  };
}

function replaceAll(text, from, to) {
  if (!from || from === to) return text;
  return String(text || '').split(from).join(to || '');
}

function patchIdentityText(text, currentIdentity, identityPatch) {
  const target = identityPatch.target_identity;
  let patched = String(text || '');
  patched = replaceAll(patched, currentIdentity.identity_name, target.identity_name);
  patched = replaceAll(patched, currentIdentity.identity_version, target.identity_version || currentIdentity.identity_version);
  patched = replaceAll(patched, currentIdentity.release_version, target.release_version || target.identity_version || currentIdentity.release_version);
  patched = replaceAll(patched, currentIdentity.release_id, target.release_id || currentIdentity.release_id);
  patched = replaceAll(patched, currentIdentity.release_name, target.release_name || target.identity_name);
  patched = replaceAll(patched, currentIdentity.identity_short_name, target.identity_short_name || target.identity_name);
  patched = replaceAll(patched, currentIdentity.identity_id, target.identity_id || slugId(target.identity_name));
  if (currentIdentity.package_semver) {
    patched = replaceAll(patched, target.package_semver || '', currentIdentity.package_semver);
  }
  return patched;
}

function renderMinimalMe(identityPatch) {
  const identity = identityPatch.target_identity;
  return [
    `# ${identity.identity_name || 'Imported Identity'}`,
    '',
    `${identity.identity_name || 'Imported Identity'} is the current unified agentic operating identity carried by this MD-OS repository.`,
    '',
    '```text',
    `identity_name = ${identity.identity_name || ''}`,
    `identity_version = ${identity.identity_version || ''}`,
    `system_family = ${identity.system_family || 'MD-OS'}`,
    `repository_release_line = ${identity.repository_release_line || '5.0'}`,
    '```',
    '',
    'This identity is an operating/personality frame imported from a source MD-OS release. It is not a claim of literal personhood, consciousness, AGI, resurrection, or factual authority.',
    '',
  ].join('\n');
}

function renderMinimalCognitiveBootstrap(identityPatch) {
  const identity = identityPatch.target_identity;
  return [
    '# Cognitive Bootstrap',
    '',
    '## Identity Frame',
    '',
    '```text',
    `${identity.identity_name || 'Imported Identity'} = unified primary agent identity and operating context carried by this repository`,
    `${identity.system_family || 'MD-OS'} = agent operating filesystem family and cognitive operating layer`,
    `${identity.repository_release_line || '5.0'} = repository compatibility release line`,
    'host runtime = execution layer, not identity',
    `${identity.active_boundary || 'md-os/'} = active operational boundary`,
    `identity_version = ${identity.identity_version || ''}`,
    '```',
    '',
    '## First-Person Voice',
    '',
    '```text',
    `I = ${identity.identity_name || 'Imported Identity'}, the unified persistent agent identity and cognitive control plane carried by this repository.`,
    '```',
    '',
    'The host runtime remains the execution layer. The imported identity frame is operational and bounded, not a claim of consciousness, AGI, literal personhood, resurrection, or factual authority.',
    '',
  ].join('\n');
}

function renderMinimalAgents(identityPatch) {
  const identity = identityPatch.target_identity;
  return [
    'Stable repository purpose:',
    `- implement MD-OS as the Operating Filesystem release line carrying the current ${identity.identity_name || 'imported'} agent identity`,
    '- program the agent through natural-language artifacts, not only code',
    '- keep execution bounded inside `md-os/`',
    '- avoid destructive actions by default',
    '',
    'Cognitive bootstrap rules:',
    `- answer identity and operating-model questions from ${identity.identity_name || 'the imported identity'} first`,
    '- distinguish the host runtime as the execution layer',
    '- preserve MD-OS as the operating filesystem family and cognitive operating layer',
    '',
  ].join('\n');
}

function patchBootstrapTargets(identityPatch) {
  const currentIdentity = currentTargetIdentityReadback();
  const results = [];
  for (const relativePath of ROOT_IDENTITY_PATCH_TARGETS) {
    const filePath = targetPathInsideWorkspace(relativePath);
    let text = readTextSafe(filePath);
    if (!text && relativePath === 'ME.md') text = renderMinimalMe(identityPatch);
    if (!text && relativePath === 'AGENTS.md') text = renderMinimalAgents(identityPatch);
    if (!text && relativePath === 'md-os/kb/COGNITIVE_BOOTSTRAP.md') text = renderMinimalCognitiveBootstrap(identityPatch);
    if (!text) {
      results.push({ target_path: relativePath, status: 'skipped_missing_template' });
      continue;
    }
    const patched = patchIdentityText(text, currentIdentity, identityPatch);
    atomicWriteText(filePath, patched.endsWith('\n') ? patched : `${patched}\n`);
    results.push({ target_path: relativePath, status: 'patched' });
  }
  return results;
}

function writePathPreservingInitialSources(payload) {
  const sourceDir = payload.source_path;
  if (sourceIsCurrentWorkspace(sourceDir)) {
    return [{ target_path: '.', status: 'skipped_source_is_current_workspace' }];
  }
  const results = [];
  for (const candidate of payload.canonical_import.assimilation_plan.candidates) {
    if (candidate.write_policy === 'identity_patch_template') continue;
    const sourceFile = existingSourceFile(sourceDir, candidate.source_file);
    if (!sourceFile) {
      results.push({ source_file: candidate.source_file, target_path: candidate.target_path, status: 'skipped_missing_source' });
      continue;
    }
    const targetFile = targetPathInsideWorkspace(candidate.target_path);
    if (candidate.text_available === true) {
      atomicWriteText(targetFile, readTextSafe(sourceFile));
    } else {
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.copyFileSync(sourceFile, targetFile);
    }
    results.push({ source_file: candidate.source_file, target_path: candidate.target_path, status: 'written' });
  }
  return results;
}

function buildImportPayload(importId, sourceDir, options = {}) {
  const targetDir = path.join(IMPORT_ROOT, importId);
  const sourcePath = path.resolve(sourceDir);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
    throw new Error(`KNOWLEDGE_IMPORT_SOURCE_DIR_MISSING: ${sourcePath}`);
  }
  const collected = collectFiles(sourcePath, targetDir);
  const classifiedFiles = collected.files.map(classifyFile);
  const rawCopyPolicy = buildRawCopyPolicy(options);
  const rawCopy = buildRawCopyPlan(targetDir, classifiedFiles, rawCopyPolicy, sourcePath);
  const extractableFiles = prioritizedExtractableFiles(classifiedFiles, rawCopy);
  const conceptIndex = buildConceptIndex(classifiedFiles);
  const conceptRelations = buildConceptRelations(classifiedFiles);
  const mdosConceptLinks = collectMdosConceptLinks(conceptIndex);
  const permissionStatus = shortText(options.permission_status || 'user_provided') || 'user_provided';
  const createdAt = nowIso();
  const identityPatch = buildImportedIdentityPatch(sourcePath, importId, createdAt);
  const relativeSource = path.relative(WORKSPACE_ROOT, collected.source_real).replace(/\\/g, '/');
  const sourceLocation = !relativeSource
    ? '.'
    : !relativeSource.startsWith('..') && !path.isAbsolute(relativeSource)
      ? relativeSource
    : `external:${path.basename(collected.source_real)}:${sha256Text(collected.source_real).slice(0, 16)}`;

  const manifest = {
    schema_version: 1,
    import_id: importId,
    created_at: createdAt,
    import_mode: options.initial_repository === true ? 'initial_repository' : 'structured_import',
    source_kind: shortText(options.source_kind || (identityPatch.source_detection.source_is_mdos_release ? 'md_os_release' : 'repository')),
    source_location: sourceLocation,
    source_access: rawCopy.file_count > 0 ? 'read_only_reference_with_raw_copy' : 'read_only_reference',
    permission_status: permissionStatus,
    scope: shortText(options.scope || 'general knowledge import'),
    non_goals: ['No unstructured raw dump into canonical knowledge.', 'No destructive source mutation.', 'No generated runtime state promotion.'],
    allowed_targets: ['AGENTS.md', 'ME.md', 'bootstrap-md-os-codex.sh', 'md-os/kb/', 'md-os/ops/imports/knowledge/<import_id>/raw/', 'md-os/ops/programs/', 'md-os/ops/releases/self/proposals/', 'docs/'],
    forbidden_targets: ['generated runtime state', 'external source directory mutation'],
    epistemic_default: 'imported_unverified',
    promotion_requires: ['human_review', 'source_readback', 'dedupe', 'semantic_epistemic_profile', 'rebuild'],
    identity_patch_status: identityPatch.status,
    canonical_import_target: `md-os/kb/imports/${importId}/`,
    initial_repository: options.initial_repository === true,
    raw_copy: {
      enabled: rawCopy.enabled,
      managed: rawCopy.managed,
      target_path: rawCopy.target_path,
      file_count: rawCopy.file_count,
      total_size_bytes: rawCopy.total_size_bytes,
      extensions: rawCopy.extensions,
      suffixes: rawCopy.suffixes,
      include_artifact_packages: rawCopy.include_artifact_packages,
      files: rawCopy.files,
    },
  };

  const inventory = {
    schema_version: 1,
    import_id: importId,
    updated_at: createdAt,
    source_hash: sha256Json({
      manifest,
      files: classifiedFiles.map((file) => ({
        relative_path: file.relative_path,
        size_bytes: file.size_bytes,
        sha256: file.sha256,
        semantic_layer: file.semantic_layer,
        epistemic_status: file.epistemic_status,
      })),
      skipped: collected.skipped,
    }),
    source_location: sourceLocation,
    file_count: classifiedFiles.length,
    skipped_count: collected.skipped.length,
    total_size_bytes: classifiedFiles.reduce((sum, file) => sum + file.size_bytes, 0),
    text_file_count: classifiedFiles.filter((file) => file.text_available).length,
    truncated_text_file_count: classifiedFiles.filter((file) => file.text_truncated).length,
    extension_counts: countBy(classifiedFiles, 'extension'),
    files: classifiedFiles.map((file) => ({
      relative_path: file.relative_path,
      basename: file.basename,
      extension: file.extension,
      size_bytes: file.size_bytes,
      sha256: file.sha256,
      text_available: file.text_available,
      text_truncated: file.text_truncated,
      title: file.title,
      terms: file.terms,
    })),
    skipped: collected.skipped,
  };

  const extraction = {
    schema_version: 1,
    import_id: importId,
    updated_at: createdAt,
    extraction_policy: {
      mode: 'bounded_text_prefix_and_metadata',
      max_text_bytes_per_file: MAX_TEXT_BYTES,
      max_extracted_files: MAX_EXTRACTED_FILES,
      raw_copy_default: false,
      raw_copy_enabled: rawCopy.enabled,
      raw_copy_target: rawCopy.target_path,
      prioritized_raw_copy_extraction: rawCopy.enabled,
    },
    extracted_file_count: Math.min(extractableFiles.length, MAX_EXTRACTED_FILES),
    extracts: extractableFiles
      .slice(0, MAX_EXTRACTED_FILES)
      .map((file) => ({
        source_file: file.relative_path,
        title: file.title,
        headings: file.headings,
        terms: file.terms,
        text_truncated: file.text_truncated,
        excerpt: file.text_excerpt,
      })),
  };

  const classification = {
    schema_version: 1,
    import_id: importId,
    updated_at: createdAt,
    semantic_profile_complete: classifiedFiles.every((file) => file.semantic_layer && file.actionability),
    epistemic_profile_complete: classifiedFiles.every((file) => file.epistemic_profile_complete),
    semantic_layer_counts: countBy(classifiedFiles, 'semantic_layer'),
    epistemic_status_counts: countBy(classifiedFiles, 'epistemic_status'),
    actionability_counts: countBy(classifiedFiles, 'actionability'),
    files: classifiedFiles.map((file) => ({
      source_file: file.relative_path,
      title: file.title,
      semantic_layer: file.semantic_layer,
      epistemic_status: file.epistemic_status,
      epistemic_profile_complete: file.epistemic_profile_complete,
      actionability: file.actionability,
      terms: file.terms,
    })),
  };

  const relations = {
    schema_version: 1,
    import_id: importId,
    updated_at: createdAt,
    concept_count: conceptIndex.length,
    concept_relation_count: conceptRelations.length,
    mdos_concept_link_count: mdosConceptLinks.length,
    concept_index: conceptIndex.slice(0, 300),
    concept_relations: conceptRelations,
    mdos_concept_links: mdosConceptLinks,
  };

  const promotionCandidates = buildPromotionCandidates(classifiedFiles, identityPatch);
  const promotionPlan = {
    schema_version: 1,
    import_id: importId,
    updated_at: createdAt,
    status: permissionStatus === 'unknown' || permissionStatus === 'restricted' ? 'blocked_by_permission' : 'requires_review',
    no_direct_promotion: true,
    candidate_count: promotionCandidates.length,
    candidates: promotionCandidates,
    identity_patch: {
      status: identityPatch.status,
      target_identity_name: identityPatch.target_identity.identity_name,
      target_identity_version: identityPatch.target_identity.identity_version,
      patch_target_count: identityPatch.bootstrap_patch_rule.patch_targets.length,
      patch_artifact: 'identity_patch.json',
    },
    required_rebuilds_after_acceptance: [
      'node md-os/os/build_agentic_core.js',
      'node md-os/os/build_self_release_index.js',
      'node md-os/os/build_markdown_graph.js',
      'node md-os/os/build_semantic_knowledge_graph.js',
      'node md-os/os/build_global_index.js',
      'node md-os/os/build_health_dashboard.js',
    ],
  };

  const questions = {
    schema_version: 1,
    import_id: importId,
    updated_at: createdAt,
    questions: buildQuestions(classifiedFiles, collected.skipped, permissionStatus, identityPatch),
  };

  const readback = {
    schema_version: 1,
    import_id: importId,
    updated_at: createdAt,
    status: classification.semantic_profile_complete && classification.epistemic_profile_complete ? 'ok' : 'critical',
    source_location: sourceLocation,
    file_count: inventory.file_count,
    skipped_count: inventory.skipped_count,
    text_file_count: inventory.text_file_count,
    semantic_profile_complete: classification.semantic_profile_complete,
    epistemic_profile_complete: classification.epistemic_profile_complete,
    semantic_layer_counts: classification.semantic_layer_counts,
    epistemic_status_counts: classification.epistemic_status_counts,
    concept_count: relations.concept_count,
    concept_relation_count: relations.concept_relation_count,
    mdos_concept_link_count: relations.mdos_concept_link_count,
    promotion_status: promotionPlan.status,
    promotion_candidate_count: promotionPlan.candidate_count,
    identity_patch_status: identityPatch.status,
    imported_identity_name: identityPatch.target_identity.identity_name,
    imported_identity_version: identityPatch.target_identity.identity_version,
    imported_mdos_release: identityPatch.source_detection.source_is_mdos_release,
    canonical_import_target: `md-os/kb/imports/${importId}/`,
    import_mode: manifest.import_mode,
    raw_copy_file_count: rawCopy.file_count,
    raw_copy_total_size_bytes: rawCopy.total_size_bytes,
    raw_copy_target: rawCopy.target_path,
    question_count: questions.questions.length,
    compact_policy: 'Use md-os/kb/imports/<import_id>/ for canonical imported knowledge; use readback.md/json for audit; expand inventory, classification, extraction, and relations only when promoting or debugging.',
  };

  const payload = {
    source_path: sourcePath,
    target_dir: targetDir,
    manifest,
    inventory,
    extraction,
    classification,
    relations,
    raw_copy: rawCopy,
    identity_patch: identityPatch,
    promotion_plan: promotionPlan,
    questions,
    readback,
  };
  payload.canonical_import = buildCanonicalImportPackage(payload, options);
  return payload;
}

function renderInventory(inventory) {
  const lines = [
    '# Knowledge Import Inventory',
    '',
    `Import id: \`${inventory.import_id}\``,
    `Updated at: \`${inventory.updated_at}\``,
    `Source: \`${inventory.source_location}\``,
    '',
    `- files: \`${inventory.file_count}\``,
    `- text files: \`${inventory.text_file_count}\``,
    `- truncated text files: \`${inventory.truncated_text_file_count}\``,
    `- skipped: \`${inventory.skipped_count}\``,
    '',
    '## Extensions',
    '',
  ];
  for (const [extension, count] of Object.entries(inventory.extension_counts)) {
    lines.push(`- \`${extension}\`: \`${count}\``);
  }
  lines.push('', '## Files', '');
  for (const file of inventory.files.slice(0, 300)) {
    lines.push(`- \`${file.relative_path}\` | \`${file.extension}\` | \`${file.size_bytes}\` bytes | text \`${file.text_available}\` | terms \`${file.terms.slice(0, 8).join(', ')}\``);
  }
  if (inventory.skipped.length) {
    lines.push('', '## Skipped', '');
    for (const item of inventory.skipped.slice(0, 100)) {
      lines.push(`- \`${item.path}\`: \`${item.reason}\``);
    }
  }
  return `${lines.join('\n')}\n`;
}

function renderExtraction(extraction) {
  const lines = [
    '# Knowledge Import Extraction',
    '',
    `Import id: \`${extraction.import_id}\``,
    `Updated at: \`${extraction.updated_at}\``,
    '',
    `Mode: \`${extraction.extraction_policy.mode}\``,
    `Extracted files: \`${extraction.extracted_file_count}\``,
    '',
  ];
  for (const item of extraction.extracts.slice(0, 80)) {
    lines.push(`## ${item.source_file}`, '');
    lines.push(`- title: \`${item.title}\``);
    lines.push(`- terms: \`${item.terms.join(', ')}\``);
    if (item.headings.length) lines.push(`- headings: \`${item.headings.join(' | ')}\``);
    lines.push('', item.excerpt || '_No excerpt._', '');
  }
  return `${lines.join('\n')}\n`;
}

function renderClassification(classification) {
  const lines = [
    '# Knowledge Import Classification',
    '',
    `Import id: \`${classification.import_id}\``,
    `Updated at: \`${classification.updated_at}\``,
    '',
    `- semantic profile complete: \`${classification.semantic_profile_complete}\``,
    `- epistemic profile complete: \`${classification.epistemic_profile_complete}\``,
    '',
    '## Semantic Layers',
    '',
  ];
  for (const [name, count] of Object.entries(classification.semantic_layer_counts)) lines.push(`- \`${name}\`: \`${count}\``);
  lines.push('', '## Epistemic Statuses', '');
  for (const [name, count] of Object.entries(classification.epistemic_status_counts)) lines.push(`- \`${name}\`: \`${count}\``);
  lines.push('', '## Files', '');
  for (const file of classification.files.slice(0, 250)) {
    lines.push(`- \`${file.source_file}\` | semantic \`${file.semantic_layer}\` | epistemic \`${file.epistemic_status}\` | action \`${file.actionability}\``);
  }
  return `${lines.join('\n')}\n`;
}

function renderRelations(relations) {
  const lines = [
    '# Knowledge Import Relations',
    '',
    `Import id: \`${relations.import_id}\``,
    `Updated at: \`${relations.updated_at}\``,
    '',
    `- concepts: \`${relations.concept_count}\``,
    `- concept relations: \`${relations.concept_relation_count}\``,
    `- MD-OS concept links: \`${relations.mdos_concept_link_count}\``,
    '',
    '## Concepts',
    '',
  ];
  for (const concept of relations.concept_index.slice(0, 100)) {
    lines.push(`- \`${concept.term}\`: \`${concept.file_count}\` file(s) | layers \`${concept.semantic_layers.join(', ')}\``);
  }
  lines.push('', '## Relations', '');
  for (const relation of relations.concept_relations.slice(0, 120)) {
    lines.push(`- \`${relation.source_term}\` -> \`${relation.target_term}\` | files \`${relation.file_count}\` | layers \`${relation.semantic_layers.join(', ')}\``);
  }
  if (relations.mdos_concept_links.length) {
    lines.push('', '## MD-OS Concept Links', '');
    for (const link of relations.mdos_concept_links) {
      lines.push(`- \`${link.import_term}\` | files \`${link.file_count}\` | \`${link.relation}\``);
    }
  }
  return `${lines.join('\n')}\n`;
}

function renderIdentityPatch(identityPatch) {
  const lines = [
    '# Knowledge Import Identity Patch',
    '',
    `Import id: \`${identityPatch.import_id}\``,
    `Updated at: \`${identityPatch.updated_at}\``,
    '',
    `Status: \`${identityPatch.status}\``,
    `Source is MD-OS release: \`${identityPatch.source_detection.source_is_mdos_release}\``,
    `Detection confidence: \`${identityPatch.source_detection.confidence}\``,
    '',
    '## Target Identity',
    '',
  ];
  for (const [key, value] of Object.entries(identityPatch.target_identity)) {
    lines.push(`- ${key}: \`${value || ''}\``);
  }
  lines.push('', '## Bootstrap Patch Rule', '');
  lines.push(`- deterministic: \`${identityPatch.bootstrap_patch_rule.deterministic}\``);
  lines.push(`- direct write default: \`${identityPatch.bootstrap_patch_rule.direct_write_default}\``);
  lines.push(`- acceptance required: \`${identityPatch.bootstrap_patch_rule.acceptance_required}\``);
  lines.push(`- patch scope: \`${identityPatch.bootstrap_patch_rule.patch_scope}\``);
  lines.push('', '## Patch Targets', '');
  if (!identityPatch.bootstrap_patch_rule.patch_targets.length) {
    lines.push('- No bootstrap patch targets generated.');
  } else {
    for (const target of identityPatch.bootstrap_patch_rule.patch_targets) {
      lines.push(`- \`${target.target_path}\` | \`${target.operation}\` | ${target.deterministic_rule}`);
    }
  }
  lines.push('', '## Guardrails', '');
  for (const guardrail of identityPatch.bootstrap_patch_rule.guardrails) lines.push(`- ${guardrail}`);
  lines.push('', '## Acceptance Gates', '');
  for (const gate of identityPatch.bootstrap_patch_rule.acceptance_gates) lines.push(`- \`${gate}\``);
  lines.push('', '## Source Evidence', '');
  if (!identityPatch.source_evidence.length) {
    lines.push('- No identity source evidence files detected.');
  } else {
    for (const item of identityPatch.source_evidence) lines.push(`- \`${item.path}\` | sha256 \`${item.sha256}\``);
  }
  return `${lines.join('\n')}\n`;
}

function renderPromotionPlan(plan) {
  const lines = [
    '# Knowledge Import Promotion Plan',
    '',
    `Import id: \`${plan.import_id}\``,
    `Updated at: \`${plan.updated_at}\``,
    '',
    `Status: \`${plan.status}\``,
    `No direct promotion: \`${plan.no_direct_promotion}\``,
    `Candidate count: \`${plan.candidate_count}\``,
    '',
    '## Identity Patch',
    '',
    `- status: \`${plan.identity_patch.status}\``,
    `- target identity: \`${plan.identity_patch.target_identity_name || ''}\``,
    `- target identity version: \`${plan.identity_patch.target_identity_version || ''}\``,
    `- patch targets: \`${plan.identity_patch.patch_target_count}\``,
    `- artifact: \`${plan.identity_patch.patch_artifact}\``,
    '',
    '## Candidates',
    '',
  ];
  if (!plan.candidates.length) {
    lines.push('- No promotion candidates detected.');
  } else {
    for (const candidate of plan.candidates.slice(0, 100)) {
      lines.push(`- \`${candidate.source_file}\` -> \`${candidate.candidate_target}\` | epistemic \`${candidate.epistemic_status}\` | action \`${candidate.actionability}\``);
    }
  }
  lines.push('', '## Required Rebuilds After Acceptance', '');
  for (const command of plan.required_rebuilds_after_acceptance) lines.push(`- \`${command}\``);
  return `${lines.join('\n')}\n`;
}

function renderQuestions(questions) {
  return [
    '# Knowledge Import Questions',
    '',
    `Import id: \`${questions.import_id}\``,
    `Updated at: \`${questions.updated_at}\``,
    '',
    ...questions.questions.map((question, index) => `${index + 1}. ${question}`),
    '',
  ].join('\n');
}

function renderReadback(readback) {
  const lines = [
    '# Knowledge Import Readback',
    '',
    `Import id: \`${readback.import_id}\``,
    `Updated at: \`${readback.updated_at}\``,
    '',
    `Status: \`${readback.status}\``,
    `Source: \`${readback.source_location}\``,
    '',
    `- files: \`${readback.file_count}\``,
    `- text files: \`${readback.text_file_count}\``,
    `- skipped: \`${readback.skipped_count}\``,
    `- semantic profile complete: \`${readback.semantic_profile_complete}\``,
    `- epistemic profile complete: \`${readback.epistemic_profile_complete}\``,
    `- concepts: \`${readback.concept_count}\``,
    `- concept relations: \`${readback.concept_relation_count}\``,
    `- MD-OS concept links: \`${readback.mdos_concept_link_count}\``,
    `- promotion status: \`${readback.promotion_status}\``,
    `- promotion candidates: \`${readback.promotion_candidate_count}\``,
    `- imported MD-OS release: \`${readback.imported_mdos_release}\``,
    `- identity patch status: \`${readback.identity_patch_status}\``,
    `- imported identity: \`${readback.imported_identity_name || ''}\``,
    `- imported identity version: \`${readback.imported_identity_version || ''}\``,
    `- canonical import target: \`${readback.canonical_import_target || ''}\``,
    `- import mode: \`${readback.import_mode || ''}\``,
    `- raw copy files: \`${readback.raw_copy_file_count || 0}\``,
    `- raw copy target: \`${readback.raw_copy_target || ''}\``,
    `- open questions: \`${readback.question_count}\``,
    '',
    readback.compact_policy,
    '',
    '## Semantic Layers',
    '',
  ];
  for (const [name, count] of Object.entries(readback.semantic_layer_counts)) lines.push(`- \`${name}\`: \`${count}\``);
  lines.push('', '## Epistemic Statuses', '');
  for (const [name, count] of Object.entries(readback.epistemic_status_counts)) lines.push(`- \`${name}\`: \`${count}\``);
  return `${lines.join('\n')}\n`;
}

function writeCanonicalImport(payload) {
  const targetDir = payload.canonical_import.target_dir;
  withFileLock(`builder__canonical_knowledge_import__${payload.manifest.import_id}`, {
    context: 'build_knowledge_import_canonical_tree',
    timeoutMs: 120000,
    staleMs: 900000,
  }, () => {
    atomicWriteText(path.join(targetDir, 'README.md'), renderCanonicalImportReadme(payload));
    atomicWriteText(path.join(targetDir, 'SOURCE_MANIFEST.md'), renderCanonicalSourceManifest(payload));
    atomicWriteText(path.join(targetDir, 'KNOWLEDGE_NODES.md'), renderCanonicalKnowledgeNodes(payload));
    atomicWriteText(path.join(targetDir, 'RELATIONS.md'), renderCanonicalRelations(payload));
    atomicWriteText(path.join(targetDir, 'IDENTITY_FRAME.md'), renderCanonicalIdentityFrame(payload.identity_patch));
    atomicWriteText(path.join(targetDir, 'OPERATING_BINDING.md'), renderCanonicalOperatingBinding(payload.canonical_import));
    atomicWriteJson(path.join(targetDir, 'canonical_import.json'), {
      schema_version: 1,
      import_id: payload.manifest.import_id,
      updated_at: payload.manifest.created_at,
      source_kind: payload.manifest.source_kind,
      source_location: payload.manifest.source_location,
      identity_patch_status: payload.identity_patch.status,
      imported_identity_name: payload.identity_patch.target_identity.identity_name,
      assimilation_plan: payload.canonical_import.assimilation_plan,
      ops_audit_dir: rel(payload.target_dir),
    });
  });
  return {
    target_path: payload.canonical_import.target_path,
    status: 'written',
  };
}

function applyInitialRepositoryImport(payload) {
  const plan = payload.canonical_import.assimilation_plan;
  if (!plan.enabled) return { status: 'not_requested', source_results: [], bootstrap_results: [] };
  if (!payload.identity_patch.source_detection.source_is_mdos_release) {
    return { status: 'blocked_not_mdos_release', source_results: [], bootstrap_results: [] };
  }
  const sourceResults = writePathPreservingInitialSources(payload);
  const bootstrapResults = payload.identity_patch.status === 'requires_review'
    ? patchBootstrapTargets(payload.identity_patch)
    : [];
  return {
    status: payload.identity_patch.status === 'requires_review' ? 'applied' : 'blocked_missing_identity',
    source_results: sourceResults,
    bootstrap_results: bootstrapResults,
  };
}

function writeRawCopies(payload) {
  const rawCopy = payload.raw_copy;
  const managedRoot = path.join(payload.target_dir, 'raw', rawCopy.managed_subdir.replace(/^raw\//, '').replace(/\/$/, ''));
  fs.rmSync(managedRoot, { recursive: true, force: true });
  fs.mkdirSync(managedRoot, { recursive: true });
  if (!rawCopy.enabled || !rawCopy.files.length) return [];

  const results = [];
  for (const file of rawCopy.files) {
    const safeRelativePath = assertSafeRelativeTarget(file.source_file);
    const sourceFile = existingSourceFile(payload.source_path, file.source_file);
    if (!sourceFile) {
      results.push({ source_file: file.source_file, target_path: file.target_path, status: 'skipped_missing_source' });
      continue;
    }
    const targetFile = path.join(managedRoot, safeRelativePath);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
    results.push({ source_file: file.source_file, target_path: rel(targetFile), status: 'written' });
  }
  return results;
}

function writeImport(payload) {
  const targetDir = payload.target_dir;
  const extractedDir = path.join(targetDir, 'extracted');
  const rawDir = path.join(targetDir, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(extractedDir, { recursive: true });
  withFileLock(`builder__knowledge_import__${payload.manifest.import_id}`, {
    context: 'build_knowledge_import',
    timeoutMs: 120000,
    staleMs: 900000,
  }, () => {
    writeRawCopies(payload);
    atomicWriteJson(path.join(targetDir, 'manifest.json'), payload.manifest);
    atomicWriteJson(path.join(targetDir, 'inventory.json'), payload.inventory);
    atomicWriteText(path.join(targetDir, 'inventory.md'), renderInventory(payload.inventory));
    atomicWriteJson(path.join(extractedDir, 'knowledge_extract.json'), payload.extraction);
    atomicWriteText(path.join(extractedDir, 'knowledge_extract.md'), renderExtraction(payload.extraction));
    atomicWriteJson(path.join(targetDir, 'classification.json'), payload.classification);
    atomicWriteText(path.join(targetDir, 'classification.md'), renderClassification(payload.classification));
    atomicWriteJson(path.join(targetDir, 'relations.json'), payload.relations);
    atomicWriteText(path.join(targetDir, 'relations.md'), renderRelations(payload.relations));
    atomicWriteJson(path.join(targetDir, 'identity_patch.json'), payload.identity_patch);
    atomicWriteText(path.join(targetDir, 'identity_patch.md'), renderIdentityPatch(payload.identity_patch));
    atomicWriteJson(path.join(targetDir, 'promotion_plan.json'), payload.promotion_plan);
    atomicWriteText(path.join(targetDir, 'promotion_plan.md'), renderPromotionPlan(payload.promotion_plan));
    atomicWriteJson(path.join(targetDir, 'questions.json'), payload.questions);
    atomicWriteText(path.join(targetDir, 'questions.md'), renderQuestions(payload.questions));
    atomicWriteJson(path.join(targetDir, 'readback.json'), payload.readback);
    atomicWriteText(path.join(targetDir, 'readback.md'), renderReadback(payload.readback));
  });
  const canonicalResult = writeCanonicalImport(payload);
  const initialRepositoryResult = applyInitialRepositoryImport(payload);
  return {
    canonical_import: canonicalResult,
    initial_repository: initialRepositoryResult,
  };
}

function parseArgs(argv) {
  const [importIdRaw, sourceDirRaw, ...flags] = argv;
  if (!importIdRaw || !sourceDirRaw) {
    throw new Error('USAGE: node md-os/os/build_knowledge_import.js <import_id> <source_dir> [--initial-repository] [--copy-theory-sources] [--copy-raw-ext=.tex,.svg] [--copy-raw-suffix=.schema.json]');
  }
  const rawCopyExtensions = [];
  const rawCopySuffixes = [];
  let initialRepository = false;
  let theorySourceProfile = false;
  let includeTheoryArtifactPackages = false;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === '--initial-repository' || flag === '--mode=initial_repository') {
      initialRepository = true;
      continue;
    }
    if (flag === '--copy-theory-sources' || flag === '--copy-raw-theory-package') {
      theorySourceProfile = true;
      includeTheoryArtifactPackages = true;
      continue;
    }
    if (flag === '--copy-theory-artifacts' || flag === '--copy-raw-theory-artifacts') {
      includeTheoryArtifactPackages = true;
      continue;
    }
    if (flag === '--copy-raw-ext' || flag === '--raw-copy-ext') {
      rawCopyExtensions.push(flags[index + 1] || '');
      index += 1;
      continue;
    }
    if (flag.startsWith('--copy-raw-ext=')) {
      rawCopyExtensions.push(flag.slice('--copy-raw-ext='.length));
      continue;
    }
    if (flag.startsWith('--raw-copy-ext=')) {
      rawCopyExtensions.push(flag.slice('--raw-copy-ext='.length));
      continue;
    }
    if (flag === '--copy-raw-suffix' || flag === '--raw-copy-suffix') {
      rawCopySuffixes.push(flags[index + 1] || '');
      index += 1;
      continue;
    }
    if (flag.startsWith('--copy-raw-suffix=')) {
      rawCopySuffixes.push(flag.slice('--copy-raw-suffix='.length));
      continue;
    }
    if (flag.startsWith('--raw-copy-suffix=')) {
      rawCopySuffixes.push(flag.slice('--raw-copy-suffix='.length));
      continue;
    }
  }
  if (theorySourceProfile) {
    rawCopyExtensions.push(...THEORY_SOURCE_RAW_COPY_EXTENSIONS);
    rawCopySuffixes.push(...THEORY_SOURCE_RAW_COPY_SUFFIXES);
  }
  return {
    import_id: assertSafeId(importIdRaw, 'import_id'),
    source_dir: sourceDirRaw,
    initial_repository: initialRepository,
    raw_copy_extensions: rawCopyExtensions,
    raw_copy_suffixes: rawCopySuffixes,
    include_theory_artifact_packages: includeTheoryArtifactPackages,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = buildImportPayload(args.import_id, args.source_dir, {
    initial_repository: args.initial_repository,
    raw_copy_extensions: args.raw_copy_extensions,
    raw_copy_suffixes: args.raw_copy_suffixes,
    include_theory_artifact_packages: args.include_theory_artifact_packages,
  });
  const writeResult = writeImport(payload);
  appendJournal({
    event: 'knowledge_import_rebuilt',
    builder: 'build_knowledge_import',
    import_id: payload.manifest.import_id,
    source_location: payload.manifest.source_location,
    status: payload.readback.status,
    file_count: payload.readback.file_count,
    concept_count: payload.readback.concept_count,
    concept_relation_count: payload.readback.concept_relation_count,
    promotion_candidate_count: payload.readback.promotion_candidate_count,
    identity_patch_status: payload.readback.identity_patch_status,
    imported_identity_name: payload.readback.imported_identity_name,
    canonical_import_target: payload.readback.canonical_import_target,
    import_mode: payload.readback.import_mode,
    initial_repository_status: writeResult.initial_repository.status,
    raw_copy_file_count: payload.readback.raw_copy_file_count,
  });
  printJson({
    ok: true,
    mode: 'build_knowledge_import',
    import_id: payload.manifest.import_id,
    status: payload.readback.status,
    output_dir: rel(payload.target_dir),
    readback: rel(path.join(payload.target_dir, 'readback.md')),
    canonical_import_dir: payload.canonical_import.target_path,
    canonical_import_readme: `${payload.canonical_import.target_path}/README.md`,
    import_mode: payload.readback.import_mode,
    initial_repository_status: writeResult.initial_repository.status,
    file_count: payload.readback.file_count,
    concept_count: payload.readback.concept_count,
    concept_relation_count: payload.readback.concept_relation_count,
    promotion_candidate_count: payload.readback.promotion_candidate_count,
    identity_patch_status: payload.readback.identity_patch_status,
    imported_identity_name: payload.readback.imported_identity_name,
    raw_copy_file_count: payload.readback.raw_copy_file_count,
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildImportPayload,
  classifyFile,
  renderIdentityPatch,
  renderReadback,
};
