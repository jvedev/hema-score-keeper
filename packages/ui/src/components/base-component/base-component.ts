import sharedStyles from "../../styles/shared.css?raw";

export class BaseComponent extends HTMLElement {
  readonly #root: ShadowRoot;
  #abortController = new AbortController();

  protected get signal(): AbortSignal {
    if (this.#abortController.signal.aborted) {
      this.#abortController = new AbortController();
    }

    return this.#abortController.signal;
  }

  protected get root(): ShadowRoot {
    return this.#root;
  }

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  disconnectedCallback(): void {
    this.#abortController.abort();
  }

  protected render(style = "", html = ""): void {
    this.root.innerHTML = `<style>${sharedStyles}\n${style}</style>${html}`;
  }

  protected registerEvent<EventType extends Event>(
    target: EventTarget,
    eventName: string,
    handler: (event: EventType) => void,
  ): void {
    target.addEventListener(eventName, handler as EventListener, {
      signal: this.signal,
    });
  }

  protected queryRoot<ElementType extends Element>(query: string): ElementType {
    const element = this.root.querySelector<ElementType>(query);
    if (!element) {
      throw new Error(`Element not found for query "${query}".`);
    }

    return element;
  }

  protected queryRootAll<ElementType extends Element>(
    query: string,
  ): NodeListOf<ElementType> {
    return this.root.querySelectorAll<ElementType>(query);
  }
}
