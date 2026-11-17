/**
 * What a server-rendered form showed before anyone touched it, read from the DOM defaults
 * (`defaultChecked`, `defaultSelected`, `defaultValue`), so a save can send only what the admin changed.
 */
export function formDefaults(form: HTMLFormElement): FormData {
  const defaults = new FormData();
  for (const element of Array.from(form.elements)) {
    if (element instanceof HTMLInputElement && element.name && !element.disabled) {
      if (element.type === "checkbox" || element.type === "radio") {
        if (element.defaultChecked) defaults.append(element.name, element.value || "on");
      } else if (element.type !== "submit" && element.type !== "button") {
        defaults.append(element.name, element.defaultValue);
      }
    } else if (element instanceof HTMLSelectElement && element.name && !element.disabled) {
      const options = Array.from(element.options);
      const selected = options.find((option) => option.defaultSelected) ?? options[0];
      if (selected) defaults.append(element.name, selected.value);
    } else if (element instanceof HTMLTextAreaElement && element.name && !element.disabled) {
      defaults.append(element.name, element.defaultValue);
    }
  }
  return defaults;
}

function entriesKey(data: FormData): string {
  return JSON.stringify(Array.from(data.entries(), ([name, value]) => [name, String(value)]));
}

/** True when the admin changed the form, or is working in it (focus inside), so a refresh must not replace it. */
export function isFormInUse(form: HTMLFormElement): boolean {
  const active = form.ownerDocument.activeElement;
  if (active && active !== form.ownerDocument.body && form.contains(active)) return true;
  return entriesKey(new FormData(form)) !== entriesKey(formDefaults(form));
}

/** The fields of `submitted` that differ from what the form was rendered with (all of them when that is unknown). */
export function changedFields<T extends object>(rendered: T | null, submitted: T): Partial<T> {
  const changes: Partial<T> = {};
  for (const key of Object.keys(submitted) as (keyof T)[]) {
    if (!rendered || !Object.is(rendered[key], submitted[key])) changes[key] = submitted[key];
  }
  return changes;
}

/** The server's current values with only the admin's changes on top: a stale form never reverts what others set. */
export function applyAdminChanges<T extends object>(current: T, rendered: T | null, submitted: T): T {
  return { ...current, ...changedFields(rendered, submitted) };
}
