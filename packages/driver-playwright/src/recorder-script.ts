/**
 * 在受控页面采集基础语义动作；此函数整体由 Playwright 注入，不能引用模块闭包。
 * @param config 会话专属的消息与排空函数名。
 */
export function recorderScript(config: { binding: string; flush: string }): void {
  const host = window as unknown as Record<string, unknown>;
  if (host[config.flush]) return;
  const pending = new Set<Promise<unknown>>();
  const send = (event: unknown): void => {
    const binding = host[config.binding] as ((event: unknown) => Promise<unknown>) | undefined;
    if (!binding) return;
    const request = binding(event).catch(() => undefined);
    pending.add(request);
    void request.finally(() => pending.delete(request));
  };
  host[config.flush] = () => Promise.allSettled([...pending]);
  const locator = (element: HTMLElement): { strategy: 'testId' | 'css'; value: string } => {
    const testId = element.getAttribute('data-testid');
    if (testId && document.querySelectorAll(`[data-testid="${CSS.escape(testId)}"]`).length === 1)
      return { strategy: 'testId', value: testId };
    if (element.id && document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1)
      return { strategy: 'css', value: `#${CSS.escape(element.id)}` };
    const parts: string[] = [];
    let current: HTMLElement | null = element;
    while (current && current !== document.documentElement) {
      const tag = current.tagName.toLowerCase();
      const siblings = Array.from(current.parentElement?.children ?? []).filter(
        (node) => node.tagName === current!.tagName,
      );
      parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
      current = current.parentElement;
    }
    return { strategy: 'css', value: parts.join(' > ') };
  };
  document.addEventListener(
    'input',
    (event) => {
      if (!event.isTrusted) return;
      const element = event.target;
      if (element instanceof HTMLElement && element.isContentEditable) {
        send({ action: 'unsupported', reason: 'CONTENT_EDITABLE' });
        return;
      }
      if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement))
        return;
      if (
        element instanceof HTMLInputElement &&
        ['checkbox', 'radio', 'file', 'button', 'submit', 'reset'].includes(element.type)
      )
        return;
      if (element instanceof HTMLInputElement && element.type === 'password')
        send({ action: 'fill', locator: locator(element), secret: true });
      else send({ action: 'fill', locator: locator(element), value: element.value });
    },
    true,
  );
  document.addEventListener(
    'change',
    (event) => {
      if (!event.isTrusted) return;
      const element = event.target;
      if (element instanceof HTMLSelectElement) {
        if (element.multiple) send({ action: 'unsupported', reason: 'MULTI_SELECT' });
        else send({ action: 'select', locator: locator(element), value: element.value });
      }
      if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type))
        send({ action: 'check', locator: locator(element), checked: element.checked });
    },
    true,
  );
  document.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted || !(event.target instanceof HTMLElement)) return;
      const element =
        event.target.closest<HTMLElement>(
          'button,a,input,textarea,select,label,[role="button"],[role="link"]',
        ) ?? event.target;
      if (element instanceof HTMLInputElement) {
        if (element.type === 'file') send({ action: 'unsupported', reason: 'FILE_INPUT' });
        if (!['submit', 'button', 'reset'].includes(element.type)) return;
      }
      if (
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement ||
        element.tagName === 'LABEL'
      )
        return;
      send({ action: 'click', locator: locator(element) });
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        event.isTrusted &&
        (['Enter', 'Escape'].includes(event.key) || event.altKey || event.metaKey)
      )
        send({ action: 'unsupported', reason: 'KEYBOARD_ACTION' });
    },
    true,
  );
  document.addEventListener(
    'dragstart',
    (event) => {
      if (event.isTrusted) send({ action: 'unsupported', reason: 'DRAG' });
    },
    true,
  );
}
