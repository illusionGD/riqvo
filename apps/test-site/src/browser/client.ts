/** 此入口仅用于原生表单测试样例；平台管理界面继续使用 Vue 和 Naive UI。 */
interface DemoRecord {
  id: string;
  title: string;
  email: string;
  priority: string;
}

/**
 * 获取约定的样例 DOM，并在页面结构错误时显式失败。
 * @param id 元素标识。
 * @param constructor 元素类型。
 * @returns 已校验的元素。
 */
function element<T extends HTMLElement>(id: string, constructor: { new (): T }): T {
  const node = document.getElementById(id);
  if (!(node instanceof constructor)) throw new Error('演示页面结构不完整');
  return node;
}

/**
 * 将不可信 JSON 收窄为普通对象。
 * @param value 接口返回值。
 * @returns 可按键检查的对象。
 */
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('演示接口响应格式错误');
  return value as Record<string, unknown>;
}

/**
 * 访问当前站点 API；只在同源会话中发送演示数据。
 * @param path 固定接口路径。
 * @param body 提供时使用 POST，否则使用 GET。
 * @returns 已收窄的响应对象。
 */
async function api(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const data = object(await response.json());
  if (!response.ok)
    throw new Error(typeof data.error === 'string' ? data.error : '演示接口请求失败');
  return data;
}

/**
 * 将接口记录安全地渲染为文本，不拼接用户输入的 HTML。
 * @returns 列表刷新完成。
 */
async function refreshRecords(): Promise<void> {
  const query = element('keyword', HTMLInputElement).value;
  const data = await api(`/api/records?q=${encodeURIComponent(query)}`);
  if (!Array.isArray(data.records)) throw new Error('演示记录响应格式错误');
  const records: DemoRecord[] = data.records.map((value: unknown) => {
    const item = object(value);
    if (
      typeof item.id !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.email !== 'string' ||
      typeof item.priority !== 'string'
    )
      throw new Error('演示记录响应格式错误');
    return { id: item.id, title: item.title, email: item.email, priority: item.priority };
  });
  const list = element('records', HTMLUListElement);
  list.replaceChildren();
  for (const record of records) {
    const item = document.createElement('li');
    item.dataset.testid = 'record-item';
    const title = document.createElement('strong');
    title.textContent = record.title;
    const detail = document.createElement('span');
    detail.textContent = `${record.email} · ${record.priority === 'high' ? '高优先级' : '普通优先级'}`;
    item.append(title, detail);
    list.append(item);
  }
  if (!records.length) {
    const item = document.createElement('li');
    item.className = 'records__empty';
    item.textContent = query ? '没有匹配的记录' : '暂无记录，创建第一条演示数据';
    list.append(item);
  }
  element('record-count', HTMLElement).textContent = String(records.length);
}

/**
 * 用一次请求的加载状态包裹操作，并统一显示错误。
 * @param trigger 触发按钮。
 * @param action 业务动作。
 * @returns 操作与错误处理完成。
 */
async function perform(
  trigger: HTMLButtonElement | null,
  action: () => Promise<void>,
): Promise<void> {
  if (trigger) trigger.disabled = true;
  const error = element('error', HTMLElement);
  error.hidden = true;
  element('feedback', HTMLElement).textContent = '';
  try {
    await action();
  } catch (cause) {
    error.textContent = cause instanceof Error ? cause.message : '操作失败，请重试';
    error.hidden = false;
  } finally {
    if (trigger) trigger.disabled = false;
  }
}

/**
 * 展示登录或工作台视图。
 * @param signedIn 当前演示会话是否已登录。
 */
function showSession(signedIn: boolean): void {
  element('login-view', HTMLElement).hidden = signedIn;
  element('workspace', HTMLElement).hidden = !signedIn;
  element('logout', HTMLButtonElement).hidden = !signedIn;
}

/**
 * 注册表单提交，保留原生标签、约束和键盘交互。
 * @param id 表单标识。
 * @param action 表单业务动作。
 */
function bindForm(id: string, action: () => Promise<void>): void {
  element(id, HTMLFormElement).addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    void perform(form.querySelector<HTMLButtonElement>('button[type="submit"]'), action);
  });
}

bindForm('login-form', async () => {
  await api('/api/login', {
    username: element('username', HTMLInputElement).value,
    password: element('password', HTMLInputElement).value,
  });
  element('password', HTMLInputElement).value = '';
  showSession(true);
  await refreshRecords();
});
bindForm('record-form', async () => {
  await api('/api/records', {
    title: element('title', HTMLInputElement).value,
    email: element('email', HTMLInputElement).value,
    priority: element('priority', HTMLSelectElement).value,
    agreed: element('agreed', HTMLInputElement).checked,
  });
  await refreshRecords();
  element('feedback', HTMLElement).textContent = '记录已创建';
});
bindForm('search-form', refreshRecords);
element('reset', HTMLButtonElement).addEventListener(
  'click',
  () =>
    void perform(element('reset', HTMLButtonElement), async () => {
      await api('/api/reset', {});
      element('keyword', HTMLInputElement).value = '';
      await refreshRecords();
      element('feedback', HTMLElement).textContent = '演示数据已重置';
    }),
);
element('logout', HTMLButtonElement).addEventListener(
  'click',
  () =>
    void perform(element('logout', HTMLButtonElement), async () => {
      await api('/api/logout', {});
      showSession(false);
      element('login-form', HTMLFormElement).reset();
      element('record-form', HTMLFormElement).reset();
      element('keyword', HTMLInputElement).value = '';
    }),
);
element('menu-toggle', HTMLButtonElement).addEventListener('click', () => {
  const open = element('navigation', HTMLElement).classList.toggle('is-open');
  const button = element('menu-toggle', HTMLButtonElement);
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? '收起菜单' : '展开菜单');
});
element('upload', HTMLInputElement).addEventListener('change', () => {
  const file = element('upload', HTMLInputElement).files?.[0];
  element('upload-status', HTMLElement).textContent = file
    ? `${file.name} · ${file.size} 字节（仅本地预览）`
    : '文件仅在当前页面展示名称和大小，不会上传。';
});
void perform(null, async () => {
  const session = await api('/api/session');
  if (
    typeof session.environment !== 'string' ||
    (session.username !== null && session.username !== 'tester')
  )
    throw new Error('演示会话响应格式错误');
  element('environment', HTMLElement).textContent =
    session.environment === 'test'
      ? '测试环境'
      : session.environment === 'preprod'
        ? '预发布环境'
        : session.environment;
  showSession(session.username === 'tester');
  if (session.username) await refreshRecords();
});

export {};
