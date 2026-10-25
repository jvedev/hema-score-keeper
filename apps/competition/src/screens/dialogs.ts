import { t } from "@hema/ui";
import { objectionReason } from "../mappers/bout-actions";

/** Opens a modal `<dialog>` and resolves with its return value once it closes (Escape closes it with ""). */
function openDialog(content: string, setUp: (dialog: HTMLDialogElement) => void = () => undefined): Promise<string> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "dialog";
    dialog.innerHTML = content;
    setUp(dialog);
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(dialog.returnValue);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** Asks before something that can't simply be undone (leaving a competition, withdrawing a sign-up). */
export async function confirmDialog(message: string, confirmLabel: string): Promise<boolean> {
  const answer = await openDialog(
    `<form method="dialog" class="dialog-form">
      <p class="message"></p>
      <div class="row">
        <button type="submit" value="cancel">${t("app.cancel")}</button>
        <button type="submit" value="ok" class="primary confirm"></button>
      </div>
    </form>`,
    (dialog) => {
      dialog.querySelector(".message")!.textContent = message;
      dialog.querySelector(".confirm")!.textContent = confirmLabel;
    },
  );
  return answer === "ok";
}

/** Asks why the fighter objects. Null when they cancel; an empty reason isn't accepted. */
export async function askObjectionReason(): Promise<string | null> {
  let reason: string | null = null;
  const answer = await openDialog(
    `<form method="dialog" class="dialog-form">
      <h2>${t("app.objectTitle")}</h2>
      <label class="field"><span>${t("app.objectReason")}</span><textarea name="reason" rows="4" maxlength="1000"></textarea></label>
      <p class="muted">${t("app.objectHint")}</p>
      <p class="error" role="alert" hidden></p>
      <div class="row">
        <button type="submit" value="cancel" formnovalidate>${t("app.cancel")}</button>
        <button type="submit" value="send" class="primary">${t("app.objectSend")}</button>
      </div>
    </form>`,
    (dialog) => {
      const form = dialog.querySelector("form")!;
      const text = dialog.querySelector("textarea")!;
      const error = dialog.querySelector<HTMLElement>(".error")!;
      form.addEventListener("submit", (event) => {
        if ((event.submitter as HTMLButtonElement | null)?.value !== "send") {
          return;
        }
        reason = objectionReason(text.value);
        if (reason === null) {
          event.preventDefault();
          error.textContent = t("app.objectNeedsReason");
          error.hidden = false;
          text.focus();
        }
      });
    },
  );
  return answer === "send" ? reason : null;
}
