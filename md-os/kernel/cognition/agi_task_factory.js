#!/usr/bin/env node
'use strict';

const {
  clone,
  executeProgram,
  programHash,
  programSketch,
  sha256Json,
} = require('./general_program_synthesis');

function primitive(id, kind, op, args = {}) {
  return { id, kind, op, args: clone(args) };
}

function catalogIndex(catalog) {
  return new Map(catalog.map((entry) => [entry.id, entry]));
}

function programFromIds(catalog, ids) {
  const index = catalogIndex(catalog);
  return {
    operations: ids.map((id) => {
      const descriptor = index.get(id);
      if (!descriptor) throw new Error(`AGI_TASK_TARGET_PRIMITIVE_MISSING: ${id}`);
      return clone(descriptor);
    }),
  };
}

function makeTask({
  taskId,
  domainId,
  domainFamily,
  difficulty,
  catalog,
  targetIds,
  trainInputs,
  hiddenInputs,
  maxDepth,
  source = 'procedural_oracle',
}) {
  const targetProgram = programFromIds(catalog, targetIds);
  const trainExamples = trainInputs.map((input) => ({
    input: clone(input),
    output: executeProgram(targetProgram, input, catalog),
  }));
  const hiddenTests = hiddenInputs.map((input) => ({
    input: clone(input),
    output: executeProgram(targetProgram, input, catalog),
  }));
  const sampleOutput = trainExamples[0].output;
  const publicTask = {
    schema_version: 1,
    task_id: taskId,
    domain_id: domainId,
    domain_family: domainFamily,
    difficulty,
    output_kind: Array.isArray(sampleOutput) ? 'array' : 'scalar',
    max_depth: maxDepth || targetIds.length,
    primitive_catalog: clone(catalog),
    train_examples: trainExamples,
    learner_contract: {
      oracle_access: 'denied',
      hidden_tests_access: 'denied',
      target_program_access: 'denied',
      complete_solution_catalog_provided: false,
    },
  };
  const oracle = {
    schema_version: 1,
    task_id: taskId,
    source,
    target_program: targetProgram,
    target_program_hash: programHash(targetProgram),
    target_sketch: programSketch(targetProgram),
    hidden_tests: hiddenTests,
    oracle_digest: sha256Json({
      task_id: taskId,
      target_program: targetProgram,
      hidden_tests: hiddenTests,
    }),
  };
  return { public_task: publicTask, oracle };
}

function crossDomainTasks() {
  const numericCatalog = [
    primitive('num_map_abs', 'map', 'number_abs'),
    primitive('num_map_double', 'map', 'number_multiply', { value: 2 }),
    primitive('num_map_square', 'map', 'number_square'),
    primitive('num_filter_even', 'filter', 'number_even'),
    primitive('num_filter_gt_zero', 'filter', 'number_gt', { threshold: 0 }),
    primitive('num_filter_nonzero', 'filter', 'number_nonzero'),
  ];
  const textCatalog = [
    primitive('text_map_length', 'map', 'text_length'),
    primitive('text_map_trim_lower', 'map', 'text_trim_lower'),
    primitive('text_map_upper', 'map', 'text_upper'),
    primitive('text_filter_contains_digit', 'filter', 'text_contains', { needle: '1' }),
    primitive('text_filter_nonempty', 'filter', 'text_nonempty'),
    primitive('text_filter_starts_hash', 'filter', 'text_starts_with', { prefix: '#' }),
  ];
  const recordCatalog = [
    primitive('record_map_amount', 'map', 'field_get', { field: 'amount' }),
    primitive('record_map_id', 'map', 'field_get', { field: 'id' }),
    primitive('record_map_name', 'map', 'field_get', { field: 'name' }),
    primitive('record_filter_active', 'filter', 'field_equals', { field: 'active', value: true }),
    primitive('record_filter_amount_gt_10', 'filter', 'field_gt', { field: 'amount', threshold: 10 }),
    primitive('record_filter_priority_high', 'filter', 'field_equals', { field: 'priority', value: 'high' }),
  ];
  const graphCatalog = [
    primitive('graph_map_destination', 'map', 'field_get', { field: 'to' }),
    primitive('graph_map_label', 'map', 'fields_join', { fields: ['from', 'to'], separator: '->' }),
    primitive('graph_map_weight', 'map', 'field_get', { field: 'weight' }),
    primitive('graph_filter_cross_zone', 'filter', 'field_equals', { field: 'cross_zone', value: true }),
    primitive('graph_filter_open', 'filter', 'field_equals', { field: 'open', value: true }),
    primitive('graph_filter_weight_lt_4', 'filter', 'field_lt', { field: 'weight', threshold: 4 }),
  ];
  const sensorCatalog = [
    primitive('sensor_map_coordinate', 'map', 'fields_tuple', { fields: ['row', 'column'] }),
    primitive('sensor_map_name', 'map', 'field_get', { field: 'sensor' }),
    primitive('sensor_map_value', 'map', 'field_get', { field: 'value' }),
    primitive('sensor_filter_valid', 'filter', 'field_equals', { field: 'valid', value: true }),
    primitive('sensor_filter_value_nonzero', 'filter', 'field_nonzero', { field: 'value' }),
    primitive('sensor_filter_zone_a', 'filter', 'field_equals', { field: 'zone', value: 'A' }),
  ];

  return {
    development: [
      makeTask({
        taskId: 'cross_domain_source_numeric_selection_transform',
        domainId: 'numeric_signal_processing',
        domainFamily: 'numeric_sequences',
        difficulty: 2,
        catalog: numericCatalog,
        targetIds: ['num_filter_gt_zero', 'num_map_square'],
        trainInputs: [
          [-3, 0, 2, 5],
          [4, -2, 1],
          [0, -1, -8],
          [7, 2, -5, 0],
        ],
        hiddenInputs: [
          [-9, 3, 6],
          [1, 0, -1, 8],
          [-4, -2, 0],
        ],
      }),
      makeTask({
        taskId: 'cross_domain_source_text_selection_transform',
        domainId: 'text_normalization',
        domainFamily: 'text_sequences',
        difficulty: 2,
        catalog: textCatalog,
        targetIds: ['text_filter_nonempty', 'text_map_trim_lower'],
        trainInputs: [
          ['  ALPHA ', '', 'Beta'],
          [' ', '#TAG', ' One1 '],
          ['Gamma', 'DELTA', ''],
          ['', ' Echo '],
        ],
        hiddenInputs: [
          ['  Mixed Case ', '', 'Z'],
          [' ', 'ONE1', '#Two'],
          ['last'],
        ],
      }),
    ],
    holdout: [
      makeTask({
        taskId: 'cross_domain_holdout_operational_records',
        domainId: 'operational_record_routing',
        domainFamily: 'structured_records',
        difficulty: 2,
        catalog: recordCatalog,
        targetIds: ['record_filter_active', 'record_map_id'],
        trainInputs: [
          [
            { id: 'r1', active: true, amount: 3, priority: 'low', name: 'A' },
            { id: 'r2', active: false, amount: 25, priority: 'high', name: 'B' },
            { id: 'r3', active: true, amount: 18, priority: 'high', name: 'C' },
          ],
          [
            { id: 'x1', active: false, amount: 2, priority: 'low', name: 'X' },
            { id: 'x2', active: true, amount: 8, priority: 'low', name: 'Y' },
          ],
          [{ id: 'n1', active: false, amount: 99, priority: 'high', name: 'N' }],
        ],
        hiddenInputs: [
          [
            { id: 'h1', active: true, amount: 1, priority: 'low', name: 'H' },
            { id: 'h2', active: true, amount: 30, priority: 'high', name: 'I' },
          ],
          [
            { id: 'h3', active: false, amount: 4, priority: 'low', name: 'J' },
            { id: 'h4', active: true, amount: 5, priority: 'low', name: 'K' },
          ],
        ],
      }),
      makeTask({
        taskId: 'cross_domain_holdout_graph_edges',
        domainId: 'graph_route_selection',
        domainFamily: 'graph_edges',
        difficulty: 2,
        catalog: graphCatalog,
        targetIds: ['graph_filter_open', 'graph_map_destination'],
        trainInputs: [
          [
            { from: 'A', to: 'B', open: true, weight: 7, cross_zone: false },
            { from: 'A', to: 'C', open: false, weight: 2, cross_zone: true },
            { from: 'B', to: 'D', open: true, weight: 3, cross_zone: true },
          ],
          [
            { from: 'X', to: 'Y', open: false, weight: 9, cross_zone: false },
            { from: 'Y', to: 'Z', open: true, weight: 5, cross_zone: false },
          ],
          [{ from: 'Q', to: 'R', open: false, weight: 1, cross_zone: true }],
        ],
        hiddenInputs: [
          [
            { from: 'L', to: 'M', open: true, weight: 8, cross_zone: false },
            { from: 'M', to: 'N', open: true, weight: 1, cross_zone: true },
            { from: 'N', to: 'O', open: false, weight: 2, cross_zone: false },
          ],
          [{ from: 'U', to: 'V', open: false, weight: 6, cross_zone: true }],
        ],
      }),
      makeTask({
        taskId: 'cross_domain_holdout_sensor_grid',
        domainId: 'sensor_grid_projection',
        domainFamily: 'spatial_sensor_cells',
        difficulty: 2,
        catalog: sensorCatalog,
        targetIds: ['sensor_filter_valid', 'sensor_map_coordinate'],
        trainInputs: [
          [
            { row: 0, column: 0, sensor: 's0', value: 0, valid: true, zone: 'B' },
            { row: 0, column: 1, sensor: 's1', value: 8, valid: false, zone: 'A' },
            { row: 1, column: 0, sensor: 's2', value: -2, valid: true, zone: 'A' },
          ],
          [
            { row: 2, column: 3, sensor: 's3', value: 5, valid: false, zone: 'B' },
            { row: 4, column: 1, sensor: 's4', value: 0, valid: true, zone: 'A' },
          ],
          [{ row: 7, column: 7, sensor: 's5', value: 3, valid: false, zone: 'A' }],
        ],
        hiddenInputs: [
          [
            { row: 3, column: 2, sensor: 'h1', value: 0, valid: true, zone: 'B' },
            { row: 5, column: 6, sensor: 'h2', value: 11, valid: true, zone: 'A' },
          ],
          [
            { row: 9, column: 0, sensor: 'h3', value: -1, valid: false, zone: 'B' },
            { row: 9, column: 1, sensor: 'h4', value: 2, valid: true, zone: 'B' },
          ],
        ],
      }),
    ],
  };
}

function inventionTasks() {
  const transactionCatalog = [
    primitive('txn_filter_approved', 'filter', 'field_equals', { field: 'status', value: 'approved' }),
    primitive('txn_filter_amount_gt_10', 'filter', 'field_gt', { field: 'amount', threshold: 10 }),
    primitive('txn_filter_refund', 'filter', 'field_equals', { field: 'kind', value: 'refund' }),
    primitive('txn_map_amount', 'map', 'field_get', { field: 'amount' }),
    primitive('txn_map_fee', 'map', 'field_get', { field: 'fee' }),
    primitive('txn_map_abs', 'map', 'number_abs'),
    primitive('txn_map_add_one', 'map', 'number_add', { value: 1 }),
    primitive('txn_reduce_count', 'reduce', 'count'),
    primitive('txn_reduce_max', 'reduce', 'max'),
    primitive('txn_reduce_sum', 'reduce', 'sum'),
  ];
  const messageCatalog = [
    primitive('msg_filter_nonempty', 'filter', 'text_nonempty'),
    primitive('msg_filter_starts_bang', 'filter', 'text_starts_with', { prefix: '!' }),
    primitive('msg_filter_contains_x', 'filter', 'text_contains', { needle: 'x' }),
    primitive('msg_map_length', 'map', 'text_length'),
    primitive('msg_map_prefix', 'map', 'text_prefix', { prefix: 'rx:' }),
    primitive('msg_map_upper', 'map', 'text_upper'),
    primitive('msg_map_plus_two', 'map', 'number_add', { value: 2 }),
    primitive('msg_reduce_count', 'reduce', 'count'),
    primitive('msg_reduce_join', 'reduce', 'join', { separator: '|' }),
    primitive('msg_reduce_sum', 'reduce', 'sum'),
  ];
  const routeCatalog = [
    primitive('route_filter_open', 'filter', 'field_equals', { field: 'open', value: true }),
    primitive('route_filter_weight_gt_4', 'filter', 'field_gt', { field: 'weight', threshold: 4 }),
    primitive('route_filter_cross_zone', 'filter', 'field_equals', { field: 'cross_zone', value: true }),
    primitive('route_map_weight', 'map', 'field_get', { field: 'weight' }),
    primitive('route_map_capacity', 'map', 'field_get', { field: 'capacity' }),
    primitive('route_map_double', 'map', 'number_multiply', { value: 2 }),
    primitive('route_map_add_three', 'map', 'number_add', { value: 3 }),
    primitive('route_reduce_count', 'reduce', 'count'),
    primitive('route_reduce_max', 'reduce', 'max'),
    primitive('route_reduce_sum', 'reduce', 'sum'),
  ];

  return [
    makeTask({
      taskId: 'invention_transaction_exposure',
      domainId: 'financial_event_aggregation',
      domainFamily: 'transaction_records',
      difficulty: 4,
      catalog: transactionCatalog,
      targetIds: ['txn_filter_approved', 'txn_map_amount', 'txn_map_abs', 'txn_reduce_sum'],
      trainInputs: [
        [
          { status: 'approved', kind: 'sale', amount: -8, fee: 1 },
          { status: 'pending', kind: 'sale', amount: 100, fee: 4 },
          { status: 'approved', kind: 'refund', amount: 5, fee: 2 },
        ],
        [
          { status: 'approved', kind: 'sale', amount: 12, fee: 3 },
          { status: 'denied', kind: 'refund', amount: -50, fee: 7 },
        ],
        [{ status: 'pending', kind: 'sale', amount: 9, fee: 1 }],
        [
          { status: 'approved', kind: 'refund', amount: -2, fee: 8 },
          { status: 'approved', kind: 'sale', amount: -3, fee: 1 },
        ],
      ],
      hiddenInputs: [
        [
          { status: 'approved', kind: 'sale', amount: -20, fee: 2 },
          { status: 'approved', kind: 'sale', amount: 4, fee: 9 },
          { status: 'pending', kind: 'refund', amount: -100, fee: 1 },
        ],
        [{ status: 'denied', kind: 'sale', amount: 5, fee: 3 }],
      ],
    }),
    makeTask({
      taskId: 'invention_message_information_mass',
      domainId: 'message_information_accounting',
      domainFamily: 'message_sequences',
      difficulty: 4,
      catalog: messageCatalog,
      targetIds: ['msg_map_prefix', 'msg_map_length', 'msg_map_plus_two', 'msg_reduce_sum'],
      trainInputs: [
        [' Alpha ', '', 'BETA'],
        [' ', '!x', 'long word'],
        ['xray', '!ok', ''],
        ['', '!plain', 'x'],
      ],
      hiddenInputs: [
        ['  Mixed ', 'Case', ''],
        ['!', ' xx ', 'z'],
        ['   '],
      ],
    }),
    makeTask({
      taskId: 'invention_route_capacity_cost',
      domainId: 'network_route_costing',
      domainFamily: 'network_edges',
      difficulty: 4,
      catalog: routeCatalog,
      targetIds: ['route_filter_open', 'route_filter_weight_gt_4', 'route_map_weight', 'route_reduce_sum'],
      trainInputs: [
        [
          { open: true, weight: 7, capacity: 10, cross_zone: false },
          { open: false, weight: 20, capacity: 5, cross_zone: true },
          { open: true, weight: 6, capacity: 2, cross_zone: true },
        ],
        [
          { open: true, weight: 1, capacity: 9, cross_zone: false },
          { open: false, weight: 2, capacity: 8, cross_zone: false },
        ],
        [{ open: false, weight: 99, capacity: 1, cross_zone: true }],
        [
          { open: true, weight: 8, capacity: 4, cross_zone: true },
          { open: true, weight: 2, capacity: 7, cross_zone: false },
        ],
      ],
      hiddenInputs: [
        [
          { open: true, weight: 5, capacity: 3, cross_zone: false },
          { open: true, weight: 4, capacity: 8, cross_zone: true },
        ],
        [{ open: false, weight: 7, capacity: 6, cross_zone: true }],
      ],
    }),
  ];
}

function numericCurriculumTask(index, difficulty) {
  const threshold = (index % 7) - 3;
  const multiplier = (index % 4) + 2;
  const offset = (index % 5) + 1;
  const catalog = [
    primitive(`n${index}_filter_gt`, 'filter', 'number_gt', { threshold }),
    primitive(`n${index}_filter_even`, 'filter', 'number_even'),
    primitive(`n${index}_filter_nonzero`, 'filter', 'number_nonzero'),
    primitive(`n${index}_map_mul`, 'map', 'number_multiply', { value: multiplier }),
    primitive(`n${index}_map_add`, 'map', 'number_add', { value: offset }),
    primitive(`n${index}_map_abs`, 'map', 'number_abs'),
    primitive(`n${index}_reduce_sum`, 'reduce', 'sum'),
    primitive(`n${index}_reduce_count`, 'reduce', 'count'),
  ];
  const targetByDifficulty = {
    1: [`n${index}_map_add`],
    2: [`n${index}_filter_gt`, `n${index}_map_mul`],
    3: [`n${index}_filter_gt`, `n${index}_map_mul`, `n${index}_reduce_sum`],
    4: [`n${index}_filter_gt`, `n${index}_map_mul`, `n${index}_map_add`, `n${index}_reduce_sum`],
  };
  const base = threshold;
  return makeTask({
    taskId: `curriculum_numeric_${String(index).padStart(4, '0')}_d${difficulty}`,
    domainId: 'curriculum_numeric',
    domainFamily: 'numeric_sequences',
    difficulty,
    catalog,
    targetIds: targetByDifficulty[difficulty],
    trainInputs: [
      [base - 2, base, base + 1, base + 3],
      [base + 5, base - 1, base + 2],
      [base - 5, base - 2],
      [base + 4, base + 6, base],
    ],
    hiddenInputs: [
      [base + 7, base - 4, base + 1],
      [base - 3, base + 2],
      [base + 9],
    ],
  });
}

function textCurriculumTask(index, difficulty) {
  const token = String.fromCharCode(97 + (index % 26));
  const prefix = `${token}${index % 10}:`;
  const catalog = [
    primitive(`t${index}_filter_nonempty`, 'filter', 'text_nonempty'),
    primitive(`t${index}_filter_prefix`, 'filter', 'text_starts_with', { prefix: token }),
    primitive(`t${index}_filter_contains`, 'filter', 'text_contains', { needle: token }),
    primitive(`t${index}_map_prefix`, 'map', 'text_prefix', { prefix }),
    primitive(`t${index}_map_lower`, 'map', 'text_trim_lower'),
    primitive(`t${index}_map_length`, 'map', 'text_length'),
    primitive(`t${index}_reduce_sum`, 'reduce', 'sum'),
    primitive(`t${index}_reduce_count`, 'reduce', 'count'),
  ];
  const targetByDifficulty = {
    1: [`t${index}_map_prefix`],
    2: [`t${index}_filter_nonempty`, `t${index}_map_prefix`],
    3: [`t${index}_filter_nonempty`, `t${index}_map_length`, `t${index}_reduce_sum`],
    4: [`t${index}_filter_nonempty`, `t${index}_map_prefix`, `t${index}_map_length`, `t${index}_reduce_sum`],
  };
  return makeTask({
    taskId: `curriculum_text_${String(index).padStart(4, '0')}_d${difficulty}`,
    domainId: 'curriculum_text',
    domainFamily: 'text_sequences',
    difficulty,
    catalog,
    targetIds: targetByDifficulty[difficulty],
    trainInputs: [
      [`${token}lpha`, '', ' Beta '],
      [' ', `${token}${token}`, 'word'],
      ['X', ` ${token}z `, ''],
      ['one', 'two', `${token}three`],
    ],
    hiddenInputs: [
      [`${token}hidden`, '', 'Case'],
      ['   ', `${token}1`, 'last'],
      ['solo'],
    ],
  });
}

function recordCurriculumTask(index, difficulty) {
  const status = `s${index % 5}`;
  const offset = (index % 6) + 1;
  const catalog = [
    primitive(`r${index}_filter_status`, 'filter', 'field_equals', { field: 'status', value: status }),
    primitive(`r${index}_filter_enabled`, 'filter', 'field_equals', { field: 'enabled', value: true }),
    primitive(`r${index}_filter_amount`, 'filter', 'field_gt', { field: 'amount', threshold: 5 }),
    primitive(`r${index}_map_id`, 'map', 'field_get', { field: 'id' }),
    primitive(`r${index}_map_amount`, 'map', 'field_get', { field: 'amount' }),
    primitive(`r${index}_map_add`, 'map', 'number_add', { value: offset }),
    primitive(`r${index}_reduce_sum`, 'reduce', 'sum'),
    primitive(`r${index}_reduce_count`, 'reduce', 'count'),
  ];
  const targetByDifficulty = {
    1: [`r${index}_map_id`],
    2: [`r${index}_filter_status`, `r${index}_map_id`],
    3: [`r${index}_filter_status`, `r${index}_map_amount`, `r${index}_reduce_sum`],
    4: [`r${index}_filter_status`, `r${index}_map_amount`, `r${index}_map_add`, `r${index}_reduce_sum`],
  };
  const item = (id, itemStatus, amount, enabled) => ({ id, status: itemStatus, amount, enabled });
  return makeTask({
    taskId: `curriculum_records_${String(index).padStart(4, '0')}_d${difficulty}`,
    domainId: 'curriculum_records',
    domainFamily: 'structured_records',
    difficulty,
    catalog,
    targetIds: targetByDifficulty[difficulty],
    trainInputs: [
      [item('a', status, 2, true), item('b', 'other', 20, true), item('c', status, 9, false)],
      [item('d', 'other', 1, false), item('e', status, 7, true)],
      [item('f', 'none', 30, true)],
      [item('g', status, 4, false), item('h', status, 12, true)],
    ],
    hiddenInputs: [
      [item('i', status, 8, true), item('j', 'other', 99, true)],
      [item('k', status, 1, false), item('l', status, 6, true)],
      [item('m', 'none', 4, false)],
    ],
  });
}

function graphCurriculumTask(index, difficulty) {
  const multiplier = (index % 3) + 2;
  const catalog = [
    primitive(`g${index}_filter_open`, 'filter', 'field_equals', { field: 'open', value: true }),
    primitive(`g${index}_filter_cross`, 'filter', 'field_equals', { field: 'cross_zone', value: true }),
    primitive(`g${index}_filter_weight`, 'filter', 'field_lt', { field: 'weight', threshold: 5 }),
    primitive(`g${index}_map_to`, 'map', 'field_get', { field: 'to' }),
    primitive(`g${index}_map_weight`, 'map', 'field_get', { field: 'weight' }),
    primitive(`g${index}_map_mul`, 'map', 'number_multiply', { value: multiplier }),
    primitive(`g${index}_reduce_sum`, 'reduce', 'sum'),
    primitive(`g${index}_reduce_count`, 'reduce', 'count'),
  ];
  const targetByDifficulty = {
    1: [`g${index}_map_to`],
    2: [`g${index}_filter_open`, `g${index}_map_to`],
    3: [`g${index}_filter_open`, `g${index}_map_weight`, `g${index}_reduce_sum`],
    4: [`g${index}_filter_open`, `g${index}_map_weight`, `g${index}_map_mul`, `g${index}_reduce_sum`],
  };
  const edge = (from, to, open, weight, crossZone) => ({ from, to, open, weight, cross_zone: crossZone });
  return makeTask({
    taskId: `curriculum_graph_${String(index).padStart(4, '0')}_d${difficulty}`,
    domainId: 'curriculum_graph',
    domainFamily: 'graph_edges',
    difficulty,
    catalog,
    targetIds: targetByDifficulty[difficulty],
    trainInputs: [
      [edge('A', 'B', true, 2, false), edge('A', 'C', false, 9, true), edge('B', 'D', true, 6, true)],
      [edge('X', 'Y', false, 1, false), edge('Y', 'Z', true, 4, false)],
      [edge('Q', 'R', false, 8, true)],
      [edge('L', 'M', true, 7, true), edge('M', 'N', true, 3, false)],
    ],
    hiddenInputs: [
      [edge('P', 'S', true, 5, false), edge('S', 'T', false, 2, true)],
      [edge('U', 'V', true, 1, true), edge('V', 'W', true, 8, false)],
      [edge('J', 'K', false, 4, false)],
    ],
  });
}

const CURRICULUM_FACTORIES = [
  numericCurriculumTask,
  textCurriculumTask,
  recordCurriculumTask,
  graphCurriculumTask,
];

function curriculumTask(index, difficulty, domainOffset = 0) {
  const normalizedDifficulty = Math.max(1, Math.min(4, Number.parseInt(difficulty, 10) || 1));
  const factory = CURRICULUM_FACTORIES[(index + domainOffset) % CURRICULUM_FACTORIES.length];
  return factory(index, normalizedDifficulty);
}

function publicTaskDigest(task) {
  return sha256Json(task.public_task || task);
}

module.exports = {
  crossDomainTasks,
  curriculumTask,
  inventionTasks,
  makeTask,
  primitive,
  publicTaskDigest,
};
