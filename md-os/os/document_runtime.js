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
const MAX_WHITEBOARD_STROKES = 5000;
const MAX_WHITEBOARD_POINTS_PER_STROKE = 5000;
const MAX_WHITEBOARD_TOTAL_POINTS = 100000;
const MAX_WHITEBOARD_ANNOTATIONS = 500;
const MAX_WHITEBOARD_ANNOTATION_LENGTH = 5000;
const DEFAULT_WHITEBOARD_HEIGHT = 1000;
const MIN_WHITEBOARD_HEIGHT = 600;
const MAX_WHITEBOARD_HEIGHT = 8000;
const WHITEBOARD_AI_FONT_SIZE = 48;
const WHITEBOARD_TEXT_MIN_FONT_SIZE = 18;
const WHITEBOARD_TEXT_RIGHT_MARGIN = 64;
const WHITEBOARD_TEXT_MIN_LINE_WIDTH = 120;
const WHITEBOARD_WIDTH = 1600;
const ALLOWED_BLOCK_TYPES = new Set(['rich', 'table', 'formula', 'image', 'whiteboard']);
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
const STROKE_ID_PATTERN = /^s_[a-f0-9]{16,32}$/;
const ANNOTATION_ID_PATTERN = /^a_[a-f0-9]{16,32}$/;
const WHITEBOARD_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
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

function newStrokeId() {
  return `s_${crypto.randomBytes(10).toString('hex')}`;
}

function newAnnotationId() {
  return `a_${crypto.randomBytes(10).toString('hex')}`;
}

function strokeId(value) {
  const candidate = shortText(value);
  if (!STROKE_ID_PATTERN.test(candidate)) throw new Error(`INVALID_WHITEBOARD_STROKE_ID: ${candidate}`);
  return candidate;
}

function annotationId(value) {
  const candidate = shortText(value);
  if (!ANNOTATION_ID_PATTERN.test(candidate)) throw new Error(`INVALID_WHITEBOARD_ANNOTATION_ID: ${candidate}`);
  return candidate;
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

function finiteWhiteboardNumber(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`INVALID_WHITEBOARD_${label}`);
  return Math.round(Math.min(maximum, Math.max(minimum, number)) * 1000) / 1000;
}

function normalizeWhiteboardStroke(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('INVALID_WHITEBOARD_STROKE');
  }
  const tool = shortText(value.tool);
  if (!['pen', 'eraser'].includes(tool)) throw new Error(`INVALID_WHITEBOARD_TOOL: ${tool}`);
  const color = tool === 'eraser' ? '#ffffff' : String(value.color || '').toLowerCase();
  if (!WHITEBOARD_COLOR_PATTERN.test(color)) throw new Error(`INVALID_WHITEBOARD_COLOR: ${color}`);
  if (!Array.isArray(value.points) || !value.points.length) throw new Error('EMPTY_WHITEBOARD_STROKE');
  if (value.points.length > MAX_WHITEBOARD_POINTS_PER_STROKE) throw new Error('WHITEBOARD_STROKE_TOO_LARGE');
  return {
    id: value.id ? strokeId(value.id) : newStrokeId(),
    tool,
    color,
    points: value.points.map((point) => {
      if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error('INVALID_WHITEBOARD_POINT');
      return {
        x: finiteWhiteboardNumber(point.x, 'POINT_X', 0, 1600),
        y: finiteWhiteboardNumber(point.y, 'POINT_Y', 0, MAX_WHITEBOARD_HEIGHT),
        width: finiteWhiteboardNumber(point.width, 'POINT_WIDTH', 0.5, 100),
      };
    }),
  };
}

function normalizeWhiteboardStrokes(values) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new Error('INVALID_WHITEBOARD_STROKES');
  if (values.length > MAX_WHITEBOARD_STROKES) throw new Error('TOO_MANY_WHITEBOARD_STROKES');
  const usedIds = new Set();
  let totalPoints = 0;
  return values.map((value) => {
    const stroke = normalizeWhiteboardStroke(value);
    if (usedIds.has(stroke.id)) throw new Error(`DUPLICATE_WHITEBOARD_STROKE_ID: ${stroke.id}`);
    usedIds.add(stroke.id);
    totalPoints += stroke.points.length;
    if (totalPoints > MAX_WHITEBOARD_TOTAL_POINTS) throw new Error('WHITEBOARD_POINTS_LIMIT_EXCEEDED');
    return stroke;
  });
}

function normalizeWhiteboardAnnotation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('INVALID_WHITEBOARD_ANNOTATION');
  }
  const latex = value.latex === undefined || value.latex === null || String(value.latex).trim() === ''
    ? null
    : safeLatex(value.latex);
  const rendered = latex ? renderMath(latex, true) : null;
  const rawDataUri = value.data_uri === undefined || value.data_uri === null
    ? ''
    : String(value.data_uri).trim();
  const dataUri = rawDataUri ? safeImageSource(rawDataUri) : null;
  if (rawDataUri && !dataUri) throw new Error('INVALID_WHITEBOARD_IMAGE');
  const text = String(value.text || rendered?.latex || (dataUri ? 'Clipboard image' : ''))
    .trim()
    .slice(0, MAX_WHITEBOARD_ANNOTATION_LENGTH);
  if (!text) throw new Error('EMPTY_WHITEBOARD_ANNOTATION');
  const color = String(value.color || '#1769e0').toLowerCase();
  if (!WHITEBOARD_COLOR_PATTERN.test(color)) throw new Error(`INVALID_WHITEBOARD_COLOR: ${color}`);
  return {
    id: value.id ? annotationId(value.id) : newAnnotationId(),
    text,
    x: finiteWhiteboardNumber(value.x, 'ANNOTATION_X', 0, 1600),
    y: finiteWhiteboardNumber(value.y, 'ANNOTATION_Y', 0, MAX_WHITEBOARD_HEIGHT),
    color,
    font_size: finiteWhiteboardNumber(value.font_size ?? 34, 'ANNOTATION_FONT_SIZE', 18, 72),
    ...(rendered ? { latex: rendered.latex, mathml: rendered.mathml } : {}),
    ...(dataUri ? {
      data_uri: dataUri,
      width: finiteWhiteboardNumber(value.width ?? 640, 'ANNOTATION_WIDTH', 16, 1600),
      height: finiteWhiteboardNumber(value.height ?? 480, 'ANNOTATION_HEIGHT', 16, MAX_WHITEBOARD_HEIGHT),
    } : {}),
  };
}

function normalizeWhiteboardAnnotations(values) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new Error('INVALID_WHITEBOARD_ANNOTATIONS');
  if (values.length > MAX_WHITEBOARD_ANNOTATIONS) throw new Error('TOO_MANY_WHITEBOARD_ANNOTATIONS');
  const usedIds = new Set();
  return values.map((value) => {
    const annotation = normalizeWhiteboardAnnotation(value);
    if (usedIds.has(annotation.id)) throw new Error(`DUPLICATE_WHITEBOARD_ANNOTATION_ID: ${annotation.id}`);
    usedIds.add(annotation.id);
    return annotation;
  });
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
  if (type === 'whiteboard') {
    const height = Number.parseInt(value.height_px, 10);
    return {
      id,
      type,
      height_px: Number.isInteger(height)
        ? Math.min(MAX_WHITEBOARD_HEIGHT, Math.max(MIN_WHITEBOARD_HEIGHT, height))
        : DEFAULT_WHITEBOARD_HEIGHT,
      strokes: normalizeWhiteboardStrokes(value.strokes),
      annotations: normalizeWhiteboardAnnotations(value.annotations),
    };
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
    if (type === 'whiteboard_append_stroke') {
      const targetId = blockId(operation.block_id);
      const index = blocks.findIndex((item) => item.id === targetId);
      if (index < 0) throw new Error(`DOCUMENT_BLOCK_NOT_FOUND: ${targetId}`);
      if (blocks[index].type !== 'whiteboard') throw new Error(`DOCUMENT_BLOCK_NOT_WHITEBOARD: ${targetId}`);
      const stroke = normalizeWhiteboardStroke(operation.stroke);
      const strokes = normalizeWhiteboardStrokes(blocks[index].strokes);
      if (!strokes.some((item) => item.id === stroke.id)) strokes.push(stroke);
      blocks[index] = normalizeOperationBlock({ ...blocks[index], strokes });
      continue;
    }
    if (type === 'whiteboard_undo') {
      const targetId = blockId(operation.block_id);
      const index = blocks.findIndex((item) => item.id === targetId);
      if (index < 0) throw new Error(`DOCUMENT_BLOCK_NOT_FOUND: ${targetId}`);
      if (blocks[index].type !== 'whiteboard') throw new Error(`DOCUMENT_BLOCK_NOT_WHITEBOARD: ${targetId}`);
      const targetStrokeId = strokeId(operation.stroke_id);
      const strokes = normalizeWhiteboardStrokes(blocks[index].strokes)
        .filter((stroke) => stroke.id !== targetStrokeId);
      blocks[index] = normalizeOperationBlock({ ...blocks[index], strokes });
      continue;
    }
    if (type === 'whiteboard_clear') {
      const targetId = blockId(operation.block_id);
      const index = blocks.findIndex((item) => item.id === targetId);
      if (index < 0) throw new Error(`DOCUMENT_BLOCK_NOT_FOUND: ${targetId}`);
      if (blocks[index].type !== 'whiteboard') throw new Error(`DOCUMENT_BLOCK_NOT_WHITEBOARD: ${targetId}`);
      blocks[index] = normalizeOperationBlock({ ...blocks[index], strokes: [], annotations: [] });
      continue;
    }
    if (type === 'whiteboard_add_text') {
      const targetId = blockId(operation.block_id);
      const index = blocks.findIndex((item) => item.id === targetId);
      if (index < 0) throw new Error(`DOCUMENT_BLOCK_NOT_FOUND: ${targetId}`);
      if (blocks[index].type !== 'whiteboard') throw new Error(`DOCUMENT_BLOCK_NOT_WHITEBOARD: ${targetId}`);
      const annotation = normalizeWhiteboardAnnotation(operation.annotation);
      const annotations = normalizeWhiteboardAnnotations(blocks[index].annotations);
      if (!annotations.some((item) => item.id === annotation.id)) annotations.push(annotation);
      blocks[index] = normalizeOperationBlock({ ...blocks[index], annotations });
      continue;
    }
    if (type === 'whiteboard_remove_text') {
      const targetId = blockId(operation.block_id);
      const index = blocks.findIndex((item) => item.id === targetId);
      if (index < 0) throw new Error(`DOCUMENT_BLOCK_NOT_FOUND: ${targetId}`);
      if (blocks[index].type !== 'whiteboard') throw new Error(`DOCUMENT_BLOCK_NOT_WHITEBOARD: ${targetId}`);
      const targetAnnotationId = annotationId(operation.annotation_id);
      const annotations = normalizeWhiteboardAnnotations(blocks[index].annotations)
        .filter((annotation) => annotation.id !== targetAnnotationId);
      blocks[index] = normalizeOperationBlock({ ...blocks[index], annotations });
      continue;
    }
    if (type === 'whiteboard_resize') {
      const targetId = blockId(operation.block_id);
      const index = blocks.findIndex((item) => item.id === targetId);
      if (index < 0) throw new Error(`DOCUMENT_BLOCK_NOT_FOUND: ${targetId}`);
      if (blocks[index].type !== 'whiteboard') throw new Error(`DOCUMENT_BLOCK_NOT_WHITEBOARD: ${targetId}`);
      blocks[index] = normalizeOperationBlock({
        ...blocks[index],
        height_px: operation.height_px,
      });
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

function whiteboardAnnotationHorizontalLayout(annotation) {
  const fontSize = Math.min(72, Math.max(
    WHITEBOARD_TEXT_MIN_FONT_SIZE,
    Number(annotation.font_size) || WHITEBOARD_AI_FONT_SIZE
  ));
  const requestedX = Math.max(0, Number(annotation.x) || 0);
  const x = Math.min(
    requestedX,
    Math.max(0, WHITEBOARD_WIDTH - WHITEBOARD_TEXT_RIGHT_MARGIN - WHITEBOARD_TEXT_MIN_LINE_WIDTH)
  );
  return {
    fontSize,
    x,
    maxWidth: Math.max(1, WHITEBOARD_WIDTH - x - WHITEBOARD_TEXT_RIGHT_MARGIN),
  };
}

function estimatedWhiteboardTextWidth(value, fontSize) {
  let units = 0;
  for (const character of Array.from(String(value))) {
    if (/\s/u.test(character)) units += 0.34;
    else if (/[ilI1.,'`:;|!]/u.test(character)) units += 0.36;
    else if (/[MW@%&#]/u.test(character)) units += 0.96;
    else if (character.codePointAt(0) > 0x2e7f) units += 1;
    else units += 0.68;
  }
  return units * fontSize;
}

function wrapWhiteboardExportLine(sourceLine, maxWidth, fontSize) {
  const words = String(sourceLine).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (estimatedWhiteboardTextWidth(candidate, fontSize) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) {
      lines.push(line);
      line = '';
    }
    if (estimatedWhiteboardTextWidth(word, fontSize) <= maxWidth) {
      line = word;
      continue;
    }
    let chunk = '';
    for (const character of Array.from(word)) {
      const nextChunk = `${chunk}${character}`;
      if (chunk && estimatedWhiteboardTextWidth(nextChunk, fontSize) > maxWidth) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk = nextChunk;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines;
}

function whiteboardExportTextLayout(annotation) {
  const horizontal = whiteboardAnnotationHorizontalLayout(annotation);
  const lines = [];
  for (const sourceLine of String(annotation.text || '').trim().replace(/\r\n?/g, '\n').split('\n')) {
    const wrapped = wrapWhiteboardExportLine(sourceLine, horizontal.maxWidth, horizontal.fontSize);
    if (wrapped.length) lines.push(...wrapped);
    else if (lines.length) lines.push('');
  }
  return { ...horizontal, lines };
}

function whiteboardSvg(block) {
  const height = Number.isInteger(block.height_px) ? block.height_px : DEFAULT_WHITEBOARD_HEIGHT;
  const parts = [
    `<svg class="whiteboard" xmlns="http://www.w3.org/2000/svg" width="1600" height="${height}" viewBox="0 0 1600 ${height}" style="max-width:100%;height:auto;background:#fff">`,
    `<rect width="1600" height="${height}" fill="#ffffff"/>`,
  ];
  for (const stroke of block.strokes || []) {
    const color = stroke.tool === 'eraser' ? '#ffffff' : stroke.color;
    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      parts.push(`<circle cx="${point.x}" cy="${point.y}" r="${point.width / 2}" fill="${color}"/>`);
      continue;
    }
    for (let index = 1; index < stroke.points.length; index += 1) {
      const previous = stroke.points[index - 1];
      const point = stroke.points[index];
      parts.push(`<line x1="${previous.x}" y1="${previous.y}" x2="${point.x}" y2="${point.y}" stroke="${color}" stroke-width="${point.width}" stroke-linecap="round"/>`);
    }
  }
  for (const annotation of block.annotations || []) {
    if (annotation.data_uri) {
      parts.push(`<image x="${annotation.x}" y="${annotation.y}" width="${annotation.width}" height="${annotation.height}" href="${escapeAttribute(annotation.data_uri)}" preserveAspectRatio="xMidYMid meet"/>`);
      continue;
    }
    if (annotation.latex && annotation.mathml) {
      const { fontSize, x, maxWidth } = whiteboardAnnotationHorizontalLayout(annotation);
      const rowCount = Math.max(1, (String(annotation.mathml).match(/<mtr(?:\s|>)/g) || []).length);
      const annotationHeight = Math.max(160, Math.ceil(fontSize * (rowCount * 1.9 + 0.6)));
      parts.push(`<foreignObject x="${x}" y="${annotation.y}" width="${maxWidth}" height="${annotationHeight}">`);
      parts.push(`<div xmlns="http://www.w3.org/1999/xhtml" style="display:block;width:100%;overflow:visible;color:${escapeAttribute(annotation.color)};font-size:${fontSize}px;line-height:1;white-space:nowrap">${annotation.mathml}</div>`);
      parts.push('</foreignObject>');
      continue;
    }
    const { fontSize, x, lines } = whiteboardExportTextLayout(annotation);
    parts.push(`<text x="${x}" y="${annotation.y}" fill="${escapeAttribute(annotation.color)}" font-family="Segoe Script, Apple Chancery, URW Chancery L, Lucida Calligraphy, cursive" font-size="${fontSize}" font-weight="700" paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round">`);
    lines.forEach((line, index) => {
      parts.push(`<tspan x="${x}" dy="${index === 0 ? 0 : fontSize * 1.25}">${escapeHtml(line.trim())}</tspan>`);
    });
    parts.push('</text>');
  }
  parts.push('</svg>');
  return parts.join('');
}

function whiteboardPdfAsset(block, document, exportsDirectory) {
  const base = `${document.document_id}-${block.id}-whiteboard`;
  const svgPath = path.join(exportsDirectory, `${base}.svg`);
  const pdfPath = path.join(exportsDirectory, `${base}.pdf`);
  fs.writeFileSync(svgPath, whiteboardSvg(block), 'utf8');
  const converted = spawnSync('inkscape', [
    svgPath,
    '--export-type=pdf',
    `--export-filename=${pdfPath}`,
  ], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (converted.status !== 0 || !fs.existsSync(pdfPath)) {
    const error = new Error('DOCUMENT_WHITEBOARD_VECTOR_EXPORT_FAILED');
    error.details = {
      command: ['inkscape', svgPath, '--export-type=pdf', `--export-filename=${pdfPath}`],
      stderr: String(converted.stderr || '').trim(),
    };
    throw error;
  }
  return pdfPath;
}

function documentHtml(document, whiteboardAssets = new Map()) {
  const body = document.blocks.map((block) => {
    if (block.type === 'rich' || block.type === 'table') return block.html;
    if (block.type === 'formula') {
      return `<div class="formula">${block.mathml}</div>`;
    }
    if (block.type === 'whiteboard') {
      const asset = whiteboardAssets.get(block.id);
      if (asset) {
        return `<figure><img class="whiteboard" src="${escapeAttribute(asset)}" alt="Shared Whiteboard" style="max-width:100%;height:auto"></figure>`;
      }
      return `<figure>${whiteboardSvg(block)}</figure>`;
    }
    return `<figure><img src="${escapeAttribute(block.data_uri)}" alt="${escapeAttribute(block.alt)}" style="max-width:${block.width_percent}%"><figcaption>${escapeHtml(block.alt)}</figcaption></figure>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(document.title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:52rem;margin:3rem auto;line-height:1.55}img{height:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:.35rem}.formula{text-align:center;margin:1rem 0}.formula math{font-size:1.2em}</style>
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

function runBrowserPdf(html, output) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-document-browser-export-'));
  const source = path.join(temporary, 'document.html');
  fs.writeFileSync(source, html, 'utf8');
  const candidates = [
    process.env.MDOS_CHROME_BIN,
    'google-chrome',
    'chromium',
    'chromium-browser',
  ].filter(Boolean);
  try {
    for (const executable of [...new Set(candidates)]) {
      fs.rmSync(output, { force: true });
      const result = spawnSync(executable, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--allow-file-access-from-files',
        '--no-pdf-header-footer',
        `--print-to-pdf=${output}`,
        `file://${source}`,
      ], {
        cwd: WORKSPACE_ROOT,
        encoding: 'utf8',
        timeout: 60_000,
      });
      if (result.status === 0 && fs.existsSync(output) && fs.statSync(output).size > 1000) {
        return true;
      }
    }
    return false;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function writeDocumentExport(document, format, exportsDirectory) {
  const whiteboardAssets = new Map();
  if (format === 'tex') {
    for (const block of document.blocks) {
      if (block.type === 'whiteboard') {
        whiteboardAssets.set(block.id, whiteboardPdfAsset(block, document, exportsDirectory));
      }
    }
  }
  const html = documentHtml(document, whiteboardAssets);
  const output = path.join(exportsDirectory, `${document.document_id}.${format}`);
  let engine = 'direct';
  if (format === 'html') {
    fs.writeFileSync(output, html, 'utf8');
  } else if (format === 'tex') {
    engine = 'pandoc_latex';
    runPandoc([
      '--from=html+tex_math_single_backslash',
      '--to=latex',
      '--standalone',
      '--output', output,
    ], html);
  } else {
    engine = 'browser_pdf';
    if (!runBrowserPdf(html, output)) {
      engine = 'pandoc_xelatex';
      for (const block of document.blocks) {
        if (block.type === 'whiteboard') {
          whiteboardAssets.set(block.id, whiteboardPdfAsset(block, document, exportsDirectory));
        }
      }
      const fallbackHtml = documentHtml(document, whiteboardAssets);
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-document-export-'));
      const source = path.join(temporary, 'document.html');
      fs.writeFileSync(source, fallbackHtml, 'utf8');
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
  }
  return {
    engine,
    output,
    bytes: fs.statSync(output).size,
  };
}

function exportDocument(args = {}) {
  const document = readDocument(args.document_id, { createIfMissing: false });
  const format = shortText(args.format).toLowerCase();
  if (!['html', 'tex', 'pdf'].includes(format)) throw new Error(`UNSUPPORTED_DOCUMENT_EXPORT: ${format}`);
  const exportsDirectory = path.join(documentDirectory(document.document_id), 'exports');
  fs.mkdirSync(exportsDirectory, { recursive: true });
  const exported = writeDocumentExport(document, format, exportsDirectory);
  return {
    ok: true,
    document_id: document.document_id,
    revision: document.revision,
    format,
    engine: exported.engine,
    path: relative(exported.output),
    bytes: exported.bytes,
  };
}

function exportTemporaryPdf(args = {}) {
  const document = readDocument(args.document_id, { createIfMissing: false });
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-document-pdf-'));
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  };
  try {
    const exported = writeDocumentExport(document, 'pdf', temporaryDirectory);
    return {
      ok: true,
      document_id: document.document_id,
      revision: document.revision,
      format: 'pdf',
      engine: exported.engine,
      path: exported.output,
      bytes: exported.bytes,
      temporary: true,
      cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
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
  exportTemporaryPdf,
  newBlockId,
  normalizeBlocks,
  readDocument,
  renderMath,
  sanitizeHtml,
  saveDocument,
};
