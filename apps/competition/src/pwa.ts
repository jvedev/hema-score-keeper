/** Installs the app (manifest + service worker) in production; in dev it removes old service workers instead. */
export function registerPwa(): void {
  if (import.meta.env.DEV) {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister();
        }
      });
    }
    return;
  }
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = `${import.meta.env.BASE_URL}manifest.json`;
  document.head.append(link);
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
    });
  }
}
