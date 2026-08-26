/** Tiny DOM helpers shared by the options page and the popup. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export const CARD =
  "rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-[0_16px_48px_-24px_rgba(0,0,0,0.8)]";

export const FIELD =
  "rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 " +
  "outline-none transition-colors focus:border-emerald-300/50";

export const BUTTON =
  "rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 " +
  "transition-colors hover:border-emerald-300/40 hover:text-emerald-200";

export function card(title: string, description: string): HTMLElement {
  const section = el("div", CARD);
  const head = el("div", "mb-5");
  head.append(
    el("h2", "text-sm font-semibold tracking-tight text-slate-100", title),
    el("p", "mt-1 text-xs leading-relaxed text-slate-400", description),
  );
  section.append(head);
  return section;
}

export function row(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const wrapper = el("div", "flex items-center justify-between gap-6 py-2.5");
  const text = el("div", "min-w-0");
  text.append(el("div", "text-[13px] font-medium text-slate-200", label));
  if (hint) text.append(el("div", "mt-0.5 text-[11px] text-slate-500", hint));
  wrapper.append(text, control);
  return wrapper;
}

export function select<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T,
  onChange: (value: T) => void,
): HTMLSelectElement {
  const node = el("select", FIELD);
  for (const option of options) {
    const item = el("option", "", option.label);
    item.value = option.value;
    node.append(item);
  }
  node.value = value;
  node.addEventListener("change", () => onChange(node.value as T));
  return node;
}

export function toggle(value: boolean, onChange: (value: boolean) => void): HTMLInputElement {
  const node = el("input", "h-4 w-4 accent-emerald-400");
  node.type = "checkbox";
  node.checked = value;
  node.addEventListener("change", () => onChange(node.checked));
  return node;
}
