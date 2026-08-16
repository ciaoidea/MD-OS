#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { sha256Json, sha256Text, shortText } = require('../../os/lib/common');

const CONTEXT_PROTOCOL_ID = 'apfc_public_repository_context_v1';
const DEFAULT_CONTEXT_BYTES = 120_000;
const DEFAULT_FILE_COUNT = 14;
const MAX_CANDIDATES = 800;
const MAX_READ_BYTES = 256_000;
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'been', 'before', 'being', 'below',
  'between', 'both', 'cannot', 'could', 'does', 'doing', 'each', 'from', 'have',
  'into', 'more', 'most', 'only', 'other', 'should', 'some', 'such', 'than', 'that',
  'their', 'there', 'these', 'they', 'this', 'through', 'under', 'using', 'very',
  'when', 'where', 'which', 'while', 'with', 'would', 'your', 'expected', 'actual',
  'behavior', 'description', 'issue', 'problem', 'proposed', 'additional', 'criteria',
]);
const TEXT_EXTENSION = /(?:^|\/)(?:[^/]+\.(?:c|cc|cfg|conf|cpp|css|go|h|hpp|html|ini|java|js|json|jsx|md|mjs|py|pyi|rb|rs|rst|sh|sql|toml|ts|tsx|txt|xml|yaml|yml)|Dockerfile|Makefile|CMakeLists\.txt)$/i;
const GUIDANCE_FILE = /(?:^|\/)(?:AGENTS\.md|CONTRIBUTING\.md|DEVELOPING\.md|README(?:\.[^.]+)?|pyproject\.toml|setup\.cfg|setup\.py|tox\.ini|package\.json)$/i;
const TEST_FILE = /(^|\/)(tests?|testing|fixtures?|snapshots?|__snapshots__)(\/|$)|(^|\/)(test_[^/]+|[^/]+[._-]test\.[^/]+)$/i;
const VENDOR_FILE = /(^|\/)(vendor|third_party|node_modules|dist|build|generated|site-packages)(\/|$)/i;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeoutMs || 60_000,
    maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
  });
}

function assertRun(result, code) {
  if (result.status !== 0) throw new Error(`${code}:${shortText(result.stderr || result.stdout)}`);
  return result.stdout || '';
}

function unique(values) {
  return [...new Set(values)];
}

function extractSearchTerms(problemStatement) {
  const text = String(problemStatement || '');
  const priority = [];
  for (const match of text.matchAll(/`([^`\n]{2,100})`/g)) {
    for (const token of match[1].match(/[A-Za-z_][A-Za-z0-9_.\/-]{2,99}|--[A-Za-z0-9_-]+/g) || []) priority.push(token);
  }
  for (const match of text.matchAll(/(?:^|[\s("'])([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)/g)) priority.push(match[1]);
  const identifiers = text.match(/[A-Za-z_][A-Za-z0-9_]{3,79}|--[A-Za-z0-9_-]{2,79}/g) || [];
  const words = text.match(/[A-Za-z][A-Za-z0-9-]{3,39}/g) || [];
  const normalized = unique([...priority, ...identifiers, ...words]
    .map((term) => term.replace(/^[`'"(]+|[`'"),.:;]+$/g, ''))
    .filter((term) => term.length >= 3)
    .filter((term) => !STOP_WORDS.has(term.toLowerCase())));
  return normalized.slice(0, 40);
}

function trackedFiles(repo) {
  const output = assertRun(run('git', ['ls-files', '-z'], { cwd: repo }), 'APFC_CONTEXT_GIT_LS_FILES_FAILED');
  return output.split('\0').filter(Boolean).sort();
}

function safeTextFile(repo, relativePath) {
  if (!TEXT_EXTENSION.test(relativePath) || VENDOR_FILE.test(relativePath)) return null;
  const file = path.join(repo, relativePath);
  let stat;
  try { stat = fs.statSync(file); } catch { return null; }
  if (!stat.isFile() || stat.size > MAX_READ_BYTES) return null;
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) return null;
  return { text: buffer.toString('utf8'), bytes: buffer.length };
}

function pathScore(relativePath, terms) {
  const lower = relativePath.toLowerCase();
  let score = GUIDANCE_FILE.test(relativePath) ? 4 : 0;
  if (TEST_FILE.test(relativePath)) score -= 1;
  for (const term of terms) {
    const needle = term.toLowerCase();
    if (lower === needle) score += 40;
    else if (lower.endsWith(`/${needle}`)) score += 28;
    else if (lower.includes(needle)) score += needle.includes('/') ? 22 : 7;
    const basename = path.posix.basename(lower);
    if (basename === path.posix.basename(needle)) score += 18;
  }
  return score;
}

function contentScore(relativePath, text, terms) {
  const lower = text.toLowerCase();
  let score = pathScore(relativePath, terms);
  const matched = [];
  for (let index = 0; index < terms.length; index += 1) {
    const term = terms[index];
    const needle = term.toLowerCase();
    if (!needle || !lower.includes(needle)) continue;
    matched.push(term);
    let occurrences = 0;
    let offset = 0;
    while (occurrences < 5 && (offset = lower.indexOf(needle, offset)) !== -1) {
      occurrences += 1;
      offset += needle.length;
    }
    score += occurrences * (index < 10 ? 7 : 3);
  }
  if (/(^|\/)(src|lib|app|server|packages?)\//i.test(relativePath)) score += 3;
  return { score, matched_terms: matched };
}

function matchingFiles(repo, terms) {
  const strong = terms.filter((term) => term.length >= 4).slice(0, 24);
  if (!strong.length) return [];
  const args = ['-l', '-i', '-F', '--hidden', '--glob', '!.git/**'];
  for (const term of strong) args.push('-e', term);
  args.push('.');
  const result = run('rg', args, { cwd: repo, timeoutMs: 90_000 });
  if (result.status !== 0 && result.status !== 1) return [];
  return String(result.stdout || '').split('\n')
    .map((item) => item.replace(/^\.\//, ''))
    .filter(Boolean)
    .slice(0, 5000);
}

function snippetFor(text, matchedTerms, maxBytes) {
  const bytes = Buffer.byteLength(text);
  if (bytes <= maxBytes) return { content: text, mode: 'full', omitted: false };
  const lines = text.split('\n');
  const needles = matchedTerms.map((term) => term.toLowerCase());
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
    const lower = lines[index].toLowerCase();
    if (needles.some((needle) => lower.includes(needle))) hits.push(index);
  }
  const anchors = hits.length ? hits.slice(0, 8) : [0];
  const ranges = anchors.map((line) => [Math.max(0, line - 24), Math.min(lines.length, line + 25)]);
  ranges.sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1] + 4) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  let output = '';
  for (const [start, end] of merged) {
    const block = `@@ repository lines ${start + 1}-${end} @@\n${lines.slice(start, end).join('\n')}\n`;
    if (Buffer.byteLength(output + block) > maxBytes) break;
    output += block;
  }
  if (!output) output = text.slice(0, maxBytes);
  return { content: output, mode: 'matched_windows', omitted: true };
}

function boundedTree(files, maxBytes = 32_000) {
  const selected = [];
  let bytes = 0;
  for (const file of files) {
    const increment = Buffer.byteLength(file) + 1;
    if (bytes + increment > maxBytes) break;
    selected.push(file);
    bytes += increment;
  }
  return { paths: selected, total_file_count: files.length, truncated: selected.length !== files.length };
}

function buildPublicRepositoryContext({
  repo,
  publicTask,
  byteLimit = DEFAULT_CONTEXT_BYTES,
  fileLimit = DEFAULT_FILE_COUNT,
}) {
  const terms = extractSearchTerms(publicTask.problem_statement);
  const files = trackedFiles(repo);
  const candidates = new Set(matchingFiles(repo, terms));
  for (const file of files) {
    if (GUIDANCE_FILE.test(file) || pathScore(file, terms) > 5) candidates.add(file);
  }
  const ranked = [];
  for (const relativePath of [...candidates].sort().slice(0, MAX_CANDIDATES)) {
    const record = safeTextFile(repo, relativePath);
    if (!record) continue;
    const scoring = contentScore(relativePath, record.text, terms);
    ranked.push({ relativePath, ...record, ...scoring });
  }
  ranked.sort((left, right) => right.score - left.score
    || Number(GUIDANCE_FILE.test(right.relativePath)) - Number(GUIDANCE_FILE.test(left.relativePath))
    || left.relativePath.localeCompare(right.relativePath));
  const selectedFiles = [];
  let usedBytes = 0;
  for (const candidate of ranked) {
    if (selectedFiles.length >= fileLimit || usedBytes >= byteLimit) break;
    const allowance = Math.min(24_000, byteLimit - usedBytes);
    if (allowance < 1000) break;
    const excerpt = snippetFor(candidate.text, candidate.matched_terms, allowance);
    const contentBytes = Buffer.byteLength(excerpt.content);
    selectedFiles.push({
      path: candidate.relativePath,
      relevance_score: candidate.score,
      matched_terms: candidate.matched_terms,
      original_bytes: candidate.bytes,
      content_bytes: contentBytes,
      selection_mode: excerpt.mode,
      content_truncated: excerpt.omitted,
      content_hash: sha256Text(candidate.text),
      content: excerpt.content,
    });
    usedBytes += contentBytes;
  }
  const context = {
    schema_version: 1,
    context_type: 'apfc_public_repository_context',
    protocol_id: CONTEXT_PROTOCOL_ID,
    task_id: publicTask.task_id,
    repository: publicTask.repository,
    base_commit: publicTask.base_commit,
    public_task_hash: publicTask.public_task_hash,
    public_only: true,
    hidden_artifacts_present: false,
    deterministic_selection: true,
    byte_limit: byteLimit,
    selected_content_bytes: usedBytes,
    search_terms: terms,
    repository_tree: boundedTree(files),
    files: selectedFiles,
    selection_policy: 'public issue lexical identifiers plus tracked path/content relevance; fixed deterministic byte and file caps',
  };
  context.context_hash = sha256Json(context);
  return context;
}

function renderPublicRepositoryContext(context) {
  const lines = [
    `PUBLIC REPOSITORY CONTEXT HASH: ${context.context_hash}`,
    `Repository tree (${context.repository_tree.paths.length}/${context.repository_tree.total_file_count} tracked paths${context.repository_tree.truncated ? ', truncated' : ''}):`,
    context.repository_tree.paths.join('\n'),
    '',
    'Selected public files:',
  ];
  for (const file of context.files) {
    lines.push('', `===== BEGIN FILE ${file.path} (${file.selection_mode}) =====`, file.content, `===== END FILE ${file.path} =====`);
  }
  return lines.join('\n');
}

module.exports = {
  CONTEXT_PROTOCOL_ID,
  DEFAULT_CONTEXT_BYTES,
  DEFAULT_FILE_COUNT,
  buildPublicRepositoryContext,
  extractSearchTerms,
  renderPublicRepositoryContext,
};
