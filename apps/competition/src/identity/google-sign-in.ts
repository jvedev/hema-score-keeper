export interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            auto_select?: boolean;
          }): void;
          renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
          prompt(): void;
        };
      };
    };
  }
}

export function isGoogleSignInConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}

export async function renderGoogleSignInButton(
  container: HTMLElement,
  onCredential: (credential: string) => void,
): Promise<void> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("VITE_GOOGLE_CLIENT_ID is not configured.");
  }

  await loadGoogleIdentityScript();
  window.google!.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
    auto_select: true,
  });
  window.google!.accounts.id.renderButton(container, { theme: "outline", size: "large" });
  window.google!.accounts.id.prompt();
}

export function decodeGoogleIdTokenPayload(idToken: string): { email: string; name: string } {
  const segments = idToken.split(".");
  const payloadSegment = segments[1];
  if (!payloadSegment) {
    throw new Error("Malformed Google ID token.");
  }

  const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const payload = JSON.parse(atob(padded)) as { email: string; name?: string };
  return { email: payload.email, name: payload.name ?? payload.email };
}

let scriptLoadPromise: Promise<void> | undefined;

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts.id) {
    return Promise.resolve();
  }
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Google Sign-In."));
    document.head.append(script);
  });
  return scriptLoadPromise;
}
