import { afterEach, describe, expect, it } from "vitest";
import { applyAdminChanges, changedFields, formDefaults, isFormInUse } from "./form-state";

function mountForm(html: string): HTMLFormElement {
  const form = document.createElement("form");
  form.innerHTML = html;
  document.body.appendChild(form);
  return form;
}

describe("form state", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("reads what the form was rendered with, whatever the admin has changed since", () => {
    const form = mountForm(`
      <input type="checkbox" name="mirrored" checked />
      <input type="checkbox" name="showNext" />
      <select name="theme"><option value="DARK" selected>Dark</option><option value="LIGHT">Light</option></select>
      <input name="label" value="Ring" />
      <button type="submit" name="save">Save</button>`);
    form.querySelector<HTMLInputElement>('input[name="mirrored"]')!.checked = false;
    form.querySelector<HTMLSelectElement>('select[name="theme"]')!.value = "LIGHT";
    form.querySelector<HTMLInputElement>('input[name="label"]')!.value = "Other";

    expect([...formDefaults(form).entries()]).toEqual([["mirrored", "on"], ["theme", "DARK"], ["label", "Ring"]]);
  });

  it("calls a form in use when changed or focused, and free otherwise", () => {
    const form = mountForm(`<select name="theme"><option value="DARK" selected>Dark</option><option value="LIGHT">Light</option></select>`);
    const select = form.querySelector("select")!;
    expect(isFormInUse(form)).toBe(false);
    select.focus();
    expect(isFormInUse(form)).toBe(true);
    select.blur();
    select.value = "LIGHT";
    expect(isFormInUse(form)).toBe(true);
    select.value = "DARK";
    expect(isFormInUse(form)).toBe(false);
  });

  it("puts only the changed fields on the current values", () => {
    const rendered = { mirrored: false, showNext: true, theme: "DARK" };
    const submitted = { mirrored: false, showNext: false, theme: "DARK" };
    const current = { mirrored: true, showNext: true, theme: "LIGHT" };
    expect(changedFields(rendered, submitted)).toEqual({ showNext: false });
    expect(applyAdminChanges(current, rendered, submitted)).toEqual({ mirrored: true, showNext: false, theme: "LIGHT" });
    // Unknown rendered values: everything the admin submitted counts as a change.
    expect(applyAdminChanges(current, null, submitted)).toEqual(submitted);
  });
});
