/** Small native controls shared by the inspector and gallery shell. */
export interface Binding {
  element: HTMLElement;
  refresh(): void;
}

export type IconName = 'play' | 'pause' | 'restart' | 'fit' | 'share' | 'download' | 'focus' | 'exit' | 'sliders' | 'step' | 'undo' | 'spark';
const paths: Record<IconName, string> = {
  play: 'm8 5 10 7-10 7Z',
  pause: 'M8 5v14M16 5v14',
  restart: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  fit: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M9 12h6M12 9v6',
  share: 'M12 16V3m-4 4 4-4 4 4M5 13v7h14v-7',
  download: 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
  focus: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
  exit: 'M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5',
  sliders: 'M4 7h7m4 0h5M4 17h3m4 0h9M11 4v6M7 14v6',
  step: 'm5 5 10 7-10 7ZM19 5v14',
  undo: 'M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7v3',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
};

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  svg.appendChild(path);
  return svg;
}

export function button(label: string, action: () => void, glyph?: IconName, className = ''): HTMLButtonElement {
  const el = element('button', `button ${className}`);
  el.type = 'button';
  setButtonContent(el, label, glyph);
  el.addEventListener('click', action);
  return el;
}

export function setButtonContent(el: HTMLButtonElement, label: string, glyph?: IconName) {
  el.replaceChildren();
  if (glyph) el.appendChild(icon(glyph));
  el.appendChild(element('span', '', label));
}

let nextId = 0;
export function numberControl(options: {
  label: string; min: number; max: number; step: number;
  read: () => number; write: (value: number) => void; description?: string; symbol?: boolean;
}): Binding {
  const id = `number-${nextId++}`;
  const root = element('div', 'number-control');
  const row = element('div', 'number-label-row');
  const label = element('label', options.symbol ? 'field-label parameter-symbol' : 'field-label', options.label);
  label.htmlFor = id;
  const input = element('input', 'number-input');
  input.id = id;
  input.type = 'number';
  input.min = String(options.min);
  input.max = String(options.max);
  // Named presets may contain precise values between slider steps (e.g. β = 8/3).
  input.step = 'any';
  input.inputMode = 'decimal';
  const range = element('input', 'range-input');
  range.type = 'range';
  range.min = input.min;
  range.max = input.max;
  range.step = String(options.step);
  range.setAttribute('aria-label', `${options.label} slider`);
  row.append(label, input);
  root.append(row, range);
  if (options.description) {
    const help = element('p', 'control-help', options.description);
    help.id = `${id}-help`;
    input.setAttribute('aria-describedby', help.id);
    range.setAttribute('aria-describedby', help.id);
    root.appendChild(help);
  }
  const paintRange = (value: number) => {
    range.value = String(value);
    range.style.setProperty('--fill', `${Math.max(0, Math.min(100, (value - options.min) / (options.max - options.min) * 100))}%`);
  };
  range.addEventListener('input', () => {
    const value = Number(range.value);
    input.value = String(value);
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
    paintRange(value);
    options.write(value);
  });
  input.addEventListener('input', () => {
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
    const value = input.valueAsNumber;
    if (Number.isFinite(value) && value >= options.min && value <= options.max) {
      paintRange(value);
      if (value !== options.read()) options.write(value);
    }
  });
  input.addEventListener('change', () => {
    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || value < options.min || value > options.max) {
      input.setCustomValidity(`Enter a number between ${options.min} and ${options.max}.`);
      input.setAttribute('aria-invalid', 'true');
      input.reportValidity();
      return;
    }
    paintRange(value);
    if (value !== options.read()) options.write(value);
  });
  const refresh = () => {
    const value = options.read();
    if (document.activeElement !== input) {
      input.value = String(value);
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
    }
    paintRange(value);
  };
  refresh();
  return { element: root, refresh };
}

export function selectControl<T extends string>(labelText: string, choices: Array<{ value: T; label: string }>, read: () => T, write: (value: T) => void): Binding {
  const root = element('div', 'select-control');
  const label = element('label', 'field-label', labelText);
  const select = element('select');
  select.id = `select-${nextId++}`;
  label.htmlFor = select.id;
  for (const choice of choices) {
    const option = element('option', '', choice.label);
    option.value = choice.value;
    select.appendChild(option);
  }
  select.addEventListener('change', () => write(select.value as T));
  root.append(label, select);
  const refresh = () => { select.value = read(); };
  refresh();
  return { element: root, refresh };
}

export function toggleControl(labelText: string, read: () => boolean, write: (value: boolean) => void, disabled?: () => boolean): Binding {
  const root = element('label', 'toggle-control');
  root.appendChild(element('span', 'field-label', labelText));
  const input = element('input');
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.addEventListener('change', () => write(input.checked));
  root.appendChild(input);
  const refresh = () => {
    input.checked = read();
    input.disabled = disabled?.() ?? false;
  };
  refresh();
  return { element: root, refresh };
}

export function segments<T extends string>(label: string, choices: Array<{ value: T; label: string }>, read: () => T, write: (value: T) => void): Binding {
  const root = element('div', 'segmented-control');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', label);
  const buttons = choices.map(choice => {
    const item = button(choice.label, () => write(choice.value));
    root.appendChild(item);
    return { item, value: choice.value };
  });
  const refresh = () => {
    for (const { item, value } of buttons) item.setAttribute('aria-pressed', String(value === read()));
  };
  refresh();
  return { element: root, refresh };
}

export function disclosure(title: string): { element: HTMLDetailsElement; content: HTMLDivElement } {
  const root = element('details', 'disclosure');
  const summary = element('summary', '', title);
  const content = element('div', 'disclosure-content');
  root.append(summary, content);
  return { element: root, content };
}
