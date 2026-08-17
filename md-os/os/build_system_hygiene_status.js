#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  nowIso,
  printJson,
  sha256Json,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const GLOBAL_INDEX_FILE = path.join(OPS_DIR, 'global_index.json');
const WORKSPACE_INVENTORY_FILE = path.join(OPS_DIR, 'workspace_inventory.json');
const OUTPUT_JSON = path.join(OPS_DIR, 'system_hygiene_status.json');
const OUTPUT_MD = path.join(OPS_DIR, 'system_hygiene_status.md');
const MDOSIGNORE_FILE = path.join(WORKSPACE_ROOT, '.mdosignore');
const ELEVATED_CODEX_FLAG = 'dangerously-bypass-approvals-and-sandbox';
const AUTHORIZED_ELEVATED_LAUNCHERS = [
  {
    path: 'bootstrap-md-os-codex.sh',
    flag: `--${ELEVATED_CODEX_FLAG}`,
    reason: 'Verified Codex launcher with an explicit opt-in unsafe mode for externally hardened environments.',
    required_markers: [
      'mdos_bootstrap_prompt',
      'mdos_bootstrap_prelude',
      'MDOS_SKIP_HARDWARE_BOOTSTRAP',
      'MDOS_SKIP_SOFTWARE_BOOTSTRAP',
      'exec codex',
    ],
  },
];

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  atomicWriteJson(filePath, payload);
}

function writeText(filePath, text) {
  atomicWriteText(filePath, text);
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function workspaceFilePath(relativePath) {
  return path.join(WORKSPACE_ROOT, relativePath);
}

function readTextFileSafe(relativePath, maxBytes = 500000) {
  const filePath = workspaceFilePath(relativePath);
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > maxBytes) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return '';
  }
}

function readMdosIgnore() {
  if (!fs.existsSync(MDOSIGNORE_FILE)) return [];
  return fs.readFileSync(MDOSIGNORE_FILE, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ignorePatternToRegExp(pattern) {
  const normalized = String(pattern || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized) return null;
  if (normalized.endsWith('/')) return new RegExp(`^${escapeRegExp(normalized)}`);
  const wildcard = escapeRegExp(normalized).replace(/\\\*/g, '.*');
  return new RegExp(`^${wildcard}$`);
}

function buildIgnoreMatcher(patterns) {
  const regexps = patterns.map(ignorePatternToRegExp).filter(Boolean);
  return (relativePath) => {
    const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
    return regexps.some((regexp) => regexp.test(normalized));
  };
}

function filterDuplicateGroups(groups, ignoredPath, fileByPath) {
  return (groups || [])
    .map((group) => {
      const paths = (group.paths || []).filter((filePath) => !ignoredPath(filePath));
      if (paths.length < 2) return null;
      return {
        ...group,
        file_count: paths.length,
        total_size_bytes: paths.reduce((sum, filePath) => {
          const file = fileByPath.get(filePath);
          return sum + (file ? file.size_bytes : 0);
        }, 0),
        paths,
      };
    })
    .filter(Boolean);
}

function detectLocalPathFiles(files) {
  const textExtensions = new Set(['.json', '.md', '.ndjson', '.txt', '.js', '.sh', '.tex']);
  const localPathPattern = /(?:\/home\/[^\s"'`]+|\/Users\/[^\s"'`]+|[A-Za-z]:\\(?:Users|Windows|Program Files|[^\s\\]+\\))/;
  return files
    .filter((file) => textExtensions.has(file.extension))
    .filter((file) => localPathPattern.test(readTextFileSafe(file.path)))
    .map((file) => file.path)
    .sort();
}

function classifyElevatedScripts(files) {
  const authorized = [];
  const unsafe = [];
  const launcherByPath = new Map(AUTHORIZED_ELEVATED_LAUNCHERS.map((item) => [item.path, item]));
  for (const file of files.filter((item) => item.extension === '.sh')) {
    const text = readTextFileSafe(file.path);
    if (!text.includes(ELEVATED_CODEX_FLAG)) continue;
    const launcher = launcherByPath.get(file.path);
    if (launcher && launcher.required_markers.every((marker) => text.includes(marker))) {
      authorized.push({
        path: file.path,
        flag: launcher.flag,
        reason: launcher.reason,
      });
    } else {
      unsafe.push(file.path);
    }
  }
  return {
    authorized: authorized.sort((left, right) => left.path.localeCompare(right.path)),
    unsafe: unsafe.sort(),
  };
}

function detectPermissiveConfigs(files) {
  const flagged = [];
  for (const file of files.filter((item) => item.extension === '.json')) {
    try {
      const payload = JSON.parse(readTextFileSafe(file.path));
      if (shortText(payload && payload.permission).toLowerCase() === 'allow') {
        flagged.push(file.path);
      }
    } catch (_) {
    }
  }
  return flagged.sort();
}

function worstStatus(levels) {
  if (levels.includes('critical')) return 'critical';
  if (levels.includes('attention')) return 'attention';
  return 'ok';
}

function buildStatus() {
  const globalIndex = readJson(GLOBAL_INDEX_FILE);
  const inventory = readJson(WORKSPACE_INVENTORY_FILE);
  const ignorePatterns = readMdosIgnore();
  const ignoredPath = buildIgnoreMatcher(ignorePatterns);
  const ignoredFiles = inventory.files.filter((file) => ignoredPath(file.path)).map((file) => file.path).sort();
  const hygieneFiles = inventory.files.filter((file) => !ignoredPath(file.path));
  const fileByPath = new Map(inventory.files.map((file) => [file.path, file]));
  const ignoredLogicalMergeCandidateKeys = new Set([
    '.json:project.json',
    '.json:terminal_connector.json',
    '.md:readme.md',
    '.json:active_memory.json',
    '.json:agenda.json',
    '.json:priority_queue.json',
    '.json:relations.json',
    '.json:status.json',
    '.md:active_memory.md',
    '.md:agenda.md',
    '.md:priority_queue.md',
    '.md:relations.md',
    '.md:status.md',
    '.md:self_release_index.md',
    '.md:semantic_knowledge_graph.md',
    '.md:semantic_knowledge_summary.md',
    '.md:workspace_inventory.md',
    '.ndjson:work_items.ndjson',
  ]);
  const intentionalLogicalMergeCandidateGroups = [
    {
      key: '.js:index.js',
      pathPattern: /^md-os\/modules\/[^/]+\/index\.js$/,
    },
    {
      key: '.json:module.json',
      pathPattern: /^md-os\/modules\/[^/]+\/module\.json$/,
    },
    {
      key: '.md:module.md',
      pathPattern: /^md-os\/modules\/[^/]+\/module\.md$/,
    },
    {
      key: '.md:natural_language_agentic_substrate_layer.md',
      pathPattern: /^(?:docs|md-os\/kb)\/NATURAL_LANGUAGE_AGENTIC_SUBSTRATE_LAYER\.md$/,
    },
    {
      key: '.js:regression.check.js',
      pathPattern: /^md-os\/benchmarks\/software_repair\/fixtures\/[^/]+\/checks\/regression\.check\.js$/,
    },
    {
      key: '.js:targeted.check.js',
      pathPattern: /^md-os\/benchmarks\/software_repair\/fixtures\/[^/]+\/checks\/targeted\.check\.js$/,
    },
    {
      key: '.json:graph.json',
      pathPattern: /^(?:\.obsidian|graphify-out)\/graph\.json$/,
    },
  ];

  function isIntentionalLogicalMergeCandidate(item) {
    return intentionalLogicalMergeCandidateGroups.some((group) => (
      item.key === group.key
      && item.paths.every((filePath) => group.pathPattern.test(filePath))
    ));
  }

  const requiredRuntimeFiles = [
    path.join(OPS_DIR, 'global_index.json'),
    path.join(OPS_DIR, 'global_index.md'),
    path.join(OPS_DIR, 'markdown_graph.json'),
    path.join(OPS_DIR, 'markdown_graph.md'),
    path.join(OPS_DIR, 'semantic_knowledge_graph.json'),
    path.join(OPS_DIR, 'semantic_knowledge_graph.md'),
    path.join(OPS_DIR, 'semantic_knowledge_summary.json'),
    path.join(OPS_DIR, 'semantic_knowledge_summary.md'),
    path.join(OPS_DIR, 'releases', 'self_release_index.json'),
    path.join(OPS_DIR, 'releases', 'self_release_index.md'),
    path.join(OPS_DIR, 'workspace_inventory.json'),
    path.join(OPS_DIR, 'workspace_inventory.md'),
    path.join(OPS_DIR, 'core', 'agentic_core.json'),
    path.join(OPS_DIR, 'core', 'agentic_core.md'),
    path.join(OPS_DIR, 'runtime_lifecycle_index.json'),
    path.join(OPS_DIR, 'runtime_lifecycle_index.md'),
    path.join(OPS_DIR, 'journal.ndjson'),
    path.join(OPS_DIR, 'current_task.md'),
    path.join(OPS_DIR, 'continuity.md'),
    path.join(OPS_DIR, 'state.json'),
    path.join(OPS_DIR, 'last_summary.md'),
    path.join(OPS_DIR, 'agenda', 'global_agenda.json'),
    path.join(OPS_DIR, 'agenda', 'global_agenda.md'),
  ];

  const missingRequiredFiles = requiredRuntimeFiles.filter((filePath) => !exists(filePath)).map(rel);
  const intentionalExactDuplicateGroups = [
    {
      pathPattern: /^\.obsidian\/(?:app|appearance)\.json$/,
    },
  ];
  function isIntentionalExactDuplicateGroup(item) {
    return intentionalExactDuplicateGroups.some((group) => (
      item.paths.every((filePath) => group.pathPattern.test(filePath))
    ));
  }
  const spuriousKbFiles = hygieneFiles
    .filter((file) => file.path.startsWith('md-os/kb/home/'))
    .map((file) => file.path);
  const zeroByteFiles = hygieneFiles
    .filter((file) => file.size_bytes === 0)
    .map((file) => file.path);
  const secondaryObsidianFiles = hygieneFiles
    .filter((file) => file.path.includes('/.obsidian/') && !file.path.startsWith('.obsidian/'))
    .map((file) => file.path);
  const exactContentDuplicates = filterDuplicateGroups(inventory.exact_content_duplicates || [], ignoredPath, fileByPath)
    .filter((item) => !isIntentionalExactDuplicateGroup(item));
  const logicalMergeCandidates = (inventory.logical_merge_candidates || [])
    .map((group) => {
      const paths = (group.paths || []).filter((filePath) => !ignoredPath(filePath));
      if (paths.length < 2) return null;
      return {
        ...group,
        file_count: paths.length,
        total_size_bytes: paths.reduce((sum, filePath) => {
          const file = fileByPath.get(filePath);
          return sum + (file ? file.size_bytes : 0);
        }, 0),
        paths,
      };
    })
    .filter(Boolean)
    .filter((item) => !ignoredLogicalMergeCandidateKeys.has(item.key))
    .filter((item) => !isIntentionalLogicalMergeCandidate(item));
  const duplicateBasenames = filterDuplicateGroups(inventory.duplicate_basenames || [], ignoredPath, fileByPath);
  const opsArtifactFiles = hygieneFiles
    .filter((file) => file.path.startsWith('md-os/ops/artifacts/'))
    .map((file) => file.path);
  const hostLocalHardwareFiles = inventory.files
    .filter((file) => file.path.startsWith('md-os/ops/local/hardware/'))
    .map((file) => file.path)
    .sort();
  const hostLocalSoftwareFiles = inventory.files
    .filter((file) => file.path.startsWith('md-os/ops/local/software/'))
    .map((file) => file.path)
    .sort();
  const journalFile = inventory.files.find((file) => file.path === 'md-os/ops/journal.ndjson');
  const pdfFiles = hygieneFiles
    .filter((file) => file.extension === '.pdf')
    .map((file) => file.path);
  const localPathFiles = detectLocalPathFiles(hygieneFiles);
  const elevatedScripts = classifyElevatedScripts(hygieneFiles);
  const authorizedElevatedLaunchers = elevatedScripts.authorized;
  const unsafeScripts = elevatedScripts.unsafe;
  const permissiveConfigs = detectPermissiveConfigs(hygieneFiles);

  const cleanliness = {
    status: worstStatus([
      spuriousKbFiles.length ? 'critical' : null,
      zeroByteFiles.length ? 'attention' : null,
      exactContentDuplicates.length ? 'attention' : null,
      logicalMergeCandidates.length ? 'attention' : null,
    ].filter(Boolean)),
    spurious_kb_file_count: spuriousKbFiles.length,
    zero_byte_file_count: zeroByteFiles.length,
    exact_content_duplicate_groups: exactContentDuplicates.length,
    logical_merge_candidate_groups: logicalMergeCandidates.length,
    spurious_kb_files: spuriousKbFiles.slice(0, 20),
    zero_byte_files: zeroByteFiles.slice(0, 20),
  };

  const efficiency = {
    status: worstStatus([
      logicalMergeCandidates.length ? 'attention' : null,
      secondaryObsidianFiles.length ? 'attention' : null,
    ].filter(Boolean)),
    file_count: hygieneFiles.length,
    total_size_bytes: hygieneFiles.reduce((sum, file) => sum + file.size_bytes, 0),
    duplicate_basename_groups: duplicateBasenames.length,
    secondary_obsidian_file_count: secondaryObsidianFiles.length,
    action_log_count: globalIndex.ops && globalIndex.ops.action_log_count || 0,
    service_count: globalIndex.ops && globalIndex.ops.service_count || 0,
    top_logical_merge_candidates: logicalMergeCandidates.slice(0, 20),
  };

  const stability = {
    status: worstStatus([
      missingRequiredFiles.length ? 'critical' : null,
      exists(path.join(OPS_DIR, 'journal.ndjson')) ? null : 'critical',
    ].filter(Boolean)),
    required_runtime_file_count: requiredRuntimeFiles.length,
    missing_required_files: missingRequiredFiles,
    project_count: globalIndex.ops && globalIndex.ops.project_count || 0,
    source_channel_count: globalIndex.ops && globalIndex.ops.source_channel_count || 0,
    journal_file: 'md-os/ops/journal.ndjson',
  };

  const publication = {
    status: worstStatus([
      localPathFiles.length ? 'critical' : null,
      unsafeScripts.length ? 'critical' : null,
      hostLocalHardwareFiles.length ? 'attention' : null,
      hostLocalSoftwareFiles.length ? 'attention' : null,
      opsArtifactFiles.length ? 'attention' : null,
      journalFile && journalFile.size_bytes > 1000000 ? 'attention' : null,
      pdfFiles.length ? 'attention' : null,
      permissiveConfigs.length ? 'attention' : null,
    ].filter(Boolean)),
    local_path_file_count: localPathFiles.length,
    host_local_hardware_file_count: hostLocalHardwareFiles.length,
    host_local_software_file_count: hostLocalSoftwareFiles.length,
    ops_artifact_file_count: opsArtifactFiles.length,
    journal_size_bytes: journalFile ? journalFile.size_bytes : 0,
    journal_too_large: Boolean(journalFile && journalFile.size_bytes > 1000000),
    pdf_file_count: pdfFiles.length,
    authorized_elevated_launcher_count: authorizedElevatedLaunchers.length,
    unsafe_script_count: unsafeScripts.length,
    permissive_config_count: permissiveConfigs.length,
    local_path_files: localPathFiles.slice(0, 20),
    host_local_hardware_files: hostLocalHardwareFiles.slice(0, 20),
    host_local_software_files: hostLocalSoftwareFiles.slice(0, 20),
    ops_artifact_files: opsArtifactFiles.slice(0, 20),
    pdf_files: pdfFiles.slice(0, 20),
    authorized_elevated_launchers: authorizedElevatedLaunchers,
    unsafe_scripts: unsafeScripts,
    permissive_configs: permissiveConfigs,
    ignored_file_count: ignoredFiles.length,
    ignored_files: ignoredFiles.slice(0, 20),
    ignore_patterns: ignorePatterns,
  };

  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json({
      global_index_source_hash: globalIndex.source_hash || null,
      inventory_source_hash: inventory.source_hash || null,
      cleanliness,
      efficiency,
      stability,
      publication,
      ignored_files: ignoredFiles,
    }),
    overall_status: worstStatus([cleanliness.status, efficiency.status, stability.status, publication.status]),
    cleanliness,
    efficiency,
    stability,
    publication,
  };
}

function buildMarkdown(status) {
  const lines = [
    '# System Hygiene Status',
    '',
    `Updated at: \`${status.updated_at}\``,
    '',
    `Overall: \`${status.overall_status}\``,
    '',
    '## Cleanliness',
    '',
    `- status: \`${status.cleanliness.status}\``,
    `- spurious KB files: \`${status.cleanliness.spurious_kb_file_count}\``,
    `- zero-byte files: \`${status.cleanliness.zero_byte_file_count}\``,
    `- exact content duplicate groups: \`${status.cleanliness.exact_content_duplicate_groups}\``,
    `- logical merge candidate groups: \`${status.cleanliness.logical_merge_candidate_groups}\``,
    '',
    '## Efficiency',
    '',
    `- status: \`${status.efficiency.status}\``,
    `- file count: \`${status.efficiency.file_count}\``,
    `- total size bytes: \`${status.efficiency.total_size_bytes}\``,
    `- duplicate basename groups: \`${status.efficiency.duplicate_basename_groups}\``,
    `- secondary obsidian files: \`${status.efficiency.secondary_obsidian_file_count}\``,
    `- action logs: \`${status.efficiency.action_log_count}\``,
    `- services: \`${status.efficiency.service_count}\``,
    '',
    '## Stability',
    '',
    `- status: \`${status.stability.status}\``,
    `- required runtime files: \`${status.stability.required_runtime_file_count}\``,
    `- missing required files: \`${status.stability.missing_required_files.length}\``,
    `- project count: \`${status.stability.project_count}\``,
    `- source channel count: \`${status.stability.source_channel_count}\``,
    '',
    '## Publication',
    '',
    `- status: \`${status.publication.status}\``,
    `- local path files: \`${status.publication.local_path_file_count}\``,
    `- host-local hardware files: \`${status.publication.host_local_hardware_file_count}\``,
    `- host-local software files: \`${status.publication.host_local_software_file_count}\``,
    `- ops artifact files: \`${status.publication.ops_artifact_file_count}\``,
    `- journal size bytes: \`${status.publication.journal_size_bytes}\``,
    `- pdf files: \`${status.publication.pdf_file_count}\``,
    `- authorized elevated launchers: \`${status.publication.authorized_elevated_launcher_count}\``,
    `- unsafe scripts: \`${status.publication.unsafe_script_count}\``,
    `- permissive configs: \`${status.publication.permissive_config_count}\``,
    `- ignored files: \`${status.publication.ignored_file_count}\``,
  ];

  if (status.stability.missing_required_files.length) {
    lines.push('', '## Missing Required Files', '');
    for (const file of status.stability.missing_required_files) {
      lines.push(`- \`${file}\``);
    }
  }

  if (status.cleanliness.spurious_kb_files.length) {
    lines.push('', '## Spurious KB Files', '');
    for (const file of status.cleanliness.spurious_kb_files) {
      lines.push(`- \`${file}\``);
    }
  }

  if (status.efficiency.top_logical_merge_candidates.length) {
    lines.push('', '## Top Logical Merge Candidates', '');
    for (const item of status.efficiency.top_logical_merge_candidates) {
      lines.push(`- \`${item.key}\`: \`${item.file_count}\` file`);
    }
  }

  if (status.publication.local_path_files.length) {
    lines.push('', '## Local Path Findings', '');
    for (const file of status.publication.local_path_files) lines.push(`- \`${file}\``);
  }

  if (status.publication.host_local_hardware_files.length) {
    lines.push('', '## Host-Local Hardware Cache', '');
    lines.push('Run `cortex hardware clean` before packaging or distributing this workspace.');
    for (const file of status.publication.host_local_hardware_files) lines.push(`- \`${file}\``);
  }

  if (status.publication.host_local_software_files.length) {
    lines.push('', '## Host-Local Software Cache', '');
    lines.push('Run `cortex software clean` before packaging or distributing this workspace.');
    for (const file of status.publication.host_local_software_files) lines.push(`- \`${file}\``);
  }

  if (status.publication.ops_artifact_files.length) {
    lines.push('', '## Runtime Artifacts', '');
    for (const file of status.publication.ops_artifact_files) lines.push(`- \`${file}\``);
  }

  if (status.publication.pdf_files.length) {
    lines.push('', '## PDF Files', '');
    for (const file of status.publication.pdf_files) lines.push(`- \`${file}\``);
  }

  if (status.publication.authorized_elevated_launchers.length) {
    lines.push('', '## Authorized Elevated Launchers', '');
    lines.push('These launchers are declared runtime entrypoints, not generic unsafe scripts.');
    for (const item of status.publication.authorized_elevated_launchers) {
      lines.push(`- \`${item.path}\`: ${item.reason}`);
    }
  }

  if (status.publication.unsafe_scripts.length || status.publication.permissive_configs.length) {
    lines.push('', '## Runtime Permission Findings', '');
    for (const file of status.publication.unsafe_scripts) lines.push(`- unsafe script: \`${file}\``);
    for (const file of status.publication.permissive_configs) lines.push(`- permissive config: \`${file}\``);
  }

  if (status.publication.ignored_files.length) {
    lines.push('', '## MD-OS APFC Ignore', '');
    for (const file of status.publication.ignored_files) lines.push(`- \`${file}\``);
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const status = buildStatus();
  withFileLock('builder__system_hygiene_status', {
    context: 'build_system_hygiene_status',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    writeJson(OUTPUT_JSON, status);
    writeText(OUTPUT_MD, buildMarkdown(status));
  });
  appendJournal({
    event: 'system_hygiene_rebuilt',
    builder: 'build_system_hygiene_status',
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
    overall_status: status.overall_status,
    cleanliness_status: status.cleanliness.status,
    efficiency_status: status.efficiency.status,
    stability_status: status.stability.status,
    publication_status: status.publication.status,
  });
  printJson({
    ok: true,
    mode: 'build_system_hygiene_status',
    updated_at: status.updated_at,
    overall_status: status.overall_status,
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
  });
}

main();
