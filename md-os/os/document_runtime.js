#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  shortText,
} = require('./lib/common');

const DOCUMENT_SCHEMA_VERSION = 1;
const DOCUMENTS_DIR = path.join(MDOS_ROOT, 'ops', 'local', 'documents');
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_BLOCKS = 2000;
const MAX_FORMULA_LENGTH = 5000;
const ALLOWED_BLOCK_TYPES = new Set(['rich', 'table', 'formula', 'image']);
const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'div',
  'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol',
  'p', 'pre', 's', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody',
  'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);
const VOID_TAGS = new Set(['br', 'col', 'hr', 'img']);
const SAFE_STYLE_PROPERTIES = new Set([
  'background-color', 'color', 'font-size', 'font-style', 'font-weight',
  'letter-spacing', 'line-height', 'margin-left', 'text-align',
  'text-decoration', 'text-indent', 'vertical-align', 'white-space',
]);
const BLOCK_ID_PATTERN = /^b_[a-f0-9]{16,32}$/;
const IMAGE_DATA_URI_PATTERN = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/;
const DANGEROUS_LATEX = /\\(?:catcode|csname|def|documentclass|every|expandafter|immediate|include|input|loop|newcommand|openin|openout|read|repeat|special|usepackage|write|write18)\b/i;
const MATH_CACHE = new Map();

function documentId(value, fallback = '') {
  const candidate = shortText(value) || fallback;
  if (!candidate) throw new Error('MISSING_TOOL_ARGUMENT: document_id');
  const safe = assertSafeId(candidate, 'document_id');
  if (safe.length > 64) throw new Error('INVALID_DOCUMENT_ID: maximum length is 64');
  return safe;
}

function blockId(value) {
  const candidate = shortText(value);
  if (!BLOCK_ID_PATTERN.test(candidate)) throw new Error(`INVALID_BLOCK_ID: ${candidate}`);
  return candidate;
}

function newBlockId() {
  return `b_${crypto.randomBytes(10).toString('hex')}`;
}

function documentDirectory(id) {
  return path.join(DOCUMENTS_DIR, documentId(id));
}

function documentFile(id) {
  return path.join(documentDirectory(id), 'document.json');
}

function relative(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).split(path.sep).join('/');
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function sanitizeStyle(value) {
  return String(value || '')
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const colon = declaration.indexOf(':');
      if (colon < 1) return '';
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const rawValue = declaration.slice(colon + 1).trim();
      if (!SAFE_STYLE_PROPERTIES.has(property)) return '';
      if (/url\s*\(|expression\s*\(|javascript:|vbscript:/i.test(rawValue)) return '';
      if (rawValue.length > 120) return '';
      return `${property}: ${rawValue}`;
    })
    .filter(Boolean)
    .join('; ');
}

function safeHref(value) {
  const href = String(value || '').trim();
  if (/^(https?:|mailto:|#)/i.test(href)) return href;
  return '';
}

function safeImageSource(value) {
  const source = String(value || '').replace(/\s+/g, '');
  return IMAGE_DATA_URI_PATTERN.test(source) ? source : '';
}

function parseAttributes(raw) {
  const attributes = [];
  const matcher = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = matcher.exec(raw)) !== null) {
    attributes.push({
      name: match[1].toLowerCase(),
      value: match[2] ?? match[3] ?? match[4] ?? '',
    });
  }
  return attributes;
}

function sanitizeHtml(value) {
  let html = String(value || '');
  if (Buffer.byteLength(html, 'utf8') > 2_000_000) {
    throw new Error('DOCUMENT_BLOCK_TOO_LARGE');
  }
  html = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|form|textarea|select|button|input|meta|link|base)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|form|textarea|select|button|input|meta|link|base)\b[^>]*\/?>/gi, '');

  return html.replace(/<\s*(\/?)\s*([A-Za-z0-9:-]+)([^>]*)>/g, (_whole, closing, rawTag, rawAttributes) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (closing) return VOID_TAGS.has(tag) ? '' : `</${tag}>`;

    const kept = [];
    for (const attribute of parseAttributes(rawAttributes)) {
      if (attribute.name.startsWith('on') || attribute.name === 'srcdoc') continue;
      if (attribute.name === 'style') {
        const style = sanitizeStyle(attribute.value);
        if (style) kept.push(`style="${escapeAttribute(style)}"`);
        continue;
      }
      if (tag === 'a' && attribute.name === 'href') {
        const href = safeHref(attribute.value);
        if (href) kept.push(`href="${escapeAttribute(href)}"`);
        continue;
      }
      if (tag === 'a' && attribute.name === 'title') {
        kept.push(`title="${escapeAttribute(attribute.value.slice(0, 500))}"`);
        continue;
      }
      if (tag === 'img' && attribute.name === 'src') {
        const source = safeImageSource(attribute.value);
        if (source) kept.push(`src="${escapeAttribute(source)}"`);
        continue;
      }
      if (tag === 'img' && attribute.name === 'alt') {
        kept.push(`alt="${escapeAttribute(attribute.value.slice(0, 500))}"`);
        continue;
      }
      if (['td', 'th'].includes(tag) && ['colspan', 'rowspan'].includes(attribute.name)) {
        const span = Number.parseInt(attribute.value, 10);
        if (Number.isInteger(span) && span >= 1 && span <= 100) kept.push(`${attribute.name}="${span}"`);
        continue;
      }
      if (tag === 'ol' && attribute.name === 'start') {
        const start = Number.parseInt(attribute.value, 10);
        if (Number.isInteger(start)) kept.push(`start="${start}"`);
      }
    }
    if (tag === 'a') kept.push('target="_blank"', 'rel="noopener noreferrer"');
    return `<${tag}${kept.length ? ` ${kept.join(' ')}` : ''}>`;
  });
}

function safeLatex(value) {
  const latex = String(value || '').trim();
  if (!latex) throw new Error('EMPTY_LATEX_FORMULA');
  if (latex.length > MAX_FORMULA_LENGTH) throw new Error('LATEX_FORMULA_TOO_LARGE');
  if (latex.includes('\0') || DANGEROUS_LATEX.test(latex)) throw new Error('UNSAFE_LATEX_FORMULA');
  return latex;
}

function renderMath(latexValue, display = true) {
  const latex = safeLatex(latexValue);
  const cacheKey = `${display === true ? 'display' : 'inline'}\0${latex}`;
  const cached = MATH_CACHE.get(cacheKey);
  if (cached) return { ...cached };
  const markdown = display ? `$$\n${latex}\n$$\n` : `$${latex}$\n`;
  const result = spawnSync('pandoc', [
    '--from=markdown+tex_math_dollars',
    '--to=html5',
    '--mathml',
  ], {
    cwd: WORKSPACE_ROOT,
    input: markdown,
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (result.status !== 0) {
    const error = new Error('LATEX_RENDER_FAILED');
    error.details = { stderr: String(result.stderr || '').trim() };
    throw error;
  }
  const html = String(result.stdout || '');
  const match = html.match(/<math\b[\s\S]*?<\/math>/i);
  if (!match) throw new Error('LATEX_RENDER_EMPTY');
  const rendered = {
    latex,
    display: display === true,
    mathml: match[0],
  };
  MATH_CACHE.set(cacheKey, rendered);
  if (MATH_CACHE.size > 1000) MATH_CACHE.delete(MATH_CACHE.keys().next().value);
  return { ...rendered };
}

function normalizeBlock(value, usedIds = new Set()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('INVALID_DOCUMENT_BLOCK');
  }
  const type = shortText(value.type);
  if (!ALLOWED_BLOCK_TYPES.has(type)) throw new Error(`INVALID_DOCUMENT_BLOCK_TYPE: ${type}`);
  const id = value.id ? blockId(value.id) : newBlockId();
  if (usedIds.has(id)) throw new Error(`DUPLICATE_DOCUMENT_BLOCK_ID: ${id}`);
  usedIds.add(id);

  if (type === 'rich' || type === 'table') {
    const html = sanitizeHtml(value.html);
    const normalized = { id, type, html };
    if (type === 'table' && !/<table\b/i.test(html)) throw new Error('TABLE_BLOCK_REQUIRES_TABLE');
    return normalized;
  }
  if (type === 'formula') {
    const rendered = renderMath(value.latex, value.display !== false);
    return { id, type, ...rendered };
  }
  const dataUri = safeImageSource(value.data_uri);
  if (!dataUri) throw new Error('INVALID_DOCUMENT_IMAGE');
  const width = Number.parseInt(value.width_percent, 10);
  return {
    id,
    type,
    data_uri: dataUri,
    alt: String(value.alt || '').slice(0, 500),
    width_percent: Number.isInteger(width) ? Math.min(100, Math.max(10, width)) : 100,
  };
}

function normalizeBlocks(values) {
  if (!Array.isArray(values)) throw new Error('INVALID_DOCUMENT_BLOCKS');
  if (values.length > MAX_BLOCKS) throw new Error('TOO_MANY_DOCUMENT_BLOCKS');
  const usedIds = new Set();
  const blocks = values.map((block) => normalizeBlock(block, usedIds));
  return blocks.length ? blocks : [{ id: newBlockId(), type: 'rich', html: '<p><br></p>' }];
}

function validateStoredDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('INVALID_VISUAL_DOCUMENT');
  if (document.schema_version !== DOCUMENT_SCHEMA_VERSION) throw new Error('UNSUPPORTED_VISUAL_DOCUMENT_SCHEMA');
  const id = documentId(document.document_id);
  const revision = Number.parseInt(document.revision, 10);
  if (!Number.isInteger(revision) || revision < 0) throw new Error('INVALID_DOCUMENT_REVISION');
  const blocks = normalizeBlocks(document.blocks);
  return {
    schema_version: DOCUMENT_SCHEMA_VERSION,
    document_id: id,
    title: String(document.title || 'Untitled').slice(0, 240),
    revision,
    updated_at: String(document.updated_at || new Date(0).toISOString()),
    blocks,
  };
}

function writeDocument(document) {
  const normalized = validateStoredDocument(document);
  const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DOCUMENT_BYTES) throw new Error('DOCUMENT_TOO_LARGE');
  const directory = documentDirectory(normalized.document_id);
  fs.mkdirSync(directory, { recursive: true });
  const target = documentFile(normalized.document_id);
  const temporary = path.join(directory, `.document.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, target);
  return normalized;
}

function createDocument(args = {}) {
  const id = documentId(args.document_id, 'notes');
  const target = documentFile(id);
  if (fs.existsSync(target)) throw new Error(`DOCUMENT_ALREADY_EXISTS: ${id}`);
  const document = {
    schema_version: DOCUMENT_SCHEMA_VERSION,
    document_id: id,
    title: String(args.title || 'Untitled').slice(0, 240),
    revision: 0,
    updated_at: new Date().toISOString(),
    blocks: [{ id: newBlockId(), type: 'rich', html: '<p><br></p>' }],
  };
  return writeDocument(document);
}

function readDocument(idValue, options = {}) {
  const id = documentId(idValue, 'notes');
  const target = documentFile(id);
  if (!fs.existsSync(target)) {
    if (options.createIfMissing === true) return createDocument({ document_id: id, title: options.title });
    throw new Error(`DOCUMENT_NOT_FOUND: ${id}`);
  }
  const raw = fs.readFileSync(target, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_DOCUMENT_BYTES) throw new Error('DOCUMENT_TOO_LARGE');
  return validateStoredDocument(JSON.parse(raw));
}

function expectedRevision(args, current) {
  if (args.expected_revision === undefined || args.expected_revision === null) return;
  const expected = Number.parseInt(args.expected_revision, 10);
  if (!Number.isInteger(expected) || expected < 0) throw new Error('INVALID_EXPECTED_REVISION');
  if (expected !== current.revision) {
    const error = new Error(`DOCUMENT_REVISION_CONFLICT: expected ${expected}, current ${current.revision}`);
    error.details = { expected_revision: expected, current_revision: current.revision };
    throw error;
  }
}

function saveDocument(args = {}) {
  const current = readDocument(args.document_id, { createIfMissing: false });
  expectedRevision(args, current);
  const next = {
    ...current,
    title: args.title === undefined ? current.title : String(args.title || 'Untitled').slice(0, 240),
    revision: current.revision + 1,
    updated_at: new Date().toISOString(),
    blocks: normalizeBlocks(args.blocks),
  };
  return writeDocument(next);
}

function normalizeOperationBlock(value) {
  return normalizeBlock(value, new Set());
}

function applyDocumentOperations(args = {}) {
  const current = readDocument(args.document_id, { createIfMissing: false });
  expectedRevision(args, current);
  if (!Array.isArray(args.operations) || !args.operations.length) throw new Error('MISSING_DOCUMENT_OPERATIONS');
  if (args.operations.length > 100) throw new Error('TOO_MANY_DOCUMENT_OPERATIONS');

  let title = current.title;
  const blocks = current.blocks.map((block) => ({ ...block }));
  for (const operation of args.operations) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error('INVALID_DOCUMENT_OPERATION');
    const type = shortText(operation.type);
    if (type === 'set_title') {
      title = String(operation.title || 'Untitled').slice(0, 240);
      continue;
    }
    if (type === 'insert_after') {
      const block = normalizeOperationBlock(operation.block);
      if (blocks.some((item) => item.id === block.id)) throw new Error(`DUPLICATE_DOCUMENT_BLOCK_ID: ${block.id}`);
      if (operation.after_block_id === null || operation.after_block_id === undefined || operation.after_block_id === '') {
        blocks.unshift(block);
      } else {
        const index = blocks.findIndex((item) => item.id === blockId(operation.after_block_id));
        if (index < 0) throw new Error(`DOCUMENT_BLOCK_NOT_FOUND: ${shortText(operation.after_block_id)}`);
        blocks.splice(index + 1, 0, block);
      }
      continue;
    }
    if (type === 'replace_block') {
      const targetId = blockId(operation.block_id);
      const index = blocks.findIndex((item) => item.id === targetId);
      if (index < 0) throw new Error(`DOCUMENT_BLOCK_NOT_FOUND: ${targetId}`);
      const replacement = normalizeOperationBlock({ ...operation.block, id: targetId });
      blocks[index] = replacement;
      continue;
    }
    if (type === 'delete_block') {
      const targetId = blockId(operation.block_id);
      const index = blocks.findIndex((item) => item.id === targetId);
      if (index < 0) throw new Error(`DOCUMENT_BLOCK_NOT_FOUND: ${targetId}`);
      blocks.splice(index, 1);
      continue;
    }
    throw new Error(`UNKNOWN_DOCUMENT_OPERATION: ${type}`);
  }

  return writeDocument({
    ...current,
    title,
    revision: current.revision + 1,
    updated_at: new Date().toISOString(),
    blocks: normalizeBlocks(blocks),
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function documentHtml(document) {
  const body = document.blocks.map((block) => {
    if (block.type === 'rich' || block.type === 'table') return block.html;
    if (block.type === 'formula') {
      const delimiter = block.display ? ['\\[', '\\]'] : ['\\(', '\\)'];
      return `<div class="formula">${delimiter[0]}${escapeHtml(block.latex)}${delimiter[1]}</div>`;
    }
    return `<figure><img src="${escapeAttribute(block.data_uri)}" alt="${escapeAttribute(block.alt)}" style="max-width:${block.width_percent}%"><figcaption>${escapeHtml(block.alt)}</figcaption></figure>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(document.title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:52rem;margin:3rem auto;line-height:1.55}img{height:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:.35rem}.formula{text-align:center;margin:1rem 0}</style>
</head>
<body>
<h1>${escapeHtml(document.title)}</h1>
${body}
</body>
</html>
`;
}

function runPandoc(args, input) {
  const result = spawnSync('pandoc', args, {
    cwd: WORKSPACE_ROOT,
    input,
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.status !== 0) {
    const error = new Error('DOCUMENT_EXPORT_FAILED');
    error.details = { command: ['pandoc', ...args], stderr: String(result.stderr || '').trim() };
    throw error;
  }
  return result;
}

function exportDocument(args = {}) {
  const document = readDocument(args.document_id, { createIfMissing: false });
  const format = shortText(args.format).toLowerCase();
  if (!['html', 'tex', 'pdf'].includes(format)) throw new Error(`UNSUPPORTED_DOCUMENT_EXPORT: ${format}`);
  const exportsDirectory = path.join(documentDirectory(document.document_id), 'exports');
  fs.mkdirSync(exportsDirectory, { recursive: true });
  const html = documentHtml(document);
  const output = path.join(exportsDirectory, `${document.document_id}.${format}`);
  if (format === 'html') {
    fs.writeFileSync(output, html, 'utf8');
  } else if (format === 'tex') {
    runPandoc([
      '--from=html+tex_math_single_backslash',
      '--to=latex',
      '--standalone',
      '--output', output,
    ], html);
  } else {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-document-export-'));
    const source = path.join(temporary, 'document.html');
    fs.writeFileSync(source, html, 'utf8');
    try {
      runPandoc([
        '--from=html+tex_math_single_backslash',
        '--pdf-engine=xelatex',
        '--pdf-engine-opt=-no-shell-escape',
        '--output', output,
        source,
      ]);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
  return {
    ok: true,
    document_id: document.document_id,
    revision: document.revision,
    format,
    path: relative(output),
    bytes: fs.statSync(output).size,
  };
}

function documentSummary(document) {
  return {
    document_id: document.document_id,
    title: document.title,
    revision: document.revision,
    updated_at: document.updated_at,
    block_count: document.blocks.length,
    block_ids: document.blocks.map((block) => block.id),
  };
}

module.exports = {
  DOCUMENTS_DIR,
  applyDocumentOperations,
  createDocument,
  documentFile,
  documentHtml,
  documentSummary,
  exportDocument,
  newBlockId,
  normalizeBlocks,
  readDocument,
  renderMath,
  sanitizeHtml,
  saveDocument,
};
