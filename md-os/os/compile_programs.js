#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  printJson,
  sha256Json,
  sha256Text,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const PROGRAMS_DIR = path.join(OPS_DIR, 'programs');
const COMPILED_DIR = path.join(OPS_DIR, 'compiled');
const OUTPUT_JSON = path.join(COMPILED_DIR, 'programs.json');
const OUTPUT_MD = path.join(COMPILED_DIR, 'programs.md');

const REQUIRED_SECTIONS = ['Trigger', 'Conditions', 'Actions', 'Output'];

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath);
}

function programIdFromFilename(filePath) {
  return assertSafeId(path.basename(filePath, '.md'), 'program_id');
}

function normalizeHeading(value) {
  return shortText(value).replace(/:$/, '');
}

function parseListItems(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => shortText(line.slice(2)))
    .filter(Boolean);
}

function parseSections(markdown) {
  const sections = {};
  let current = null;
  const lines = String(markdown || '').split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      current = normalizeHeading(match[1]);
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }

  return Object.fromEntries(
    Object.entries(sections).map(([key, value]) => [key, value.join('\n').trim()])
  );
}

function titleFromMarkdown(markdown, fallback) {
  const firstHeading = String(markdown || '').split(/\r?\n/).find((line) => line.startsWith('# '));
  if (!firstHeading) return fallback;
  return shortText(firstHeading.replace(/^#\s+/, ''));
}

function idFromTitle(title, fallback) {
  const match = shortText(title).match(/^Program:\s*([A-Za-z0-9_-]+)/i);
  if (!match) return fallback;
  return assertSafeId(match[1], 'program_id');
}

function validateProgram(program) {
  for (const section of REQUIRED_SECTIONS) {
    if (!shortText(program.sections[section])) {
      throw new Error(`PROGRAM_SECTION_REQUIRED: ${program.program_id}:${section}`);
    }
  }
  if (!program.conditions.length) throw new Error(`PROGRAM_CONDITIONS_REQUIRED: ${program.program_id}`);
  if (!program.actions.length) throw new Error(`PROGRAM_ACTIONS_REQUIRED: ${program.program_id}`);
  if (!program.outputs.length) throw new Error(`PROGRAM_OUTPUT_REQUIRED: ${program.program_id}`);
  return program;
}

function parseProgramFile(filePath) {
  const markdown = fs.readFileSync(filePath, 'utf8');
  const fallbackId = programIdFromFilename(filePath);
  const title = titleFromMarkdown(markdown, `Program: ${fallbackId}`);
  const programId = idFromTitle(title, fallbackId);
  const sections = parseSections(markdown);
  const program = {
    program_id: programId,
    title,
    source_file: rel(filePath),
    source_sha256: sha256Text(markdown),
    trigger: shortText(sections.Trigger || ''),
    conditions: parseListItems(sections.Conditions),
    actions: parseListItems(sections.Actions),
    outputs: parseListItems(sections.Output),
    sections: {
      Trigger: shortText(sections.Trigger || ''),
      Conditions: shortText(sections.Conditions || ''),
      Actions: shortText(sections.Actions || ''),
      Output: shortText(sections.Output || ''),
    },
  };
  return validateProgram(program);
}

function listProgramFiles() {
  if (!fs.existsSync(PROGRAMS_DIR)) return [];
  return fs.readdirSync(PROGRAMS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(PROGRAMS_DIR, entry.name))
    .sort();
}

function compilePrograms() {
  ensureDir(PROGRAMS_DIR);
  ensureDir(COMPILED_DIR);

  const programs = listProgramFiles()
    .map(parseProgramFile)
    .sort((left, right) => left.program_id.localeCompare(right.program_id));

  const seen = new Set();
  for (const program of programs) {
    if (seen.has(program.program_id)) throw new Error(`DUPLICATE_PROGRAM_ID: ${program.program_id}`);
    seen.add(program.program_id);
  }

  const sourceHash = sha256Json(programs.map((program) => ({
    program_id: program.program_id,
    source_file: program.source_file,
    source_sha256: program.source_sha256,
    sections: program.sections,
  })));

  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sourceHash,
    program_count: programs.length,
    programs,
  };
}

function buildMarkdown(compiled) {
  const lines = [
    '# Compiled Natural-Language Programs',
    '',
    `Updated at: \`${compiled.updated_at}\``,
    '',
    `Program count: \`${compiled.program_count}\``,
    '',
  ];

  if (!compiled.programs.length) {
    lines.push('- No natural-language programs compiled.');
  } else {
    for (const program of compiled.programs) {
      lines.push(`## ${program.program_id}`);
      lines.push('');
      lines.push(`Source: \`${program.source_file}\``);
      lines.push('');
      lines.push(`Trigger: ${program.trigger}`);
      lines.push('');
      lines.push('Conditions:');
      lines.push(...program.conditions.map((item) => `- ${item}`));
      lines.push('');
      lines.push('Actions:');
      lines.push(...program.actions.map((item) => `- ${item}`));
      lines.push('');
      lines.push('Outputs:');
      lines.push(...program.outputs.map((item) => `- ${item}`));
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const compiled = compilePrograms();
  withFileLock('builder__compile_programs', {
    context: 'compile_programs',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, compiled);
    atomicWriteText(OUTPUT_MD, buildMarkdown(compiled));
  });
  appendJournal({
    event: 'programs_compiled',
    program_count: compiled.program_count,
    source_hash: compiled.source_hash,
  });
  printJson({
    ok: true,
    mode: 'compile_programs',
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
    program_count: compiled.program_count,
    source_hash: compiled.source_hash,
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  compilePrograms,
  parseProgramFile,
  parseSections,
};
