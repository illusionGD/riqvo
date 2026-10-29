import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContractError,
  parseTask,
  prepareTask,
  parseRunResult,
  parseRunEvent,
} from '@riqvo/contracts';

function task() {
  return {
    protocolVersion: 1,
    id: 'run-1',
    attempt: 1,
    case: {
      id: 'search',
      version: 1,
      title: '查询记录',
      steps: [
        {
          id: 'open',
          action: 'navigate',
          site: 'portal',
          path: 'records',
          query: { q: { source: 'variable', name: 'keyword' } },
        },
        {
          id: 'check',
          action: 'assertText',
          locator: { strategy: 'testId', value: 'records' },
          expected: { source: 'literal', value: '预约' },
          match: 'contains',
        },
      ],
    },
    environment: {
      id: 'test',
      revision: 1,
      name: '测试',
      sites: { portal: 'https://test.example/app/' },
    },
    target: { platform: 'pc', browser: 'chrome', mode: 'background' },
    variables: { keyword: '预约 & A' },
    artifacts: ['screenshot'],
  };
}

function capabilities() {
  return {
    protocolVersion: 1,
    driver: 'playwright',
    platform: 'pc',
    browser: 'chrome',
    actions: ['navigate', 'assertText'],
    locators: ['testId'],
    modes: ['background'],
    artifacts: ['screenshot'],
  };
}

test('同一用例按环境解析子路径及查询变量，不改写原始用例', () => {
  const input = task();
  const before = structuredClone(input);
  const first = prepareTask(input, capabilities());
  assert.equal(first.status, 'ready');
  assert.equal(first.steps[0].url, 'https://test.example/app/records?q=%E9%A2%84%E7%BA%A6+%26+A');
  const second = prepareTask(
    {
      ...input,
      environment: {
        ...input.environment,
        id: 'preprod',
        sites: { portal: 'https://pre.example/v2' },
      },
    },
    capabilities(),
  );
  assert.equal(second.status, 'ready');
  assert.equal(second.steps[0].url, 'https://pre.example/v2/records?q=%E9%A2%84%E7%BA%A6+%26+A');
  assert.deepEqual(input, before);
});

test('地址、变量或协议无效时拒绝准备任务且不回显敏感输入', () => {
  for (const path of [
    'https://evil.example',
    '//evil.example',
    '../admin',
    '%2e%2e/admin',
    'a/../../admin',
    '/root',
    'a\\b',
    'records?token=secret',
    'records#token',
    'a/%252e%252e/b',
  ]) {
    const input = task();
    input.case.steps[0].path = path;
    assert.throws(() => prepareTask(input, capabilities()), ContractError);
  }
  for (const base of [
    'file:///private',
    'https://user:secret@example.com',
    'https://example.com/?token=secret',
    'https://example.com/#secret',
    'invalid-secret',
  ]) {
    const input = task();
    input.environment.sites.portal = base;
    assert.throws(
      () => prepareTask(input, capabilities()),
      (error) => error instanceof ContractError && !error.message.includes('secret'),
    );
  }
  const missingSite = task();
  delete missingSite.environment.sites.portal;
  assert.throws(() => prepareTask(missingSite, capabilities()), { code: 'MISSING_SITE' });
  const missingVariable = task();
  delete missingVariable.variables.keyword;
  assert.throws(() => prepareTask(missingVariable, capabilities()), { code: 'MISSING_VARIABLE' });
  for (const change of [
    { protocolVersion: 2 },
    { extra: 'secret' },
    { case: { ...task().case, steps: [task().case.steps[0], task().case.steps[0]] } },
  ]) {
    assert.throws(() => parseTask({ ...task(), ...change }), { code: 'INVALID_TASK' });
  }
});

test('表单、等待和断言参数显式解析，能力不足时给出原因并禁止执行', () => {
  const input = task();
  const locator = { strategy: 'label', value: '标题' };
  input.case.steps = [
    { id: 'fill', action: 'fill', locator, value: { source: 'variable', name: 'keyword' } },
    {
      id: 'choose',
      action: 'select',
      locator: { strategy: 'testId', value: 'priority' },
      value: { source: 'literal', value: 'high' },
    },
    {
      id: 'agree',
      action: 'check',
      locator: { strategy: 'role', role: 'checkbox', name: '同意' },
      checked: true,
    },
    { id: 'submit', action: 'click', locator: { strategy: 'role', role: 'button', name: '提交' } },
    {
      id: 'wait',
      action: 'waitFor',
      locator: { strategy: 'css', value: '#result' },
      state: 'visible',
    },
    {
      id: 'visible',
      action: 'assertVisible',
      locator: { strategy: 'css', value: '#result' },
      visible: true,
    },
    { id: 'address', action: 'assertUrl', site: 'portal', path: 'records' },
    { id: 'shot', action: 'screenshot' },
  ];
  const supported = {
    ...capabilities(),
    actions: input.case.steps.map((s) => s.action),
    locators: ['label', 'testId', 'role', 'css'],
  };
  const ready = prepareTask(input, supported);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.steps[0].value, '预约 & A');
  assert.equal(ready.steps[0].timeoutMs, 30000);
  assert.equal(ready.steps[0].locator.exact, true);
  assert.equal(ready.steps[6].url, 'https://test.example/app/records');
  const unsupported = prepareTask(input, {
    ...supported,
    actions: ['fill'],
    locators: [],
    modes: [],
    artifacts: [],
  });
  assert.equal(unsupported.status, 'unsupported');
  assert.equal('steps' in unsupported, false);
  assert.ok(unsupported.reasons.some((r) => r.capability === 'action' && r.stepId === 'submit'));
  assert.ok(unsupported.reasons.some((r) => r.capability === 'locator' && r.required === 'label'));
  assert.ok(unsupported.reasons.some((r) => r.capability === 'mode'));
  assert.ok(unsupported.reasons.some((r) => r.capability === 'artifact'));
  const wrongTarget = prepareTask(task(), {
    ...capabilities(),
    platform: 'ios',
    browser: 'safari',
    driver: 'appium',
  });
  assert.equal(wrongTarget.status, 'unsupported');
  assert.ok(wrongTarget.reasons.some((r) => r.capability === 'target'));
});

function completedResult() {
  return {
    protocolVersion: 1,
    taskId: 'run-1',
    attempt: 1,
    status: 'passed',
    startedAt: '2026-10-29T10:00:00.000Z',
    finishedAt: '2026-10-29T10:00:03.000Z',
    steps: [
      {
        stepId: 'open',
        status: 'passed',
        startedAt: '2026-10-29T10:00:00.000Z',
        finishedAt: '2026-10-29T10:00:01.000Z',
      },
      {
        stepId: 'check',
        status: 'passed',
        startedAt: '2026-10-29T10:00:01.000Z',
        finishedAt: '2026-10-29T10:00:02.000Z',
      },
    ],
    artifacts: [
      {
        id: 'shot-1',
        kind: 'screenshot',
        stepId: 'check',
        state: 'available',
        reference: 'asset-1',
      },
    ],
  };
}

test('结果必须对应完整任务和实际断言，不能把失败、跳过或无断言标为通过', () => {
  assert.equal(parseRunResult(task(), completedResult()).status, 'passed');
  const failed = completedResult();
  failed.status = 'failed';
  failed.steps[1].status = 'failed';
  failed.steps[1].error = { code: 'ASSERTION_FAILED' };
  failed.artifacts.push({
    id: 'video-1',
    kind: 'video',
    state: 'missing',
    reason: 'CAPTURE_FAILED',
  });
  assert.equal(parseRunResult(task(), failed).artifacts[1].state, 'missing');
  assert.throws(() => parseRunResult(task(), { ...failed, status: 'passed' }), {
    code: 'INVALID_RESULT',
  });
  const noAssertion = task();
  noAssertion.case.steps.pop();
  const unchecked = {
    ...completedResult(),
    steps: completedResult().steps.slice(0, 1),
    artifacts: [],
  };
  assert.throws(() => parseRunResult(noAssertion, unchecked), { code: 'INVALID_RESULT' });
  assert.equal(
    parseRunResult(noAssertion, { ...unchecked, status: 'unverified' }).status,
    'unverified',
  );
  const skipped = completedResult();
  skipped.steps[1].status = 'skipped';
  assert.throws(() => parseRunResult(task(), skipped), { code: 'INVALID_RESULT' });
  assert.equal(parseRunResult(task(), { ...skipped, status: 'unverified' }).status, 'unverified');
  for (const patch of [
    { taskId: 'other' },
    { attempt: 2 },
    { steps: [] },
    { steps: [completedResult().steps[0], completedResult().steps[0]] },
    { finishedAt: '2026-10-29T09:00:00.000Z' },
    {
      artifacts: [
        { id: 'shot', kind: 'screenshot', state: 'available', reference: '/private/secret.png' },
      ],
    },
  ])
    assert.throws(() => parseRunResult(task(), { ...completedResult(), ...patch }), {
      code: 'INVALID_RESULT',
    });
  for (const [status, code] of [
    ['unsupported', 'UNSUPPORTED_CAPABILITY'],
    ['cancelled', 'CANCELLED'],
    ['failed', 'DRIVER_ERROR'],
  ]) {
    assert.equal(
      parseRunResult(task(), {
        ...completedResult(),
        status,
        steps: [],
        artifacts: [],
        error: { code },
      }).status,
      status,
    );
  }
});

test('事件绑定任务、尝试和步骤，最终事件沿用报告完整性校验', () => {
  const base = {
    protocolVersion: 1,
    taskId: 'run-1',
    attempt: 1,
    sequence: 1,
    at: '2026-10-29T10:00:03.000Z',
  };
  for (const payload of [
    { type: 'run.started' },
    { type: 'step.started', stepId: 'open' },
    { type: 'step.finished', result: completedResult().steps[0] },
    { type: 'artifact.recorded', artifact: completedResult().artifacts[0] },
    { type: 'run.finished', result: completedResult() },
  ])
    assert.equal(parseRunEvent(task(), { ...base, ...payload }).type, payload.type);
  for (const patch of [
    { taskId: 'other' },
    { attempt: 2 },
    { sequence: 0 },
    { stepId: 'unknown' },
  ]) {
    assert.throws(
      () => parseRunEvent(task(), { ...base, type: 'step.started', stepId: 'open', ...patch }),
      { code: 'INVALID_EVENT' },
    );
  }
  assert.throws(
    () =>
      parseRunEvent(task(), {
        ...base,
        type: 'run.finished',
        result: { ...completedResult(), steps: [] },
      }),
    { code: 'INVALID_EVENT' },
  );
  assert.throws(
    () =>
      parseRunEvent(task(), {
        ...base,
        at: '2026-10-29T09:00:00.000Z',
        type: 'step.finished',
        result: completedResult().steps[0],
      }),
    { code: 'INVALID_EVENT' },
  );
});
