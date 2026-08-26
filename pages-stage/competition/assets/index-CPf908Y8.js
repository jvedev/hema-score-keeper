(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();function e(e){window.dispatchEvent(new CustomEvent(`match-event`,{detail:e}))}var t=`* {\r
  box-sizing: border-box;\r
  -webkit-tap-highlight-color: transparent;\r
  user-select: none;\r
}\r
\r
:host {\r
  --bg: var(--hema-bg, #0d1117);\r
  --surface: var(--hema-surface, #161b22);\r
  --surface-raised: var(--hema-surface-raised, #1c232d);\r
  --line: var(--hema-line, #2a313c);\r
  --text: var(--hema-text, #f2f5f7);\r
  --text-dim: var(--hema-text-dim, #8b949e);\r
  --warning: var(--hema-warning, #f5a623);\r
  --danger: var(--hema-danger, #e5484d);\r
  --radius: var(--hema-radius, 6px);\r
  --font-display: var(\r
    --hema-font-display,\r
    "JetBrains Mono",\r
    ui-monospace,\r
    monospace\r
  );\r
  --font-ui: var(--hema-font-ui, "Oswald", sans-serif);\r
  color: var(--text);\r
  font-family: var(--font-ui);\r
}\r
\r
button {\r
  font: inherit;\r
}\r
`,n=class extends HTMLElement{#e;#t=new AbortController;get signal(){return this.#t.signal.aborted&&(this.#t=new AbortController),this.#t.signal}get root(){return this.#e}constructor(){super(),this.#e=this.attachShadow({mode:`open`})}disconnectedCallback(){this.#t.abort()}render(e=``,n=``){this.root.innerHTML=`<style>${t}\n${e}</style>${n}`}registerEvent(e,t,n){e.addEventListener(t,n,{signal:this.signal})}queryRoot(e){let t=this.root.querySelector(e);if(!t)throw Error(`Element not found for query "${e}".`);return t}queryRootAll(e){return this.root.querySelectorAll(e)}},r=`:host {
  display: block;
}

.face {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text);
  cursor: pointer;
  display: block;
  margin: 6px;
  overflow: hidden;
  padding: 14px 10px;
  position: relative;
  text-align: center;
  width: calc(100% - 12px);
}

.digits {
  display: block;
  font-family: var(--font-display);
  font-size: clamp(3rem, 17vw, 4rem);
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  text-shadow: 0 0 18px currentColor;
}

.digits.low {
  color: var(--danger);
}

.hint {
  color: var(--text-dim);
  display: block;
  font-size: 11px;
  letter-spacing: 0.1em;
  margin-top: 4px;
  text-transform: uppercase;
}

.adjust {
  align-items: center;
  background: rgb(0 0 0 / 72%);
  display: none;
  inset: 0;
  justify-content: center;
  position: fixed;
  z-index: 500;
}

.adjust.open {
  display: flex;
}

.panel {
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 20px;
  text-align: center;
  width: min(320px, 86vw);
}

h2 {
  color: var(--text-dim);
  font-size: 13px;
  letter-spacing: 0.12em;
  margin: 0 0 16px;
  text-transform: uppercase;
}

.columns,
.actions {
  display: flex;
  gap: 18px;
  justify-content: center;
}

.column {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  touch-action: none;
}

.column button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text);
  height: 40px;
  width: 48px;
}

.value {
  background: var(--bg);
  border-radius: var(--radius);
  cursor: grab;
  font-family: var(--font-display);
  font-size: 34px;
  padding: 6px 0;
  text-align: center;
  width: 64px;
}

.label {
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.actions {
  gap: 8px;
  margin-top: 20px;
}

.actions button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text);
  flex: 1;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 12px;
  text-transform: uppercase;
}

.actions .apply {
  background: color-mix(in srgb, var(--hema-left-color, #21c15b) 18%, var(--surface));
  border-color: var(--hema-left-color, #21c15b);
}
`,i=`<button class="face" type="button" aria-label="Adjust match time">
  <span class="digits" part="digits">00:00</span>
  <span class="hint">Double-tap to adjust</span>
</button>

<div class="adjust" role="dialog" aria-modal="true" aria-labelledby="timer-title">
  <div class="panel">
    <h2 id="timer-title">Set time</h2>
    <div class="columns">
      <div class="column" data-unit="minutes">
        <button class="up" type="button" aria-label="Add one minute">&#9650;</button>
        <div class="value" data-role="minutes">00</div>
        <button class="down" type="button" aria-label="Subtract one minute">&#9660;</button>
        <div class="label">Minutes</div>
      </div>
      <div class="column" data-unit="seconds">
        <button class="up" type="button" aria-label="Add one second">&#9650;</button>
        <div class="value" data-role="seconds">00</div>
        <button class="down" type="button" aria-label="Subtract one second">&#9660;</button>
        <div class="label">Seconds</div>
      </div>
    </div>
    <div class="actions">
      <button class="cancel" type="button">Cancel</button>
      <button class="apply" type="button">Apply</button>
    </div>
  </div>
</div>
`,a=320;function o(e,t,n){let r=0;e.addEventListener(`click`,e=>{let n=Date.now();if(n-r<a){r=0,t(e);return}r=n},{signal:n})}var s=class extends n{static observedAttributes=[`seconds`];#e=120;#t=120;#n=!1;#r;#i={minutes:2,seconds:0};#a;#o;#s;#c;get running(){return this.#n}get remainingSeconds(){return this.#t}get elapsedSeconds(){return this.#e-this.#t}connectedCallback(){this.render(r,i),this.#l(),this.#a=this.queryRoot(`.digits`),this.#o=this.queryRoot(`.adjust`),this.#s=this.queryRoot(`[data-role="minutes"]`),this.#c=this.queryRoot(`[data-role="seconds"]`),o(this.queryRoot(`.face`),()=>this.#f(),this.signal),this.queryRootAll(`.column`).forEach(e=>this.#u(e)),this.registerEvent(this.queryRoot(`.cancel`),`click`,()=>this.#p()),this.registerEvent(this.queryRoot(`.apply`),`click`,()=>this.#m()),this.#g()}disconnectedCallback(){this.stop(),super.disconnectedCallback()}attributeChangedCallback(e,t,n){e!==`seconds`||t===n||!this.isConnected||(this.#l(),this.#g())}start(){this.#n||this.#t===0||(this.#n=!0,this.#r=window.setInterval(()=>{this.#t=Math.max(0,this.#t-1),this.#g(),this.#t===0&&(this.stop(),this.dispatchEvent(new CustomEvent(`timer-end`,{bubbles:!0})))},1e3))}stop(){this.#n=!1,this.#r!==void 0&&(window.clearInterval(this.#r),this.#r=void 0)}toggle(){return this.#n?this.stop():this.start(),this.#n}reset(){this.stop(),this.#t=this.#e,this.#g()}#l(){let e=Number.parseInt(this.getAttribute(`seconds`)??`120`,10);this.#e=Number.isFinite(e)&&e>=0?e:120,this.#t=this.#e,this.#i={minutes:Math.floor(this.#e/60),seconds:this.#e%60}}#u(e){let t=e.dataset.unit;if(t!==`minutes`&&t!==`seconds`)return;let n=e=>this.#d(t,e);this.registerEvent(e.querySelector(`.up`),`click`,()=>n(1)),this.registerEvent(e.querySelector(`.down`),`click`,()=>n(-1));let r=e.querySelector(`.value`);if(!r)throw Error(`Missing timer value for "${t}".`);let i=!1,a=0,o=0;this.registerEvent(r,`pointerdown`,e=>{i=!0,a=e.clientY,o=0,r.setPointerCapture(e.pointerId)}),this.registerEvent(r,`pointermove`,e=>{if(!i)return;let t=Math.trunc((a-e.clientY-o)/24);t!==0&&(n(t),o+=t*24)});let s=()=>{i=!1};this.registerEvent(r,`pointerup`,s),this.registerEvent(r,`pointercancel`,s)}#d(e,t){e===`minutes`?this.#i.minutes=Math.max(0,Math.min(99,this.#i.minutes+t)):this.#i.seconds=((this.#i.seconds+t)%60+60)%60,this.#h()}#f(){this.#i={minutes:Math.floor(this.#t/60),seconds:this.#t%60},this.#h(),this.#o.classList.add(`open`)}#p(){this.#o.classList.remove(`open`)}#m(){this.#t=this.#i.minutes*60+this.#i.seconds,this.#e=this.#t,this.stop(),this.#g(),this.#p(),this.dispatchEvent(new CustomEvent(`time-changed`,{bubbles:!0,detail:{seconds:this.#t}}))}#h(){this.#s.textContent=String(this.#i.minutes).padStart(2,`0`),this.#c.textContent=String(this.#i.seconds).padStart(2,`0`)}#g(){if(!this.#a)return;let e=Math.floor(this.#t/60),t=this.#t%60;this.#a.textContent=`${String(e).padStart(2,`0`)}:${String(t).padStart(2,`0`)}`,this.#a.classList.toggle(`low`,this.#t<=10)}};customElements.get(`hema-timer`)||customElements.define(`hema-timer`,s);var c=`:host {
  display: none;
  inset: 0;
  position: fixed;
  z-index: 600;
}

:host([open]) {
  align-items: center;
  display: flex;
  justify-content: center;
}

.backdrop {
  background: rgb(0 0 0 / 72%);
  inset: 0;
  position: absolute;
}

.panel {
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 24px;
  position: relative;
  text-align: center;
  width: min(300px, 86vw);
}

h2 {
  color: var(--text-dim);
  font-size: 13px;
  letter-spacing: 0.1em;
  margin: 0 0 4px;
  text-transform: uppercase;
}

.name {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 18px;
}

.stepper {
  align-items: center;
  display: flex;
  gap: 18px;
  justify-content: center;
}

.stepper button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--text);
  font-size: 26px;
  height: 56px;
  width: 56px;
}

.value {
  font-family: var(--font-display);
  font-size: 40px;
  min-width: 60px;
}

.done {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text);
  font-weight: 600;
  letter-spacing: 0.08em;
  margin-top: 22px;
  padding: 12px;
  text-transform: uppercase;
  width: 100%;
}
`,l=`<div class="backdrop"></div>
<div class="panel" role="dialog" aria-modal="true" aria-labelledby="score-title">
  <h2 id="score-title">Adjust score</h2>
  <p class="name"></p>
  <div class="stepper">
    <button class="minus" type="button" aria-label="Subtract one point">&minus;</button>
    <div class="value">0</div>
    <button class="plus" type="button" aria-label="Add one point">&plus;</button>
  </div>
  <button class="done" type="button">Done</button>
</div>
`,u=class extends n{#e=0;#t;#n;connectedCallback(){this.render(c,l),this.#t=this.queryRoot(`.value`),this.#n=this.queryRoot(`.name`),this.registerEvent(this.queryRoot(`.minus`),`click`,()=>this.#r(-1)),this.registerEvent(this.queryRoot(`.plus`),`click`,()=>this.#r(1)),this.registerEvent(this.queryRoot(`.done`),`click`,()=>this.close()),this.registerEvent(this.queryRoot(`.backdrop`),`click`,()=>this.close())}disconnectedCallback(){super.disconnectedCallback()}open(e,t){this.#e=e,this.#t.textContent=String(this.#e),this.#n.textContent=t,this.setAttribute(`open`,``)}close(){this.removeAttribute(`open`)}#r(e){this.#e+=e,this.#t.textContent=String(this.#e),this.dispatchEvent(new CustomEvent(`score-change`,{bubbles:!0,detail:{score:this.#e}}))}};customElements.get(`score-edit-view`)||customElements.define(`score-edit-view`,u);var d=`:host {
  display: block;
  flex: 1;
}

.panel {
  background: var(--fighter-background-color, #999);
  border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
  border-radius: var(--radius);
  color: var(--fighter-text-color, #fff);
  cursor: pointer;
  padding: 16px 10px;
  text-align: center;
  width: 100%;
}

.name,
.score,
.hint {
  display: block;
}

.name {
  font-size: 13px;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
  text-transform: uppercase;
}

.swatch {
  background: currentColor;
  border-radius: 50%;
  display: inline-block;
  height: 10px;
  margin-right: 6px;
  vertical-align: middle;
  width: 10px;
}

.score {
  font-family: var(--font-display);
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
}

.hint {
  color: color-mix(in srgb, currentColor 70%, transparent);
  font-size: 10px;
  letter-spacing: 0.08em;
  margin-top: 4px;
  text-transform: uppercase;
}
`,f=`<button class="panel" type="button" aria-label="Adjust fighter score">
  <span class="name">
    <span class="swatch"></span>
    <span class="name-text"></span>
  </span>
  <span class="score">0</span>
  <span class="hint">Double-tap to edit</span>
</button>
<score-edit-view></score-edit-view>
</div>
`,p=class extends n{static observedAttributes=[`name`,`score`,`background-color`,`text-color`];#e;#t;#n;#r;#i=!1;get score(){return Number.parseInt(this.#n.textContent??`0`,10)}connectedCallback(){this.render(d,f),this.#e=this.queryRoot(`.panel`),this.#t=this.queryRoot(`.name-text`),this.#n=this.queryRoot(`.score`),this.#r=this.queryRoot(`score-edit-view`),this.#i=!0,this.#a(),o(this.#e,()=>this.#r.open(this.score,this.#t.textContent??``),this.signal),this.registerEvent(this.#r,`score-change`,e=>{e.stopPropagation(),this.#n.textContent=String(e.detail.score),this.dispatchEvent(new CustomEvent(`score-change`,{bubbles:!0,detail:e.detail}))})}disconnectedCallback(){super.disconnectedCallback()}attributeChangedCallback(){this.#i&&this.#a()}reset(){this.#n.textContent=`0`}#a(){this.#t.textContent=this.getAttribute(`name`)??``,this.#n.textContent=this.getAttribute(`score`)??`0`,this.#e.style.setProperty(`--fighter-background-color`,this.getAttribute(`background-color`)??`#999`),this.#e.style.setProperty(`--fighter-text-color`,this.getAttribute(`text-color`)??`#fff`)}};customElements.get(`fighter-score`)||customElements.define(`fighter-score`,p);var ee=`:host {\r
  display: block;\r
}\r
\r
button {\r
  background: var(--surface-raised);\r
  border: 1px solid var(--line);\r
  border-radius: var(--radius);\r
  color: var(--text);\r
  font-size: 14px;\r
  font-weight: 600;\r
  letter-spacing: 0.08em;\r
  padding: 14px 8px;\r
  text-transform: uppercase;\r
  width: 100%;\r
}\r
\r
button.confirming {\r
  background: color-mix(in srgb, var(--danger) 30%, var(--surface-raised));\r
  border-color: var(--danger);\r
}\r
\r
:host([variant="danger"]) button {\r
  background: color-mix(in srgb, var(--danger) 22%, var(--surface-raised));\r
  border-color: var(--danger);\r
}\r
\r
:host([variant="danger"]) button.confirming {\r
  background: color-mix(in srgb, var(--danger) 48%, var(--surface-raised));\r
}\r
`,m=`<button type="button"></button>
`,te=class extends n{static observedAttributes=[`label`,`confirm-label`,`disabled`];#e=!1;#t;#n;#r=!1;connectedCallback(){this.render(ee,m),this.#n=this.queryRoot(`button`),this.#r=!0,this.#a(),this.registerEvent(this.#n,`click`,()=>this.#i())}disconnectedCallback(){this.#t!==void 0&&window.clearTimeout(this.#t),super.disconnectedCallback()}attributeChangedCallback(e){this.#r&&(e===`disabled`||!this.#e)&&this.#a()}#i(){if(!this.#e){this.#e=!0,this.#n.classList.add(`confirming`),this.#n.textContent=this.getAttribute(`confirm-label`)??`Tap again to confirm`,this.#t=window.setTimeout(()=>this.#a(),2500);return}this.#t!==void 0&&window.clearTimeout(this.#t),this.#a(),this.dispatchEvent(new CustomEvent(`confirmed`,{bubbles:!0}))}#a(){this.#e=!1,this.#t=void 0,this.#n.classList.remove(`confirming`),this.#n.textContent=this.getAttribute(`label`)??`Confirm`,this.#n.disabled=this.hasAttribute(`disabled`)}};customElements.get(`confirm-button`)||customElements.define(`confirm-button`,te);var ne=`:host {
  display: none;
  inset: 0;
  position: fixed;
  z-index: 700;
}

:host([open]) {
  align-items: center;
  display: flex;
  justify-content: center;
}

.backdrop {
  background: rgb(0 0 0 / 78%);
  inset: 0;
  position: absolute;
}

.panel {
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 26px 22px;
  position: relative;
  text-align: center;
  width: min(340px, 88vw);
}

h2 {
  font-size: 15px;
  letter-spacing: 0.1em;
  margin: 0 0 10px;
  text-transform: uppercase;
}

p {
  color: var(--text-dim);
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 20px;
}

button {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text);
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 12px;
  text-transform: uppercase;
  width: 100%;
}
`,re=`<div class="backdrop"></div>
<div class="panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title"></h2>
  <p></p>
  <button class="close" type="button">Close</button>
</div>
`,ie=class extends n{static observedAttributes=[`heading`,`description`];#e;#t;#n=!1;connectedCallback(){this.render(ne,re),this.#e=this.queryRoot(`h2`),this.#t=this.queryRoot(`p`),this.#n=!0,this.#r(),this.registerEvent(this.queryRoot(`.close`),`click`,()=>this.close()),this.registerEvent(this.queryRoot(`.backdrop`),`click`,()=>this.close())}disconnectedCallback(){super.disconnectedCallback()}attributeChangedCallback(){this.#n&&this.#r()}open(){this.setAttribute(`open`,``)}close(){this.removeAttribute(`open`)}#r(){this.#e.textContent=this.getAttribute(`heading`)??``,this.#t.textContent=this.getAttribute(`description`)??``}};customElements.get(`action-dialog`)||customElements.define(`action-dialog`,ie);var ae=`:host {\r
  display: flex;\r
  height: 100dvh;\r
  margin: 0 auto;\r
  max-width: 560px;\r
  width: 100%;\r
}\r
\r
.fight-view {\r
  display: flex;\r
  flex: 1;\r
  flex-direction: column;\r
  gap: 6px;\r
  min-height: 0;\r
  padding:\r
    env(safe-area-inset-top) env(safe-area-inset-right)\r
    env(safe-area-inset-bottom) env(safe-area-inset-left);\r
}\r
\r
.topbar {\r
  align-items: center;\r
  color: var(--text-dim);\r
  display: flex;\r
  font-size: 12px;\r
  justify-content: space-between;\r
  letter-spacing: 0.08em;\r
  padding: 8px 12px;\r
  text-transform: uppercase;\r
}\r
\r
.status {\r
  align-items: center;\r
  display: flex;\r
  gap: 6px;\r
}\r
\r
.topbar strong {\r
  color: var(--text);\r
  display: block;\r
  font-size: 14px;\r
  letter-spacing: 0.1em;\r
  margin-bottom: 2px;\r
}\r
\r
.status::before {\r
  background: var(--text-dim);\r
  border-radius: 50%;\r
  content: "";\r
  height: 7px;\r
  width: 7px;\r
}\r
\r
.status.on::before {\r
  background: var(--hema-left-color, #21c15b);\r
  box-shadow: 0 0 6px var(--hema-left-color, #21c15b);\r
}\r
\r
.topbar button {\r
  background: none;\r
  border: 1px solid var(--line);\r
  border-radius: var(--radius);\r
  color: var(--text-dim);\r
  font-size: 11px;\r
  letter-spacing: 0.08em;\r
  padding: 6px 10px;\r
  text-transform: uppercase;\r
}\r
\r
.score-panel-row,\r
.button-row {\r
  display: flex;\r
  gap: 6px;\r
  padding: 0 6px;\r
}\r
\r
.button-stack {\r
  display: contents;\r
}\r
\r
.button-stack.pre-start {\r
  display: flex;\r
  flex: 1;\r
  flex-direction: column;\r
  gap: 6px;\r
  min-height: 0;\r
  padding: 0 6px;\r
}\r
\r
.button-full {\r
  background: var(--surface-raised);\r
  border: 1px solid var(--line);\r
  border-radius: var(--radius);\r
  color: var(--text);\r
  display: block;\r
  font-size: 16px;\r
  font-weight: 600;\r
  letter-spacing: 0.1em;\r
  margin: 0 6px;\r
  padding: 16px;\r
  text-transform: uppercase;\r
}\r
\r
.button-full[hidden] {\r
  display: none;\r
}\r
\r
.button-full.hit {\r
  background: color-mix(\r
    in srgb,\r
    var(--hema-hit-color, #2f7dfa) 28%,\r
    var(--surface-raised)\r
  );\r
  border-color: var(--hema-hit-color, #2f7dfa);\r
  flex: 1;\r
  font-size: 24px;\r
}\r
\r
.button-full.warning {\r
  background: color-mix(\r
    in srgb,\r
    var(--warning) 22%,\r
    var(--surface-raised)\r
  );\r
  border-color: var(--warning);\r
}\r
\r
#timeout-button.running {\r
  background: color-mix(in srgb, var(--danger) 18%, var(--surface-raised));\r
  border-color: var(--danger);\r
}\r
\r
#timeout-button.starting {\r
  flex: 1;\r
  background: color-mix(\r
    in srgb,\r
    var(--hema-left-color, #21c15b) 18%,\r
    var(--surface-raised)\r
  );\r
  border-color: var(--hema-left-color, #21c15b);\r
  font-size: 30px;\r
  min-height: 0;\r
  padding: 28px 16px;\r
}\r
\r
#timeout-button.paused {\r
  background: color-mix(\r
    in srgb,\r
    var(--hema-left-color, #21c15b) 18%,\r
    var(--surface-raised)\r
  );\r
  border-color: var(--hema-left-color, #21c15b);\r
}\r
\r
#end-match-button {\r
  background: color-mix(in srgb, var(--warning) 18%, var(--surface-raised));\r
  border-color: var(--warning);\r
}\r
\r
.button-row {\r
  padding-bottom: 8px;\r
}\r
\r
.button-row > * {\r
  flex: 1;\r
}\r
`,oe=`<main class="fight-view">\r
  <header class="topbar">\r
    <div>\r
      <strong id="arena-name">Arena</strong>\r
      <span class="status" id="wake-status">Screen awake</span>\r
    </div>\r
    <button id="swap-button" type="button">Swap colors</button>\r
  </header>\r
\r
  <hema-timer id="timer" seconds="120"></hema-timer>\r
\r
  <section class="score-panel-row" aria-label="Fighter scores">\r
    <fighter-score\r
      id="fighter-left"\r
      side="left"\r
      name="Fighter A"\r
      score="0"\r
      background-color="var(--hema-left-background-color)"\r
      text-color="var(--hema-left-text-color)"\r
    ></fighter-score>\r
    <fighter-score\r
      id="fighter-right"\r
      side="right"\r
      name="Fighter B"\r
      score="0"\r
      background-color="var(--hema-right-background-color)"\r
      text-color="var(--hema-right-text-color)"\r
    ></fighter-score>\r
  </section>\r
\r
  <div class="button-stack">\r
    <button\r
      class="button-full hit"\r
      id="hit-button"\r
      type="button"\r
      hidden\r
    >Hit</button>\r
    <button\r
      class="button-full warning"\r
      id="warning-button"\r
      type="button"\r
      hidden\r
    >Warning</button>\r
    <button class="button-full starting" id="timeout-button" type="button">\r
      Start\r
    </button>\r
  </div>\r
\r
  <div class="button-row">\r
    <confirm-button\r
      id="reset-button"\r
      label="Reset"\r
      confirm-label="Confirm reset?"\r
    ></confirm-button>\r
    <confirm-button\r
      id="forfeit-button"\r
      label="Forfeit"\r
      confirm-label="Confirm forfeit?"\r
    ></confirm-button>\r
    <button class="button-full end-match" id="end-match-button" type="button">\r
      End match\r
    </button>\r
  </div>\r
</main>\r
`,se=class extends n{#e;#t;#n;#r;#i;#a;#o;#s=!1;#c=!1;#l=!1;#u=!1;#d={backgroundColor:`#21c15b`,textColor:`#071a0d`};#f={backgroundColor:`#2f7dfa`,textColor:`#ffffff`};connectedCallback(){this.render(ae,oe),this.#e=this.queryRoot(`#timer`),this.#t=this.queryRoot(`#fighter-left`),this.#n=this.queryRoot(`#fighter-right`),this.#r=this.queryRoot(`#timeout-button`),this.#i=this.queryRoot(`#end-match-button`),this.#a=this.queryRoot(`.button-stack`),this.#o=this.queryRoot(`#wake-status`),this.#g(this.#t,`A`),this.#g(this.#n,`B`),this.registerEvent(this.queryRoot(`#hit-button`),`click`,()=>{this.dispatchEvent(new CustomEvent(`hit-requested`,{bubbles:!0,detail:{elapsedTimeSeconds:this.#e.elapsedSeconds}}))}),this.registerEvent(this.queryRoot(`#warning-button`),`click`,()=>{this.dispatchEvent(new CustomEvent(`warning-requested`,{bubbles:!0,detail:{elapsedTimeSeconds:this.#e.elapsedSeconds}}))}),this.registerEvent(this.#r,`click`,()=>this.#m()),this.registerEvent(this.#i,`click`,()=>{this.dispatchEvent(new CustomEvent(`end-match-requested`,{bubbles:!0}))}),this.registerEvent(this.queryRoot(`#reset-button`),`confirmed`,()=>{this.#h(),this.dispatchEvent(new CustomEvent(`match-reset-requested`,{bubbles:!0}))}),this.registerEvent(this.queryRoot(`#forfeit-button`),`confirmed`,()=>{this.#e.stop(),this.#p(`forfeit-requested`)}),this.registerEvent(this.queryRoot(`#swap-button`),`click`,()=>this.#_()),this.#y()}disconnectedCallback(){super.disconnectedCallback()}setWakeLockActive(e){this.#o.classList.toggle(`on`,e)}configureArena(e){this.queryRoot(`#arena-name`).textContent=e.name,this.#t.setAttribute(`name`,e.fighterAName),this.#n.setAttribute(`name`,e.fighterBName),this.#d=e.leftFighterStyle,this.#f=e.rightFighterStyle,this.#u=!1,this.#v()}setMatchDuration(e){this.#e.setAttribute(`seconds`,String(Math.max(0,e))),this.#l=!1,this.#h()}setScores(e){this.#t.setAttribute(`score`,String(e.fighterAScore)),this.#n.setAttribute(`score`,String(e.fighterBScore))}setMatchActive(e){this.#c=e,e||this.#e.stop(),this.#y()}setMatchStarted(e){this.#s=e,e||this.#e.stop(),this.#y()}setMatchCompleted(e){this.#l=e,e&&(this.#c=!1,this.#e.stop()),this.#y()}#p(e){this.dispatchEvent(new CustomEvent(e,{bubbles:!0}))}#m(){this.#s||=!0,this.#e.toggle(),this.#y()}#h(){this.#e.reset(),this.setScores({fighterAScore:0,fighterBScore:0}),this.#s=!1,this.#y()}#g(t,n){this.registerEvent(t,`score-change`,t=>{t.stopPropagation(),e({elapsedTimeSeconds:this.#e.elapsedSeconds,type:`score-adjustment`,fighter:n,score:t.detail.score})})}#_(){this.#u=!this.#u,this.#v()}#v(){let e=this.#u?this.#f:this.#d,t=this.#u?this.#d:this.#f;this.style.setProperty(`--hema-left-background-color`,e.backgroundColor),this.style.setProperty(`--hema-left-text-color`,e.textColor),this.style.setProperty(`--hema-right-background-color`,t.backgroundColor),this.style.setProperty(`--hema-right-text-color`,t.textColor)}#y(){let e=this.#s,t=this.#c;if(this.queryRoot(`#hit-button`).disabled=!e||!t,this.queryRoot(`#warning-button`).disabled=!e||!t,this.queryRoot(`#timeout-button`).disabled=e?!t:!1,this.queryRoot(`#hit-button`).toggleAttribute(`hidden`,!e),this.queryRoot(`#warning-button`).toggleAttribute(`hidden`,!e),this.queryRoot(`#reset-button`).toggleAttribute(`disabled`,!e||!t),this.queryRoot(`#forfeit-button`).toggleAttribute(`disabled`,!e||!t),this.#a.classList.toggle(`pre-start`,!e),!e){this.#r.textContent=`Start`,this.#r.classList.add(`starting`),this.#r.classList.remove(`running`,`paused`);return}let n=this.#e.running;this.#r.textContent=n?`Timeout`:`Continue`,this.#r.classList.toggle(`running`,n),this.#r.classList.toggle(`paused`,!n),this.#r.classList.remove(`starting`)}};customElements.get(`fight-view`)||customElements.define(`fight-view`,se);var ce=`:host {
  background: var(--bg);
  display: none;
  inset: 0;
  overflow: auto;
  position: fixed;
  z-index: 700;
}

:host([open]) {
  display: block;
}

.score-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0 auto;
  min-height: 100dvh;
  padding:
    max(14px, env(safe-area-inset-top))
    max(12px, env(safe-area-inset-right))
    max(14px, env(safe-area-inset-bottom))
    max(12px, env(safe-area-inset-left));
  width: min(100%, 560px);
}

h1 {
  font-size: 18px;
  letter-spacing: 0.12em;
  margin: 0;
  text-align: center;
  text-transform: uppercase;
}

.fighters,
.selection-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.selection-grid {
  flex: 1;
  align-items: stretch;
}

.score-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
}

.score-options button {
  flex: 1 1 0;
}

.score-options button,
.outcomes button,
.cancel {
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text);
  font-weight: 600;
  letter-spacing: 0.06em;
  min-height: 48px;
  padding: 10px;
  text-transform: uppercase;
}

.score-options button.selected {
  border-color: var(--text);
  box-shadow: inset 0 0 0 2px var(--text);
}

.outcomes {
  display: grid;
  gap: 8px;
  margin-top: auto;
}

.outcomes.two-column {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.outcomes .no-score {
  background: color-mix(in srgb, #21c15b 25%, var(--surface-raised));
  border-color: #21c15b;
}

.outcomes .hit {
  background: color-mix(in srgb, #2f7dfa 28%, var(--surface-raised));
  border-color: #2f7dfa;
}

.outcomes .first-a {
  background: var(--score-fighter-a-background);
  color: var(--score-fighter-a-text);
}

.outcomes .first-b {
  background: var(--score-fighter-b-background);
  color: var(--score-fighter-b-text);
}

.outcomes .double {
  background: color-mix(in srgb, var(--danger) 30%, var(--surface-raised));
  border-color: var(--danger);
  grid-column: 1 / -1;
}

.cancel {
  width: 100%;
}
`,le=`<section class="score-view" role="dialog" aria-modal="true" aria-labelledby="title">
  <header>
    <h1 id="title">Score</h1>
  </header>

  <div class="fighters">
    <fighter-score
      id="fighter-a"
      name="Fighter A"
      score="0"
      background-color="var(--score-fighter-a-background)"
      text-color="var(--score-fighter-a-text)"
    ></fighter-score>
    <fighter-score
      id="fighter-b"
      name="Fighter B"
      score="0"
      background-color="var(--score-fighter-b-background)"
      text-color="var(--score-fighter-b-text)"
    ></fighter-score>
  </div>

  <div class="selection-grid">
    <div class="score-options" data-fighter="a" aria-label="Fighter A score"></div>
    <div class="score-options" data-fighter="b" aria-label="Fighter B score"></div>
  </div>

  <div class="outcomes" aria-live="polite"></div>
  <button class="cancel" type="button">Cancel</button>
</section>
`,ue=class extends n{#e={scores:[1,2,3,4],fighterA:{name:`Fighter A`,score:0,backgroundColor:`#21c15b`,textColor:`#071a0d`},fighterB:{name:`Fighter B`,score:0,backgroundColor:`#2f7dfa`,textColor:`#ffffff`}};#t={a:`no-score`,b:`no-score`};#n=0;connectedCallback(){this.render(ce,le),this.registerEvent(this.queryRoot(`.cancel`),`click`,()=>this.close()),this.#u(`a`,`A`),this.#u(`b`,`B`),this.#r()}disconnectedCallback(){super.disconnectedCallback()}configure(e){this.#e={...e,scores:[...e.scores]},this.isConnected&&this.#r()}setScores(e,t){this.#e={...this.#e,fighterA:{...this.#e.fighterA,score:e},fighterB:{...this.#e.fighterB,score:t}},this.isConnected&&this.#r()}open(e){this.#n=Math.max(0,e),this.#t={a:`no-score`,b:`no-score`},this.#r(),this.setAttribute(`open`,``)}close(){this.removeAttribute(`open`)}#r(){this.#i(`a`,this.#e.fighterA),this.#i(`b`,this.#e.fighterB),this.#a(`a`),this.#a(`b`),this.#o()}#i(e,t){let n=this.queryRoot(`#fighter-${e}`);n.setAttribute(`name`,t.name),n.setAttribute(`score`,String(t.score)),this.queryRoot(`.score-options[data-fighter="${e}"]`).setAttribute(`aria-label`,`${t.name} score`),this.style.setProperty(`--score-fighter-${e}-background`,t.backgroundColor),this.style.setProperty(`--score-fighter-${e}-text`,t.textColor)}#a(e){let t=this.queryRoot(`.score-options[data-fighter="${e}"]`),n=[{value:`no-score`,label:`No score`},...this.#e.scores.map(e=>({value:e,label:String(e)})),{value:`low-quality`,label:`Low quality`}];t.replaceChildren(...n.map(({value:t,label:n})=>{let r=document.createElement(`button`);return r.type=`button`,r.textContent=n,r.classList.toggle(`selected`,this.#t[e]===t),this.registerEvent(r,`click`,()=>{this.#t[e]=t,this.#a(e),this.#o()}),r}))}#o(){let e=this.queryRoot(`.outcomes`),t=this.#c(`a`),n=this.#c(`b`);if(e.replaceChildren(),e.classList.toggle(`two-column`,t>0&&n>0),t===0&&n===0){e.append(this.#s(`No score`,`no-score`,()=>this.#l(`no-score`)));return}if(t===0||n===0){e.append(this.#s(`Hit`,`hit`,()=>this.#l(`hit`)));return}e.append(this.#s(`First`,`first-a`,()=>this.#l(`afterblow`,`A`)),this.#s(`First`,`first-b`,()=>this.#l(`afterblow`,`B`)),this.#s(`Double`,`double`,()=>this.#l(`double`)))}#s(e,t,n){let r=document.createElement(`button`);return r.type=`button`,r.className=t,r.textContent=e,this.registerEvent(r,`click`,n),r}#c(e){let t=this.#t[e];return typeof t==`number`?t:0}#l(t,n){let r={elapsedTimeSeconds:this.#n,fighterAScore:this.#c(`a`),fighterBScore:this.#c(`b`),details:{fighterA:{outcome:this.#f(`a`)},fighterB:{outcome:this.#f(`b`)}}};e(t===`afterblow`?{...r,type:t,firstFighter:this.#d(n)}:{...r,type:t}),this.close()}#u(t,n){let r=this.queryRoot(`#fighter-${t}`);this.registerEvent(r,`score-change`,t=>{t.stopPropagation(),e({elapsedTimeSeconds:this.#n,type:`score-adjustment`,fighter:n,score:t.detail.score})})}#d(e){if(!e)throw Error(`An afterblow must identify the first fighter.`);return e}#f(e){let t=this.#t[e];return typeof t==`number`?`score`:t}};customElements.get(`score-view`)||customElements.define(`score-view`,ue);var de=`:host {
  background: var(--bg);
  display: none;
  inset: 0;
  overflow: auto;
  position: fixed;
  z-index: 710;
}

:host([open]) {
  display: block;
}

.warning-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0 auto;
  min-height: 100dvh;
  padding:
    max(18px, env(safe-area-inset-top))
    max(12px, env(safe-area-inset-right))
    max(18px, env(safe-area-inset-bottom))
    max(12px, env(safe-area-inset-left));
  width: min(100%, 560px);
}

h1 {
  font-size: 18px;
  letter-spacing: 0.12em;
  margin: 0;
  text-align: center;
  text-transform: uppercase;
}

.step-label {
  color: var(--text-dim);
  font-size: 12px;
  letter-spacing: 0.08em;
  margin: 4px 0 0;
  text-align: center;
  text-transform: uppercase;
}

.content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
}

.fighter-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.content button,
.navigation button {
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--text);
  font-weight: 600;
  min-height: 50px;
  padding: 12px;
}

.fighter-a {
  background: var(--warning-fighter-a-background) !important;
  color: var(--warning-fighter-a-text) !important;
}

.fighter-b {
  background: var(--warning-fighter-b-background) !important;
  color: var(--warning-fighter-b-text) !important;
}

.penalty-option,
.deduction-option {
  text-align: left;
}

.deduction-option.selected {
  border-color: var(--text);
  box-shadow: inset 0 0 0 2px var(--text);
}

.confirm-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}

.navigation {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.back[hidden] {
  display: block;
  visibility: hidden;
}
`,fe=`<section class="warning-view" role="dialog" aria-modal="true" aria-labelledby="title">
  <header>
    <h1 id="title">Warning</h1>
    <p class="step-label"></p>
  </header>
  <div class="content"></div>
  <div class="navigation">
    <button class="back" type="button">Back</button>
    <button class="cancel" type="button">Cancel</button>
  </div>
</section>
`,pe=class extends n{#e={fighterA:{name:`Fighter A`,backgroundColor:`#21c15b`,textColor:`#071a0d`},fighterB:{name:`Fighter B`,backgroundColor:`#2f7dfa`,textColor:`#ffffff`},penalties:[]};#t=`fighter`;#n;#r;#i;#a=0;connectedCallback(){this.render(de,fe),this.registerEvent(this.queryRoot(`.cancel`),`click`,()=>this.close()),this.registerEvent(this.queryRoot(`.back`),`click`,()=>this.#u()),this.#o()}disconnectedCallback(){super.disconnectedCallback()}configure(e){this.#e={...e,penalties:e.penalties.map(e=>({...e,penalties:[...e.penalties]}))},this.#m(),this.isConnected&&this.#o()}open(e){this.#a=Math.max(0,e),this.#t=`fighter`,this.#n=void 0,this.#r=void 0,this.#i=void 0,this.#o(),this.setAttribute(`open`,``)}close(){this.removeAttribute(`open`)}#o(){let e={fighter:`1 / 3 ? Choose fighter`,penalty:`2 / 3 ? Choose warning`,deduction:`3 / 3 ? Choose penalty`};this.queryRoot(`.step-label`).textContent=e[this.#t],this.queryRoot(`.back`).hidden=this.#t===`fighter`,this.#t===`fighter`?this.#s():this.#t===`penalty`?this.#c():this.#l()}#s(){let e=this.queryRoot(`.content`),t=document.createElement(`div`);t.className=`fighter-grid`,t.append(this.#p(this.#e.fighterA.name,`fighter-a`,()=>{this.#n=`A`,this.#t=`penalty`,this.#o()}),this.#p(this.#e.fighterB.name,`fighter-b`,()=>{this.#n=`B`,this.#t=`penalty`,this.#o()})),e.replaceChildren(t)}#c(){this.queryRoot(`.content`).replaceChildren(...this.#e.penalties.map(e=>this.#p(e.description,`penalty-option`,()=>{this.#r=e,this.#i=void 0,this.#t=`deduction`,this.#o()})))}#l(){if(!this.#r)throw Error(`A warning must be selected.`);let e=this.queryRoot(`.content`),t=this.#r.penalties.map(e=>this.#p(`${e} ${e===1?`point`:`points`}`,`deduction-option${this.#i===e?` selected`:``}`,()=>{this.#i=e,this.#l()})),n=document.createElement(`div`);if(n.className=`confirm-actions`,this.#i!==void 0){let e=document.createElement(`confirm-button`);e.setAttribute(`label`,`Register warning`),e.setAttribute(`confirm-label`,`Confirm warning?`),this.registerEvent(e,`confirmed`,()=>this.#d()),n.append(e)}if(this.#r.disqualify){let e=document.createElement(`confirm-button`);e.setAttribute(`variant`,`danger`),e.setAttribute(`label`,`Disqualify`),e.setAttribute(`confirm-label`,`Confirm disqualification?`),this.registerEvent(e,`confirmed`,()=>this.#f()),n.append(e)}t.push(n),e.replaceChildren(...t)}#u(){this.#t===`deduction`?(this.#t=`penalty`,this.#r=void 0,this.#i=void 0):this.#t===`penalty`&&(this.#t=`fighter`,this.#n=void 0),this.#o()}#d(){if(!this.#n||!this.#r||this.#i===void 0)throw Error(`Warning event is incomplete.`);e({elapsedTimeSeconds:this.#a,type:`warning`,fighter:this.#n,description:this.#r.description,pointsDeducted:this.#i}),this.close()}#f(){if(!this.#n||!this.#r)throw Error(`Disqualification event is incomplete.`);e({elapsedTimeSeconds:this.#a,type:`disqualification`,fighter:this.#n,description:this.#r.description}),this.close()}#p(e,t,n){let r=document.createElement(`button`);return r.type=`button`,r.className=t,r.textContent=e,this.registerEvent(r,`click`,n),r}#m(){this.style.setProperty(`--warning-fighter-a-background`,this.#e.fighterA.backgroundColor),this.style.setProperty(`--warning-fighter-a-text`,this.#e.fighterA.textColor),this.style.setProperty(`--warning-fighter-b-background`,this.#e.fighterB.backgroundColor),this.style.setProperty(`--warning-fighter-b-text`,this.#e.fighterB.textColor)}};customElements.get(`warning-view`)||customElements.define(`warning-view`,pe);var me=`:host {\r
  display: block;\r
  height: 100%;\r
}\r
\r
.select-bout-view {\r
  background: var(--hema-bg);\r
  box-sizing: border-box;\r
  color: var(--hema-text);\r
  min-height: 100%;\r
  padding: 32px 20px;\r
}\r
\r
header,\r
main {\r
  margin: 0 auto;\r
  max-width: 480px;\r
}\r
\r
header {\r
  border-bottom: 1px solid var(--hema-border);\r
  margin-bottom: 28px;\r
  padding-bottom: 24px;\r
}\r
\r
header p,\r
header h1,\r
main h2 {\r
  font-family: var(--hema-font-display);\r
  text-transform: uppercase;\r
}\r
\r
header p {\r
  color: var(--hema-text-dim);\r
  font-size: 12px;\r
  letter-spacing: 0.16em;\r
  margin: 0 0 8px;\r
}\r
\r
header h1 {\r
  font-size: 30px;\r
  letter-spacing: 0.08em;\r
  margin: 0 0 6px;\r
}\r
\r
#fighter-count {\r
  color: var(--hema-text-dim);\r
  font-size: 14px;\r
}\r
\r
main h2 {\r
  font-size: 16px;\r
  letter-spacing: 0.12em;\r
  margin: 0 0 14px;\r
}\r
\r
#bout-list {\r
  display: grid;\r
  gap: 10px;\r
}\r
\r
.bout-button {\r
  background: var(--hema-surface);\r
  border: 1px solid var(--hema-border);\r
  border-radius: var(--hema-radius);\r
  color: var(--hema-text);\r
  font-family: var(--hema-font-ui);\r
  padding: 14px 16px;\r
  text-align: left;\r
  width: 100%;\r
}\r
\r
.bout-button:hover,\r
.bout-button:focus-visible {\r
  border-color: var(--hema-left-color);\r
  outline: none;\r
}\r
\r
.bout-button span,\r
.bout-button strong {\r
  display: block;\r
}\r
\r
.bout-button span {\r
  color: var(--hema-text-dim);\r
  font-size: 11px;\r
  letter-spacing: 0.1em;\r
  margin-bottom: 5px;\r
  text-transform: uppercase;\r
}\r
\r
.bout-button strong {\r
  font-size: 16px;\r
}\r
`,he=`<div class="select-bout-view">\r
  <header>\r
    <p>HEMA Scorebox</p>\r
    <h1 id="arena-name"></h1>\r
    <span id="fighter-count"></span>\r
  </header>\r
  <main>\r
    <h2>Select a bout</h2>\r
    <div id="bout-list"></div>\r
  </main>\r
</div>\r
`,ge=class extends n{connectedCallback(){this.render(me,he)}disconnectedCallback(){super.disconnectedCallback()}configure(e){this.queryRoot(`#arena-name`).textContent=e.arenaName,this.queryRoot(`#fighter-count`).textContent=`${e.fighterCount} fighters`;let t=this.queryRoot(`#bout-list`);t.replaceChildren();for(let n of e.bouts){let e=document.createElement(`button`);e.type=`button`,e.className=`bout-button`;let r=document.createElement(`span`);r.textContent=`Bout ${n.sequenceNumber} · Round ${n.round}`;let i=document.createElement(`strong`);i.textContent=`${n.fighterAName} vs ${n.fighterBName}`,e.append(r,i),this.registerEvent(e,`click`,()=>{this.dispatchEvent(new CustomEvent(`bout-selected`,{bubbles:!0,detail:{boutId:n.id}}))}),t.append(e)}}};customElements.get(`select-bout-view`)||customElements.define(`select-bout-view`,ge);var _e=`:host {\r
  display: block;\r
  height: 100%;\r
}\r
\r
.start-screen-view {\r
  box-sizing: border-box;\r
  min-height: 100%;\r
  padding: 24px 20px 28px;\r
}\r
\r
.hero,\r
.content {\r
  margin: 0 auto;\r
  max-width: 820px;\r
}\r
\r
.hero {\r
  align-items: end;\r
  display: flex;\r
  justify-content: space-between;\r
  gap: 16px;\r
  padding-bottom: 20px;\r
}\r
\r
.hero p,\r
.hero h1,\r
.section-header h2,\r
.section-header p {\r
  margin: 0;\r
}\r
\r
.hero p {\r
  color: rgba(255, 255, 255, 0.7);\r
  font-size: 12px;\r
  letter-spacing: 0.14em;\r
  text-transform: uppercase;\r
}\r
\r
.hero h1 {\r
  font-size: 28px;\r
  letter-spacing: 0.04em;\r
  margin-top: 6px;\r
  text-transform: uppercase;\r
}\r
\r
#status-copy {\r
  color: rgba(255, 255, 255, 0.7);\r
  display: block;\r
  font-size: 14px;\r
  margin-top: 6px;\r
}\r
\r
.is-error {\r
  color: #ff9b9b;\r
}\r
\r
.hero-badges {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 8px;\r
  justify-content: flex-end;\r
}\r
\r
.badge {\r
  align-items: center;\r
  background: rgba(255, 255, 255, 0.06);\r
  border: 1px solid rgba(255, 255, 255, 0.1);\r
  border-radius: 999px;\r
  display: inline-flex;\r
  font-size: 12px;\r
  gap: 6px;\r
  line-height: 1;\r
  padding: 8px 12px;\r
}\r
\r
.content {\r
  display: grid;\r
  gap: 14px;\r
}\r
\r
.panel {\r
  background: #111723;\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 18px;\r
  display: grid;\r
  gap: 14px;\r
  padding: 14px;\r
}\r
\r
.field-grid {\r
  display: grid;\r
  gap: 12px;\r
  grid-template-columns: repeat(2, minmax(0, 1fr));\r
}\r
\r
.field {\r
  display: grid;\r
  gap: 6px;\r
}\r
\r
.field span {\r
  color: rgba(255, 255, 255, 0.72);\r
  font-size: 12px;\r
  font-weight: 600;\r
}\r
\r
select,\r
button {\r
  font: inherit;\r
}\r
\r
select {\r
  background: #0f1623;\r
  border: 1px solid rgba(255, 255, 255, 0.12);\r
  border-radius: 12px;\r
  color: inherit;\r
  min-width: 0;\r
  padding: 10px 12px;\r
}\r
\r
.section-header h2 {\r
  font-size: 18px;\r
  text-transform: uppercase;\r
}\r
\r
.section-header p {\r
  color: rgba(255, 255, 255, 0.7);\r
  font-size: 12px;\r
  margin-top: 4px;\r
}\r
\r
.message {\r
  color: rgba(255, 255, 255, 0.72);\r
  font-size: 14px;\r
}\r
\r
.message.is-error {\r
  color: #ff9b9b;\r
}\r
\r
.fight-list {\r
  display: grid;\r
  gap: 10px;\r
}\r
\r
.fight-button {\r
  background: #0f1623;\r
  border: 1px solid rgba(255, 255, 255, 0.12);\r
  border-radius: 16px;\r
  color: inherit;\r
  display: grid;\r
  gap: 4px;\r
  padding: 14px 16px;\r
  text-align: left;\r
  width: 100%;\r
}\r
\r
.fight-button:hover,\r
.fight-button:focus-visible {\r
  border-color: var(--hema-left-color);\r
  outline: none;\r
}\r
\r
.fight-button:disabled,\r
.fight-button.is-disabled {\r
  cursor: not-allowed;\r
  opacity: 0.55;\r
}\r
\r
.fight-meta,\r
.fight-status {\r
  color: rgba(255, 255, 255, 0.68);\r
  display: block;\r
  font-size: 12px;\r
  letter-spacing: 0.08em;\r
  text-transform: uppercase;\r
}\r
\r
.fight-title {\r
  display: block;\r
  font-size: 16px;\r
  margin-top: 6px;\r
}\r
\r
.fight-status {\r
  margin-top: 6px;\r
}\r
\r
@media (max-width: 680px) {\r
  .hero {\r
    align-items: start;\r
    flex-direction: column;\r
  }\r
\r
  .field-grid {\r
    grid-template-columns: 1fr;\r
  }\r
}\r
`,ve=`<div class="start-screen-view">\r
  <header class="hero">\r
    <div>\r
      <p>HEMA Scorebox</p>\r
      <h1>Tournament mode</h1>\r
      <span id="status-copy"></span>\r
    </div>\r
    <div class="hero-badges">\r
      <span class="badge" id="stage-badge"></span>\r
      <span class="badge" id="fight-badge"></span>\r
    </div>\r
  </header>\r
\r
  <main class="content">\r
    <section class="panel">\r
      <div class="field-grid">\r
        <label class="field">\r
          <span>Event</span>\r
          <select id="event-select"></select>\r
        </label>\r
        <label class="field">\r
          <span>Arena</span>\r
          <select id="arena-select"></select>\r
        </label>\r
      </div>\r
    </section>\r
\r
    <section class="panel">\r
      <header class="section-header">\r
        <div>\r
          <h2>Fights</h2>\r
          <p id="fight-summary"></p>\r
        </div>\r
      </header>\r
      <div id="message" class="message"></div>\r
      <div id="fight-list" class="fight-list"></div>\r
    </section>\r
  </main>\r
</div>\r
`,ye=class extends n{#e={loading:!0,error:null,eventOptions:[],selectedEventId:null,arenaOptions:[],selectedArenaId:null,activeTimeSlotLabel:null,fightSummary:null,inactiveMessage:null,fights:[]};connectedCallback(){this.#t()}configure(e){this.#e=e,this.#t()}#t(){this.render(_e,ve);let e=this.#e,t=this.queryRoot(`#status-copy`),n=this.queryRoot(`#stage-badge`),r=this.queryRoot(`#fight-badge`),i=this.queryRoot(`#message`),a=this.queryRoot(`#fight-summary`),o=this.queryRoot(`#event-select`),s=this.queryRoot(`#arena-select`),c=this.queryRoot(`#fight-list`);if(o.replaceChildren(),s.replaceChildren(),c.replaceChildren(),i.textContent=``,i.classList.remove(`is-error`),e.loading)t.textContent=`Loading events...`,n.textContent=`Loading`,r.textContent=``;else if(e.error){t.textContent=e.error,t.classList.add(`is-error`),n.textContent=`Error`,r.textContent=``,i.textContent=e.error,i.classList.add(`is-error`);let a=document.createElement(`button`);a.type=`button`,a.className=`fight-button`,a.textContent=`Retry loading events`,this.registerEvent(a,`click`,()=>{this.dispatchEvent(new CustomEvent(`reload-requested`,{bubbles:!0}))}),c.append(a),o.disabled=!0,s.disabled=!0;return}else t.textContent=e.inactiveMessage??`Choose an event and arena to load the active time slot fights.`,t.classList.toggle(`is-error`,!!e.inactiveMessage),n.textContent=e.activeTimeSlotLabel??`No active time slot`,r.textContent=e.fightSummary??``;o.disabled=e.loading||e.eventOptions.length===0,s.disabled=e.loading||e.arenaOptions.length===0;for(let t of e.eventOptions){let n=document.createElement(`option`);n.value=t.id,n.textContent=t.name,t.id===e.selectedEventId&&(n.selected=!0),o.append(n)}for(let t of e.arenaOptions){let n=document.createElement(`option`);n.value=t.id,n.textContent=t.name,t.id===e.selectedArenaId&&(n.selected=!0),s.append(n)}!e.loading&&e.eventOptions.length===0?i.textContent=`No events are available.`:!e.loading&&e.arenaOptions.length===0?i.textContent=`This event has no arenas.`:!e.loading&&e.fights.length===0&&!e.inactiveMessage?i.textContent=`No fights are assigned to this arena yet.`:e.inactiveMessage&&(i.textContent=e.inactiveMessage,i.classList.add(`is-error`)),a.textContent=e.fightSummary??``;for(let t of e.fights){let e=document.createElement(`button`);e.type=`button`,e.className=`fight-button`;let n=document.createElement(`span`);n.className=`fight-meta`,n.textContent=t.roundLabel;let r=document.createElement(`strong`);r.className=`fight-title`,r.textContent=`${t.fighterAName} vs ${t.fighterBName}`;let i=document.createElement(`span`);i.className=`fight-status`,i.textContent=t.statusLabel,e.append(n,r,i),e.disabled=t.disabled,e.classList.toggle(`is-disabled`,t.disabled),t.disabled||this.registerEvent(e,`click`,()=>{this.dispatchEvent(new CustomEvent(`fight-selected`,{bubbles:!0,detail:{matchId:t.id}}))}),c.append(e)}this.registerEvent(o,`change`,()=>{this.dispatchEvent(new CustomEvent(`event-selected`,{bubbles:!0,detail:{eventId:o.value}}))}),this.registerEvent(s,`change`,()=>{this.dispatchEvent(new CustomEvent(`arena-selected`,{bubbles:!0,detail:{arenaId:s.value}}))})}};customElements.get(`start-screen-view`)||customElements.define(`start-screen-view`,ye);var be=`* {\r
  box-sizing: border-box;\r
}\r
\r
:host {\r
  display: block;\r
  height: 100vh;\r
  background: var(--hema-bg);\r
  color: var(--hema-text);\r
  font-family: var(--hema-font-ui);\r
}\r
\r
:host *,\r
:host *::before,\r
:host *::after {\r
  box-sizing: border-box;\r
}\r
\r
button,\r
select,\r
input {\r
  font: inherit;\r
}\r
\r
button {\r
  cursor: pointer;\r
}\r
\r
:host {\r
  min-height: 100vh;\r
}\r
\r
.shell {\r
  display: grid;\r
  grid-template-rows: auto 1fr;\r
  height: 100%;\r
}\r
\r
.topbar {\r
  align-items: center;\r
  background: #111723;\r
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);\r
  display: flex;\r
  gap: 16px;\r
  justify-content: space-between;\r
  padding: 10px 14px;\r
}\r
\r
.title {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 4px;\r
}\r
\r
.title h1 {\r
  align-items: center;\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 8px;\r
  font-size: 20px;\r
  margin: 0;\r
}\r
\r
.stage-pill {\r
  border-radius: 999px;\r
  color: #0f1623;\r
  font-size: 12px;\r
  font-weight: 700;\r
  letter-spacing: 0.04em;\r
  padding: 3px 8px;\r
  text-transform: uppercase;\r
}\r
\r
.stage-pill-pool {\r
  background: #7ef0a4;\r
}\r
\r
.stage-pill-elimination {\r
  background: #7da4ff;\r
}\r
\r
.stage-pill-final {\r
  background: #ffc96b;\r
}\r
\r
.title p,\r
.hint,\r
.section-label {\r
  color: rgba(255, 255, 255, 0.68);\r
  margin: 0;\r
}\r
\r
.topbar-tools {\r
  align-items: center;\r
  display: flex;\r
  gap: 8px;\r
  flex-wrap: wrap;\r
}\r
\r
.topbar-actions {\r
  display: flex;\r
  gap: 6px;\r
  flex-wrap: wrap;\r
}\r
\r
.header-switch {\r
  align-items: center;\r
  background: #20283a;\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 999px;\r
  display: inline-flex;\r
  gap: 8px;\r
  min-height: 32px;\r
  padding: 0 10px 0 8px;\r
}\r
\r
.header-switch input {\r
  height: 0;\r
  opacity: 0;\r
  position: absolute;\r
  width: 0;\r
}\r
\r
.header-switch-track {\r
  background: rgba(255, 255, 255, 0.18);\r
  border-radius: 999px;\r
  display: inline-block;\r
  height: 18px;\r
  position: relative;\r
  width: 32px;\r
}\r
\r
.header-switch-track::after {\r
  background: white;\r
  border-radius: 50%;\r
  content: "";\r
  height: 12px;\r
  left: 3px;\r
  position: absolute;\r
  top: 3px;\r
  transition: transform 120ms ease;\r
  width: 12px;\r
}\r
\r
.header-switch input:checked + .header-switch-track {\r
  background: #2d66ff;\r
}\r
\r
.header-switch input:checked + .header-switch-track::after {\r
  transform: translateX(14px);\r
}\r
\r
.header-switch-label {\r
  color: rgba(255, 255, 255, 0.86);\r
  font-size: 12px;\r
  font-weight: 600;\r
  letter-spacing: 0.04em;\r
  text-transform: uppercase;\r
}\r
\r
.select,\r
.text-input {\r
  background: #0f1623;\r
  border: 1px solid rgba(255, 255, 255, 0.1);\r
  border-radius: 10px;\r
  color: inherit;\r
  min-height: 36px;\r
  padding: 0 12px;\r
}\r
\r
.layout {\r
  display: grid;\r
  grid-template-columns: 280px 1fr;\r
  min-height: 0;\r
}\r
\r
.sidebar {\r
  border-right: 1px solid rgba(255, 255, 255, 0.08);\r
  display: grid;\r
  gap: 12px;\r
  overflow: auto;\r
  padding: 12px;\r
}\r
\r
.panel {\r
  background: #111723;\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 16px;\r
  display: grid;\r
  gap: 10px;\r
  padding: 12px;\r
}\r
\r
.panel h2 {\r
  font-size: 16px;\r
  margin: 0;\r
}\r
\r
.form-row {\r
  display: grid;\r
  gap: 6px;\r
}\r
\r
.form-actions {\r
  display: flex;\r
  gap: 8px;\r
  flex-wrap: wrap;\r
}\r
\r
.button {\r
  align-items: center;\r
  background: linear-gradient(180deg, #2d66ff, #1b4ad8);\r
  border: 0;\r
  border-radius: 10px;\r
  color: white;\r
  display: inline-flex;\r
  gap: 8px;\r
  min-height: 36px;\r
  padding: 0 12px;\r
}\r
\r
.button.secondary {\r
  background: #20283a;\r
}\r
\r
.button.ghost {\r
  background: transparent;\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
}\r
\r
.topbar-action {\r
  min-height: 32px;\r
  padding: 0 10px;\r
  white-space: nowrap;\r
}\r
\r
.people {\r
  display: grid;\r
  gap: 8px;\r
}\r
\r
.group {\r
  display: grid;\r
  gap: 6px;\r
}\r
\r
.group h3 {\r
  font-size: 13px;\r
  letter-spacing: 0.04em;\r
  margin: 0;\r
  text-transform: uppercase;\r
}\r
\r
.participant-list {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 6px;\r
}\r
\r
.participant-empty {\r
  color: rgba(255, 255, 255, 0.58);\r
  font-size: 12px;\r
  line-height: 1.35;\r
}\r
\r
.chip {\r
  align-items: center;\r
  background: #1b2334;\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 999px;\r
  color: white;\r
  display: inline-flex;\r
  gap: 8px;\r
  min-height: 30px;\r
  padding: 0 10px;\r
}\r
\r
.participant-chip {\r
  align-items: start;\r
  display: inline-grid;\r
  gap: 4px;\r
  justify-items: start;\r
  width: 225px;\r
  flex: 0 0 225px;\r
  max-width: 100%;\r
  min-height: 42px;\r
  padding: 8px 12px;\r
  text-align: left;\r
}\r
\r
.participant-chip-fighter {\r
  background: rgba(33, 193, 91, 0.18);\r
  border-color: rgba(33, 193, 91, 0.7);\r
}\r
\r
.participant-name {\r
  font-weight: 600;\r
}\r
\r
.participant-meta {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 4px;\r
}\r
\r
.chip[draggable="true"] {\r
  cursor: grab;\r
}\r
\r
.tag {\r
  background: rgba(255, 255, 255, 0.08);\r
  border-radius: 999px;\r
  font-size: 12px;\r
  padding: 2px 8px;\r
}\r
\r
.tag-muted {\r
  color: rgba(255, 255, 255, 0.58);\r
}\r
\r
.skill-picker {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 6px;\r
}\r
\r
.skill-toggle {\r
  align-items: center;\r
  background: rgba(255, 255, 255, 0.04);\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 999px;\r
  display: inline-flex;\r
  gap: 8px;\r
  padding: 6px 10px;\r
}\r
\r
.skill-toggle input {\r
  margin: 0;\r
}\r
\r
.board-shell {\r
  display: grid;\r
  gap: 8px;\r
  min-height: 0;\r
  min-width: 0;\r
  overflow: auto;\r
  padding: 10px;\r
}\r
\r
.grid {\r
  display: grid;\r
  gap: 8px;\r
  align-content: start;\r
  height: 100%;\r
  min-width: max-content;\r
  padding-bottom: 8px;\r
}\r
\r
.grid.compact {\r
  height: auto;\r
}\r
\r
.grid-header,\r
.grid-row {\r
  display: grid;\r
  gap: 8px;\r
  grid-template-columns: 150px repeat(var(--slot-count), minmax(260px, 1fr));\r
}\r
\r
.grid-header {\r
  height: 30px;\r
  align-items: center;\r
  overflow: hidden;\r
}\r
\r
.grid-row {\r
  min-height: 0;\r
  align-items: stretch;\r
}\r
\r
.corner,\r
.slot-header,\r
.arena-header,\r
.cell {\r
  background: #101621;\r
  border: 1px solid rgba(255, 255, 255, 0.1);\r
  border-radius: 16px;\r
}\r
\r
.corner,\r
.slot-header,\r
.arena-header {\r
  min-height: 30px;\r
  padding: 2px 6px;\r
}\r
\r
.corner {\r
  height: 30px;\r
}\r
\r
.slot-header {\r
  align-items: center;\r
  display: flex;\r
  height: 30px;\r
  justify-content: space-between;\r
  gap: 4px;\r
  overflow: hidden;\r
  padding-right: 4px;\r
}\r
\r
.arena-header {\r
  align-items: center;\r
  display: flex;\r
  justify-content: space-between;\r
  font-size: 11px;\r
}\r
\r
.slot-header strong,\r
.arena-header strong {\r
  font-size: 11px;\r
  line-height: 1;\r
  white-space: nowrap;\r
}\r
\r
.slot-header strong {\r
  flex: 1;\r
  text-align: center;\r
}\r
\r
.slot-filter {\r
  align-items: center;\r
  display: inline-flex;\r
  flex: 0 0 auto;\r
  position: relative;\r
}\r
\r
.slot-filter input {\r
  height: 0;\r
  opacity: 0;\r
  position: absolute;\r
  width: 0;\r
}\r
\r
.slot-filter-track {\r
  background: rgba(255, 255, 255, 0.18);\r
  border-radius: 999px;\r
  display: inline-block;\r
  height: 14px;\r
  position: relative;\r
  width: 24px;\r
}\r
\r
.slot-filter-track::after {\r
  background: white;\r
  border-radius: 50%;\r
  content: "";\r
  height: 10px;\r
  left: 2px;\r
  position: absolute;\r
  top: 2px;\r
  transition: transform 120ms ease;\r
  width: 10px;\r
}\r
\r
.slot-filter input:checked + .slot-filter-track {\r
  background: #2d66ff;\r
}\r
\r
.slot-filter input:checked + .slot-filter-track::after {\r
  transform: translateX(10px);\r
}\r
\r
.slot-header.filtered {\r
  border-color: #2d66ff;\r
  background: rgba(45, 102, 255, 0.12);\r
}\r
\r
.cell {\r
  min-height: 0;\r
  padding: 6px;\r
  height: 100%;\r
}\r
\r
.grid.compact .cell {\r
  height: auto;\r
}\r
\r
.cell-empty {\r
  align-items: center;\r
  border: 1px dashed rgba(255, 255, 255, 0.14);\r
  border-radius: 14px;\r
  color: rgba(255, 255, 255, 0.64);\r
  display: flex;\r
  height: 100%;\r
  justify-content: center;\r
  min-height: 0;\r
}\r
\r
.pool-card {\r
  background: linear-gradient(180deg, #151b27, #101621);\r
  border: 1px solid rgba(255, 255, 255, 0.12);\r
  border-radius: 14px;\r
  display: grid;\r
  gap: 6px;\r
  height: 100%;\r
  grid-template-rows: auto minmax(0, 1fr);\r
  min-height: 0;\r
  padding: 8px;\r
}\r
\r
.grid.compact .pool-card {\r
  height: auto;\r
  grid-template-rows: auto auto;\r
}\r
\r
.pool-head {\r
  align-items: start;\r
  display: flex;\r
  justify-content: space-between;\r
  gap: 8px;\r
}\r
\r
.pool-head strong {\r
  display: block;\r
  font-size: 12px;\r
}\r
\r
.pool-officials {\r
  display: grid;\r
  gap: 6px;\r
  grid-template-columns: repeat(3, minmax(0, 1fr));\r
  grid-template-rows: auto minmax(0, 1fr);\r
  height: 100%;\r
  align-items: start;\r
  min-height: 0;\r
}\r
\r
.pool-fighters-only {\r
  display: block;\r
}\r
\r
.role-zone {\r
  background: rgba(255, 255, 255, 0.04);\r
  border: 1px solid rgba(255, 255, 255, 0.12);\r
  border-top-width: 1px;\r
  border-radius: 12px;\r
  display: grid;\r
  gap: 4px;\r
  min-height: 0;\r
  overflow: auto;\r
  padding: 6px;\r
}\r
\r
.role-zone[data-role="JUDGE"],\r
.role-zone[data-role="JURY"],\r
.role-zone[data-role="TABLE"] {\r
  align-self: start;\r
  border-top-width: 1px;\r
  height: fit-content;\r
  min-height: 80px;\r
  max-height: none;\r
}\r
\r
.role-zone[data-role="JUDGE"] {\r
  grid-column: 1;\r
  grid-row: 1;\r
}\r
\r
.role-zone[data-role="JURY"] {\r
  grid-column: 2;\r
  grid-row: 1;\r
}\r
\r
.role-zone[data-role="TABLE"] {\r
  grid-column: 3;\r
  grid-row: 1;\r
}\r
\r
.role-zone[data-role="FIGHTER"] {\r
  grid-column: 1 / -1;\r
  grid-row: 2;\r
  min-height: 160px;\r
}\r
\r
.role-zone.fighters-only {\r
  grid-column: 1 / -1;\r
  grid-row: auto;\r
}\r
\r
.role-zone[data-role="JUDGE"] {\r
  background: rgba(245, 166, 35, 0.18);\r
  border-color: rgba(245, 166, 35, 0.7);\r
}\r
\r
.role-zone[data-role="JURY"] {\r
  background: rgba(124, 92, 255, 0.18);\r
  border-color: rgba(124, 92, 255, 0.7);\r
}\r
\r
.role-zone[data-role="TABLE"] {\r
  background: rgba(33, 193, 91, 0.18);\r
  border-color: rgba(33, 193, 91, 0.7);\r
}\r
\r
.role-zone[data-role="JUDGE"] .role-title {\r
  color: #ffc96b;\r
}\r
\r
.role-zone[data-role="JURY"] .role-title {\r
  color: #beaaff;\r
}\r
\r
.role-zone[data-role="TABLE"] .role-title {\r
  color: #7ef0a4;\r
}\r
\r
.role-zone.drag-over {\r
  border-color: #7da4ff;\r
  background: rgba(45, 102, 255, 0.12);\r
}\r
\r
.role-title {\r
  font-size: 9px;\r
  font-weight: 600;\r
  letter-spacing: 0.1em;\r
  text-transform: uppercase;\r
}\r
\r
.assignment-list {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 3px;\r
}\r
\r
.role-zone[data-role="FIGHTER"] .assignment-list {\r
  flex-direction: column;\r
  flex-wrap: nowrap;\r
}\r
\r
.role-zone[data-role="FIGHTER"] .assignment-chip {\r
  width: 100%;\r
}\r
\r
.grid.compact .role-zone[data-role="FIGHTER"] {\r
  align-self: start;\r
  height: fit-content;\r
}\r
\r
.assignment-chip {\r
  align-items: center;\r
  background: rgba(12, 17, 26, 0.9);\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 999px;\r
  color: inherit;\r
  display: inline-flex;\r
  gap: 5px;\r
  min-height: 24px;\r
  padding: 0 7px;\r
}\r
\r
.assignment-chip button {\r
  background: transparent;\r
  border: 0;\r
  color: rgba(255, 255, 255, 0.72);\r
  padding: 0;\r
}\r
\r
.notice {\r
  background: rgba(45, 102, 255, 0.16);\r
  border: 1px solid rgba(125, 164, 255, 0.3);\r
  border-radius: 12px;\r
  color: #dbe6ff;\r
  padding: 10px 12px;\r
}\r
\r
.notice-toast {\r
  left: 50%;\r
  max-width: min(420px, calc(100vw - 24px));\r
  pointer-events: none;\r
  position: fixed;\r
  top: 12px;\r
  transform: translateX(-50%);\r
  z-index: 900;\r
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28);\r
  animation: notice-pop 1200ms ease-out forwards;\r
}\r
\r
@keyframes notice-pop {\r
  0% {\r
    opacity: 0;\r
    transform: translateX(-50%) translateY(-8px);\r
  }\r
  12% {\r
    opacity: 1;\r
    transform: translateX(-50%) translateY(0);\r
  }\r
  88% {\r
    opacity: 1;\r
    transform: translateX(-50%) translateY(0);\r
  }\r
  100% {\r
    opacity: 0;\r
    transform: translateX(-50%) translateY(-4px);\r
  }\r
}\r
\r
.modal {\r
  align-items: flex-start;\r
  background: rgba(7, 10, 16, 0.72);\r
  inset: 0;\r
  display: flex;\r
  justify-content: center;\r
  overflow: auto;\r
  padding: 14px;\r
  position: fixed;\r
  z-index: 800;\r
}\r
\r
.modal-card {\r
  background: #111723;\r
  border: 1px solid rgba(255, 255, 255, 0.12);\r
  border-radius: 18px;\r
  display: grid;\r
  gap: 12px;\r
  max-width: 520px;\r
  padding: 14px;\r
  width: 100%;\r
}\r
\r
.modal-card-narrow {\r
  max-width: 420px;\r
}\r
\r
.modal-header {\r
  align-items: start;\r
  display: flex;\r
  justify-content: space-between;\r
  gap: 12px;\r
}\r
\r
.modal-header h2 {\r
  font-size: 16px;\r
  margin: 0;\r
}\r
\r
.modal-header .hint {\r
  margin-top: 3px;\r
}\r
\r
.modal-actions {\r
  display: flex;\r
  justify-content: flex-end;\r
}\r
\r
.modal-close {\r
  min-height: 30px;\r
  padding: 0 10px;\r
}\r
`,xe={FIGHTER:`Fighter`,JUDGE:`Ref`,JURY:`Jury`,TABLE:`Table`},Se={JUDGE:`Judge`,JURY:`Jury`,TABLE:`Table`},Ce=[`JUDGE`,`JURY`,`TABLE`],h,we,Te,Ee;function De(e){Ee=e,h=e.state,Te=e.root,we=e.noticeTimer}function Oe(){return{events:[{id:`event-1`,name:`Voorbeeldtoernooi`,ruleset:`Round robin`,participants:[...Array.from({length:20},(e,t)=>({id:`fighter-${String(t+1).padStart(2,`0`)}`,name:`fighter-${String(t+1).padStart(2,`0`)}`,kind:`FIGHTER`,skills:[]})),{id:`official-1`,name:`judge-01`,kind:`OFFICIAL`,skills:[`JUDGE`]},{id:`official-2`,name:`jury-01`,kind:`OFFICIAL`,skills:[`JURY`]},{id:`official-3`,name:`table-01`,kind:`OFFICIAL`,skills:[`TABLE`]}],timeSlots:[{id:`slot-1`,label:`09:00`,order:1}],arenas:[{id:`arena-1`,name:`Arena A`,order:1}],stages:[{id:`stage-1`,name:`Poolfase`,type:`POOL`,ruleset:`Round robin`}],pools:[]},{id:`event-2`,name:`Open training`,ruleset:`Open format`,participants:[],timeSlots:[],arenas:[],stages:[{id:`stage-2`,name:`Vrije opzet`,type:`FINAL`,ruleset:`Open format`}],pools:[]}],selectedEventId:`event-1`,showOfficialRoles:!0,filteredTimeSlotIds:[],activeDialog:void 0,participantName:``,participantKind:`FIGHTER`,participantSkills:[],timeSlotLabel:``,arenaName:``,notice:void 0}}function g(){let e=_(),t=e.stages[0];if(!t)throw Error(`Selected event has no stage.`);let n=[...e.timeSlots].sort((e,t)=>e.order-t.order),r=[...e.arenas].sort((e,t)=>e.order-t.order);Te.innerHTML=`<style>${be}</style>
    <div class="shell">
      <header class="topbar">
        <div class="title">
          <h1>Tournament admin <span class="stage-pill stage-pill-${y(t.type.toLowerCase())}">${y(t.name)}</span></h1>
        </div>
        <div class="topbar-tools">
          <div class="topbar-actions">
            <button class="button secondary topbar-action" type="button" data-action="open-dialog" data-dialog="participant">Add participant</button>
            <button class="button secondary topbar-action" type="button" data-action="open-dialog" data-dialog="timeslot">Add timeslot</button>
            <button class="button secondary topbar-action" type="button" data-action="open-dialog" data-dialog="arena">Add arena</button>
            <label class="header-switch" title="Toon of verberg ref/jury/table">
              <input data-bind="showOfficialRoles" type="checkbox"${h.showOfficialRoles?` checked`:``} />
              <span class="header-switch-track" aria-hidden="true"></span>
              <span class="header-switch-label">Officials</span>
            </label>
          </div>
          <select class="select" data-bind="selectedEventId">
            ${h.events.map(e=>`<option value="${y(e.id)}"${e.id===h.selectedEventId?` selected`:``}>${y(e.name)}</option>`).join(``)}
          </select>
          <span class="tag">${y(e.ruleset)}</span>
          <span class="tag">${y(t.name)} · ${y(t.type)}</span>
        </div>
      </header>

      ${h.notice?`<div class="notice notice-toast" role="status" aria-live="polite">${y(h.notice)}</div>`:``}

      <div class="layout">
        <aside class="sidebar">
          <section class="panel">
            <h2>Deelnemers</h2>
            <div class="people">
              ${Ne(e,e.participants,`FIGHTER`)}
              ${Ne(e,e.participants,`OFFICIAL`)}
            </div>
          </section>
        </aside>

        <main class="board-shell">
          <section
            class="grid${h.showOfficialRoles?``:` compact`}"
            style="--slot-count: ${Math.max(n.length,1)}; grid-template-rows: 30px repeat(${Math.max(r.length,1)}, ${h.showOfficialRoles?`minmax(0, 1fr)`:`auto`});"
          >
            <div class="grid-header">
              <div class="corner" aria-hidden="true"></div>
              ${n.map(e=>Fe(e)).join(``)}
            </div>

            ${r.map(i=>Ie(e,t,r,n,i)).join(``)}
          </section>
        </main>
      </div>
      ${ke()}
    </div>
  `}function ke(){switch(h.activeDialog){case`participant`:return Ae();case`timeslot`:return je();case`arena`:return Me();default:return``}}function Ae(){return`
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="participant-dialog-title">
      <form class="modal-card" data-form-action="add-participant">
        <header class="modal-header">
          <div>
            <h2 id="participant-dialog-title">Add participant</h2>
            <p class="hint">Voeg een fighter of vrijwilliger toe.</p>
          </div>
          <button class="button ghost modal-close" type="button" data-action="close-dialog">Close</button>
        </header>

        <div class="form-row">
          <label>
            <span class="section-label">Name</span>
            <input class="text-input" data-bind="participantName" value="${y(h.participantName)}" placeholder="Naam" autofocus />
          </label>
          <label>
            <span class="section-label">Type</span>
            <select class="select" data-bind="participantKind">
              <option value="FIGHTER"${h.participantKind===`FIGHTER`?` selected`:``}>Fighter</option>
              <option value="OFFICIAL"${h.participantKind===`OFFICIAL`?` selected`:``}>Vrijwilliger</option>
            </select>
          </label>
        </div>

        <div class="form-row">
          <span class="section-label">Skills</span>
          <div class="skill-picker">
            ${Ce.map(e=>`
                  <label class="skill-toggle">
                    <input
                      type="checkbox"
                      data-bind="participantSkill"
                      value="${y(e)}"
                      ${h.participantSkills.includes(e)?`checked`:``}
                    />
                    <span>${y(Se[e])}</span>
                  </label>
                `).join(``)}
          </div>
          <span class="hint">Vrijwilligers kunnen meerdere skills hebben.</span>
        </div>

        <div class="modal-actions">
          <button class="button" type="submit">Add participant</button>
        </div>
      </form>
    </section>
  `}function je(){return`
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="timeslot-dialog-title">
      <form class="modal-card modal-card-narrow" data-form-action="add-timeslot">
        <header class="modal-header">
          <div>
            <h2 id="timeslot-dialog-title">Add timeslot</h2>
            <p class="hint">Voeg een nieuw tijdslot toe.</p>
          </div>
          <button class="button ghost modal-close" type="button" data-action="close-dialog">Close</button>
        </header>

        <div class="form-row">
          <label>
            <span class="section-label">Timeslot label</span>
            <input class="text-input" data-bind="timeSlotLabel" value="${y(h.timeSlotLabel)}" placeholder="Bijv. 09:00" autofocus />
          </label>
        </div>

        <div class="modal-actions">
          <button class="button" type="submit">Add timeslot</button>
        </div>
      </form>
    </section>
  `}function Me(){return`
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="arena-dialog-title">
      <form class="modal-card modal-card-narrow" data-form-action="add-arena">
        <header class="modal-header">
          <div>
            <h2 id="arena-dialog-title">Add arena</h2>
            <p class="hint">Voeg een nieuwe arena toe.</p>
          </div>
          <button class="button ghost modal-close" type="button" data-action="close-dialog">Close</button>
        </header>

        <div class="form-row">
          <label>
            <span class="section-label">Arena name</span>
            <input class="text-input" data-bind="arenaName" value="${y(h.arenaName)}" placeholder="Bijv. Arena A" autofocus />
          </label>
        </div>

        <div class="modal-actions">
          <button class="button" type="submit">Add arena</button>
        </div>
      </form>
    </section>
  `}function Ne(e,t,n){let r=new Set(h.filteredTimeSlotIds),i=t.filter(e=>e.kind===n).filter(t=>!Pe(e,t.id,r)),a=new Set(e.pools.flatMap(e=>e.assignments.filter(e=>e.role===`FIGHTER`).map(e=>e.participantId)));return`
    <div class="group">
      <h3>${n===`FIGHTER`?`Fighters`:`Vrijwilligers`}</h3>
      ${i.length===0?`<div class="participant-empty">Geen ${n===`FIGHTER`?`fighters`:`vrijwilligers`} voor deze filter.</div>`:`<div class="participant-list">
        ${i.sort((e,t)=>e.name.localeCompare(t.name)).map(t=>`
              <button
                class="chip participant-chip${n===`FIGHTER`&&a.has(t.id)?` participant-chip-fighter`:``}"
                draggable="true"
                type="button"
                data-drag-kind="participant"
                data-participant-id="${y(t.id)}"
                title="Sleep naar een pool-rol"
              >
                <span class="participant-name">${y(t.name)}</span>
                <span class="participant-meta">
                  ${n===`FIGHTER`?He(e,t.id):`${Be(t.skills)}${Ve(e,t.id)}`}
                </span>
              </button>
            `).join(``)}
      </div>`}
    </div>
  `}function Pe(e,t,n){return n.size!==0&&e.pools.some(e=>n.has(e.timeSlotId)&&e.assignments.some(e=>e.participantId===t))}function Fe(e){let t=h.filteredTimeSlotIds.includes(e.id);return`
    <div class="slot-header${t?` filtered`:``}">
      <strong>${y(e.label)}</strong>
      <label class="slot-filter" title="Toon alleen niet-ingeplande deelnemers voor ${y(e.label)}">
        <input
          type="checkbox"
          data-bind="participantTimeSlotFilter"
          value="${y(e.id)}"
          ${t?`checked`:``}
        />
        <span class="slot-filter-track" aria-hidden="true"></span>
      </label>
    </div>
  `}function Ie(e,t,n,r,i){return`
    <div class="grid-row">
      <div class="arena-header">
        <div>
          <strong>${y(i.name)}</strong>
          <div class="hint">Arena ${i.order}</div>
        </div>
      </div>
      ${r.map(n=>Le(e,t,i,n)).join(``)}
    </div>
  `}function Le(e,t,n,r){let i=e.pools.find(e=>e.arenaId===n.id&&e.timeSlotId===r.id&&e.stageId===t.id);if(!i)return`
      <div class="cell">
        <div class="cell-empty">
          <button
            class="button"
            type="button"
            data-action="create-pool"
            data-arena-id="${y(n.id)}"
            data-timeslot-id="${y(r.id)}"
          >
            Pool toevoegen
          </button>
        </div>
      </div>
    `;let a=new Map(e.participants.map(e=>[e.id,e]));return`
    <div class="cell">
      <article class="pool-card">
        <div class="pool-head">
          <div>
            <strong>${y(i.name)}</strong>
            <div class="hint">${y(r.label)} · ${y(n.name)}</div>
          </div>
          <button class="button ghost" type="button" data-action="delete-pool" data-pool-id="${y(i.id)}">Verwijder</button>
        </div>
        ${h.showOfficialRoles?`<div class="pool-officials">
                ${Re(i,a,`JUDGE`)}
                ${Re(i,a,`JURY`)}
                ${Re(i,a,`TABLE`)}
                ${Re(i,a,`FIGHTER`)}
              </div>`:`<div class="pool-fighters-only">
                ${Re(i,a,`FIGHTER`,!0)}
              </div>`}
      </article>
    </div>
  `}function Re(e,t,n,r=!1){let i=e.assignments.filter(e=>e.role===n);return`
    <section
      class="role-zone${r?` fighters-only`:``}"
      data-drop-zone="pool-role"
      data-pool-id="${y(e.id)}"
      data-role="${y(n)}"
    >
      <div class="role-title">${xe[n]}</div>
      <div class="assignment-list">
        ${i.map(e=>ze(e,t)).join(``)}
      </div>
    </section>
  `}function ze(e,t){let n=t.get(e.participantId);return n?`
    <div class="assignment-chip">
      <span>${y(n.name)}</span>
      <button type="button" data-action="delete-assignment" data-assignment-id="${y(e.id)}">×</button>
    </div>
  `:``}function Be(e){return e.length===0?`<span class="tag tag-muted">geen skill</span>`:e.map(e=>`<span class="tag">${y(Se[e])}</span>`).join(``)}function Ve(e,t){let n=Ue(e,t);return n.length===0?`<span class="tag tag-muted">vrij</span>`:n.sort((e,t)=>e.sortKey.localeCompare(t.sortKey)).map(e=>`
        <span class="tag">
          ${y(e.poolName)} · ${y(e.slotLabel)} · ${y(e.arenaName)} · ${y(xe[e.role])}
        </span>
      `).join(``)}function He(e,t){let n=Ue(e,t).sort((e,t)=>e.sortKey.localeCompare(t.sortKey));if(n.length===0)return`<span class="tag tag-muted">niet ingedeeld</span>`;let r=n[0];return r?`<span class="tag">${y(r.poolName)} · ${y(r.slotLabel)} · ${y(r.arenaName)}</span>`:`<span class="tag tag-muted">niet ingedeeld</span>`}function Ue(e,t){let n=new Map(e.timeSlots.map(e=>[e.id,e])),r=new Map(e.arenas.map(e=>[e.id,e]));return e.pools.flatMap(e=>{let i=n.get(e.timeSlotId),a=r.get(e.arenaId);return!i||!a?[]:e.assignments.filter(e=>e.participantId===t).map(t=>({poolName:e.name,slotLabel:i.label,arenaName:a.name,role:t.role,sortKey:`${i.order}-${a.order}-${e.name}-${t.role}`}))})}function We(e){let t=e.target?.closest(`[data-action]`);if(t)switch(t.dataset.action){case`open-dialog`:$e(t.dataset.dialog);break;case`close-dialog`:et();break;case`create-pool`:it(t.dataset.arenaId,t.dataset.timeslotId);break;case`delete-pool`:at(t.dataset.poolId);break;case`delete-assignment`:ot(t.dataset.assignmentId)}}function Ge(e){let t=e.target;if(!t)return;let n=t.dataset.formAction;if(n)switch(e.preventDefault(),n){case`add-participant`:tt(!0);break;case`add-timeslot`:nt(!0);break;case`add-arena`:rt(!0)}}function Ke(e){let t=e.target;if(!(!t||!(`dataset`in t))){if(t.dataset.bind===`selectedEventId`){h.selectedEventId=t.value,h.filteredTimeSlotIds=[],g();return}if(t.dataset.bind===`showOfficialRoles`){h.showOfficialRoles=t.checked,g();return}if(t.dataset.bind===`participantTimeSlotFilter`){let e=t,n=e.value;h.filteredTimeSlotIds=e.checked?h.filteredTimeSlotIds.includes(n)?h.filteredTimeSlotIds:[...h.filteredTimeSlotIds,n]:h.filteredTimeSlotIds.filter(e=>e!==n),g();return}if(t.dataset.bind===`participantSkill`){let e=t,n=e.value;e.checked?h.participantSkills=h.participantSkills.includes(n)?h.participantSkills:[...h.participantSkills,n]:h.participantSkills=h.participantSkills.filter(e=>e!==n),g()}}}function qe(e){let t=e.target;if(!(!t||!(`dataset`in t)))switch(t.dataset.bind){case`participantName`:h.participantName=t.value;break;case`participantKind`:h.participantKind=t.value===`OFFICIAL`?`OFFICIAL`:`FIGHTER`;break;case`timeSlotLabel`:h.timeSlotLabel=t.value;break;case`arenaName`:h.arenaName=t.value}}function Je(e){let t=Ze(e.target);t&&(e.dataTransfer?.setData(`text/plain`,t.dataset.participantId??``),e.dataTransfer?.setData(`application/x-participant-kind`,ct(t.dataset.participantId??``)))}function Ye(e){let t=Qe(e.target);t&&(e.preventDefault(),t.classList.add(`drag-over`))}function Xe(e){let t=Qe(e.target);if(!t)return;e.preventDefault(),t.classList.remove(`drag-over`);let n=e.dataTransfer?.getData(`text/plain`);if(!n)return;let r=t.dataset.poolId,i=t.dataset.role;!r||!i||st(r,n,i)}function Ze(e){return e instanceof Element?e.closest(`[data-drag-kind='participant']`):null}function Qe(e){return e instanceof Element?e.closest(`[data-drop-zone='pool-role']`):null}function $e(e){e&&(h.activeDialog=e,g())}function et(){h.activeDialog=void 0,g()}function tt(e=!1){let t=_(),n=h.participantName.trim();return n?(t.participants.push({id:`participant-${crypto.randomUUID()}`,name:n,kind:h.participantKind,skills:[...h.participantSkills]}),h.participantName=``,h.participantSkills=[],e&&(h.activeDialog=void 0),v(`${n} toegevoegd.`),!0):(v(`Geef eerst een naam op.`),!1)}function nt(e=!1){let t=_(),n=h.timeSlotLabel.trim();return n?(t.timeSlots.push({id:`slot-${crypto.randomUUID()}`,label:n,order:t.timeSlots.length+1}),h.timeSlotLabel=``,e&&(h.activeDialog=void 0),v(`Tijdslot ${n} toegevoegd.`),!0):(v(`Geef eerst een tijdslotnaam op.`),!1)}function rt(e=!1){let t=_(),n=h.arenaName.trim();return n?(t.arenas.push({id:`arena-${crypto.randomUUID()}`,name:n,order:t.arenas.length+1}),h.arenaName=``,e&&(h.activeDialog=void 0),v(`Arena ${n} toegevoegd.`),!0):(v(`Geef eerst een arenanaam op.`),!1)}function it(e,t){if(!e||!t)return;let n=_(),r=n.stages[0];if(!r){v(`Dit event heeft nog geen stage.`);return}if(n.pools.find(n=>n.stageId===r.id&&n.arenaId===e&&n.timeSlotId===t)){v(`In deze cel staat al een pool.`);return}let i=n.pools.filter(e=>e.stageId===r.id).length+1;n.pools.push({id:`pool-${crypto.randomUUID()}`,name:`Pool ${i}`,eventId:n.id,stageId:r.id,timeSlotId:t,arenaId:e,assignments:[]}),v(`Pool ${i} aangemaakt.`),g()}function at(e){if(!e)return;let t=_();t.pools=t.pools.filter(t=>t.id!==e),v(`Pool verwijderd.`),g()}function ot(e){if(!e)return;let t=_();for(let n of t.pools){let t=n.assignments.filter(t=>t.id!==e);if(t.length!==n.assignments.length){n.assignments=t,v(`Toewijzing verwijderd.`),g();return}}}function st(e,t,n){let r=_(),i=r.participants.find(e=>e.id===t);if(!i){v(`Onbekende deelnemer.`);return}let a=r.pools.find(t=>t.id===e);if(!a){v(`Onbekende pool.`);return}if(r.pools.some(e=>e.timeSlotId===a.timeSlotId&&e.assignments.some(e=>e.participantId===t))){v(`${i.name} is al ingepland in dit tijdslot.`);return}if(n===`FIGHTER`&&r.pools.some(e=>e.assignments.some(e=>e.participantId===t&&e.role===`FIGHTER`))){v(`${i.name} staat al ergens als Fighter.`);return}a.assignments.push({id:`assignment-${crypto.randomUUID()}`,participantId:t,role:n}),v(`${i.name} toegewezen aan ${xe[n]}.`),g()}function _(){let e=h.events.find(e=>e.id===h.selectedEventId);if(!e)throw Error(`Selected event not found.`);return e}function ct(e){return _().participants.find(t=>t.id===e)?.kind??`FIGHTER`}function v(e){h.notice=e,g();let t=Ee;t&&(we!==void 0&&window.clearTimeout(we),we=window.setTimeout(()=>{De(t),h.notice=void 0,we=void 0,t.noticeTimer=void 0,g()},1200),t.noticeTimer=we)}function y(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}var lt=class extends n{#e;connectedCallback(){this.#e={state:Oe(),root:this.root,noticeTimer:void 0},this.registerEvent(this.root,`click`,e=>this.#t(()=>We(e))),this.registerEvent(this.root,`change`,e=>this.#t(()=>Ke(e))),this.registerEvent(this.root,`input`,e=>this.#t(()=>qe(e))),this.registerEvent(this.root,`submit`,e=>this.#t(()=>Ge(e))),this.registerEvent(this.root,`dragstart`,e=>this.#t(()=>Je(e))),this.registerEvent(this.root,`dragover`,e=>this.#t(()=>Ye(e))),this.registerEvent(this.root,`drop`,e=>this.#t(()=>Xe(e))),this.#t(g)}disconnectedCallback(){let e=this.#e;e?.noticeTimer!==void 0&&(window.clearTimeout(e.noticeTimer),e.noticeTimer=void 0),Ee===e&&(Ee=void 0),super.disconnectedCallback()}#t(e){let t=this.#e;t&&(De(t),e(),t.noticeTimer=we)}};customElements.get(`stage-view`)||customElements.define(`stage-view`,lt);var ut=`:host {
  display: block;
  height: 100%;
}

.event-view {
  box-sizing: border-box;
  height: 100%;
}

.field-inline {
  display: flex;
  gap: 8px;
  align-items: start;
}

.field-inline .text-input {
  flex: 1 1 auto;
}
`,dt=`<div class="event-view">
  <slot></slot>
</div>
`,ft=`:host {
  display: contents;
}

.event-editor-view {
  display: contents;
}
`,pt=`<div class="event-editor-view">
  <slot></slot>
</div>
`,mt=class extends n{connectedCallback(){this.render(ft,pt)}disconnectedCallback(){super.disconnectedCallback()}};customElements.get(`event-editor-view`)||customElements.define(`event-editor-view`,mt);var ht=`:host {\r
  display: block;\r
}\r
\r
.ruleset-view {\r
  box-sizing: border-box;\r
  display: grid;\r
  gap: 12px;\r
}\r
\r
.ruleset-header {\r
  align-items: start;\r
  display: flex;\r
  gap: 12px;\r
  justify-content: space-between;\r
}\r
\r
.ruleset-header h2 {\r
  font-size: 16px;\r
  margin: 4px 0 0;\r
}\r
\r
.ruleset-header p,\r
.editor-note,\r
.ruleset-card-subtitle,\r
.error-banner,\r
.empty-state {\r
  color: rgba(255, 255, 255, 0.68);\r
}\r
\r
.ruleset-header p,\r
.editor-note {\r
  margin: 4px 0 0;\r
}\r
\r
.ruleset-actions,\r
.modal-actions,\r
.card-actions,\r
.ruleset-meta {\r
  display: flex;\r
  gap: 8px;\r
  justify-content: flex-end;\r
  flex-wrap: wrap;\r
}\r
\r
.ruleset-list {\r
  display: grid;\r
  gap: 8px;\r
}\r
\r
.ruleset-card {\r
  background: #101621;\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 14px;\r
  color: inherit;\r
  display: grid;\r
  gap: 8px;\r
  padding: 12px;\r
  text-align: left;\r
}\r
\r
.ruleset-card.is-active {\r
  border-color: #2d66ff;\r
  background: rgba(45, 102, 255, 0.12);\r
}\r
\r
.ruleset-card-header {\r
  align-items: start;\r
  display: flex;\r
  justify-content: space-between;\r
  gap: 12px;\r
}\r
\r
.ruleset-card-title {\r
  font-size: 16px;\r
  font-weight: 700;\r
}\r
\r
.ruleset-card-subtitle {\r
  font-size: 12px;\r
  margin-top: 4px;\r
}\r
\r
.badge-row {\r
  display: flex;\r
  gap: 8px;\r
  flex-wrap: wrap;\r
}\r
\r
.badge {\r
  align-items: center;\r
  background: #20283a;\r
  border-radius: 999px;\r
  color: white;\r
  display: inline-flex;\r
  font-size: 12px;\r
  min-height: 24px;\r
  padding: 0 10px;\r
}\r
\r
.badge.badge-muted {\r
  color: rgba(255, 255, 255, 0.78);\r
}\r
\r
.button {\r
  align-items: center;\r
  background: linear-gradient(180deg, #2d66ff, #1b4ad8);\r
  border: 0;\r
  border-radius: 10px;\r
  color: white;\r
  display: inline-flex;\r
  justify-content: center;\r
  min-height: 36px;\r
  padding: 0 12px;\r
}\r
\r
.button.secondary {\r
  background: #20283a;\r
}\r
\r
.button.secondary:hover {\r
  background: #28324a;\r
}\r
\r
.icon-button {\r
  font-size: 18px;\r
  font-weight: 700;\r
  min-width: 36px;\r
  padding: 0;\r
}\r
\r
.text-input {\r
  background: #0f1623;\r
  border: 1px solid rgba(255, 255, 255, 0.1);\r
  border-radius: 10px;\r
  color: inherit;\r
  min-height: 36px;\r
  padding: 0 12px;\r
}\r
\r
.text-input::placeholder {\r
  color: rgba(255, 255, 255, 0.38);\r
}\r
\r
.ruleset-form {\r
  display: grid;\r
  gap: 12px;\r
}\r
\r
.field {\r
  display: grid;\r
  gap: 6px;\r
}\r
\r
.field span {\r
  color: rgba(255, 255, 255, 0.72);\r
  font-size: 12px;\r
}\r
\r
.field-grid {\r
  display: grid;\r
  gap: 12px;\r
  grid-template-columns: repeat(2, minmax(0, 1fr));\r
}\r
\r
.field-group {\r
  background: rgba(255, 255, 255, 0.02);\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 14px;\r
  display: grid;\r
  gap: 12px;\r
  padding: 12px;\r
}\r
\r
.field-group-header h3 {\r
  font-size: 14px;\r
  margin: 0;\r
}\r
\r
.field-group-header p {\r
  color: rgba(255, 255, 255, 0.6);\r
  font-size: 12px;\r
  margin: 4px 0 0;\r
}\r
\r
.checkbox-field {\r
  align-items: center;\r
  display: flex;\r
  gap: 12px;\r
  justify-content: space-between;\r
}\r
\r
.checkbox-field input {\r
  accent-color: #2d66ff;\r
}\r
\r
.penalty-list {\r
  display: grid;\r
  gap: 10px;\r
}\r
\r
.penalty-row {\r
  display: grid;\r
  gap: 12px;\r
  grid-template-columns: minmax(0, 2fr) minmax(0, 1.4fr) minmax(180px, auto) auto;\r
  align-items: end;\r
}\r
\r
.penalty-row-actions {\r
  display: flex;\r
  justify-content: flex-end;\r
}\r
\r
.penalty-empty {\r
  margin: 0;\r
}\r
\r
.empty-state,\r
.error-banner {\r
  background: #101621;\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 14px;\r
  padding: 12px;\r
}\r
\r
.error-banner {\r
  border-color: rgba(229, 72, 77, 0.5);\r
  color: #ffb6b9;\r
}\r
\r
.modal-backdrop {\r
  align-items: center;\r
  background: rgba(4, 8, 15, 0.72);\r
  display: flex;\r
  inset: 0;\r
  justify-content: center;\r
  padding: 20px;\r
  position: fixed;\r
  z-index: 10;\r
}\r
\r
.modal-card {\r
  background: #111723;\r
  border: 1px solid rgba(255, 255, 255, 0.14);\r
  border-radius: 18px;\r
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);\r
  display: grid;\r
  gap: 16px;\r
  max-height: calc(100vh - 40px);\r
  max-width: 960px;\r
  overflow: auto;\r
  padding: 18px;\r
  width: 100%;\r
}\r
\r
.modal-header {\r
  align-items: start;\r
  display: flex;\r
  gap: 12px;\r
  justify-content: space-between;\r
}\r
\r
.modal-header h2 {\r
  font-size: 20px;\r
  margin: 4px 0 0;\r
}\r
\r
@media (max-width: 960px) {\r
  .field-grid {\r
    grid-template-columns: 1fr;\r
  }\r
\r
  .penalty-row {\r
    grid-template-columns: 1fr;\r
  }\r
}\r
`,gt=`/api/v1`;function _t(e=gt){return{listUsers:()=>b(e,`/users`),createUser:t=>b(e,`/users`,{method:`POST`,body:t}),updateUser:(t,n)=>b(e,`/users/${t}`,{method:`PATCH`,body:n}),createSkill:t=>b(e,`/skills`,{method:`POST`,body:t}),updateSkill:(t,n)=>b(e,`/skills/${t}`,{method:`PATCH`,body:n}),deleteSkill:t=>b(e,`/skills/${t}`,{method:`DELETE`}),listEvents:()=>b(e,`/events`),getEvent:t=>b(e,`/events/${t}`),createEvent:t=>b(e,`/events`,{method:`POST`,body:t}),updateEvent:(t,n)=>b(e,`/events/${t}`,{method:`PATCH`,body:n}),deleteEvent:t=>b(e,`/events/${t}`,{method:`DELETE`}),listRulesets:t=>b(e,`/events/${t}/rulesets`),getRuleset:t=>b(e,`/rulesets/${t}`),createRuleset:(t,n)=>b(e,`/events/${t}/rulesets`,{method:`POST`,body:n}),updateRuleset:(t,n)=>b(e,`/rulesets/${t}`,{method:`PATCH`,body:n}),getEventSchedule:t=>b(e,`/events/${t}/schedule`),updateEventSchedule:(t,n)=>b(e,`/events/${t}/schedule`,{method:`PATCH`,body:n}),createScheduleTimeSlot:(t,n)=>b(e,`/events/${t}/schedule/slots`,{method:`POST`,body:n}),updateScheduleTimeSlot:(t,n)=>b(e,`/schedule-time-slots/${t}`,{method:`PATCH`,body:n}),deleteScheduleTimeSlot:t=>b(e,`/schedule-time-slots/${t}`,{method:`DELETE`}),createScheduledPhase:t=>b(e,`/scheduled-phases`,{method:`POST`,body:t}),updateScheduledPhase:(t,n)=>b(e,`/scheduled-phases/${t}`,{method:`PATCH`,body:n}),deleteScheduledPhase:t=>b(e,`/scheduled-phases/${t}`,{method:`DELETE`}),createScheduledAssignment:(t,n)=>b(e,`/scheduled-phases/${t}/assignments`,{method:`POST`,body:n}),deleteScheduledAssignment:t=>b(e,`/scheduled-assignments/${t}`,{method:`DELETE`}),createTournament:t=>b(e,`/tournaments`,{method:`POST`,body:t}),updateTournament:(t,n)=>b(e,`/tournaments/${t}`,{method:`PATCH`,body:n}),listTournaments:()=>b(e,`/tournaments`),getTournament:t=>b(e,`/tournaments/${t}`),deleteTournament:t=>b(e,`/tournaments/${t}`,{method:`DELETE`}),createArena:t=>b(e,`/arenas`,{method:`POST`,body:t}),updateArena:(t,n)=>b(e,`/arenas/${t}`,{method:`PATCH`,body:n}),listArenas:()=>b(e,`/arenas`),deleteArena:t=>b(e,`/arenas/${t}`,{method:`DELETE`}),createEntry:t=>b(e,`/entries`,{method:`POST`,body:t}),updateEntry:(t,n)=>b(e,`/entries/${t}`,{method:`PATCH`,body:n}),listEntries:()=>b(e,`/entries`),deleteEntry:t=>b(e,`/entries/${t}`,{method:`DELETE`}),createStage:t=>b(e,`/stages`,{method:`POST`,body:t}),updateStage:(t,n)=>b(e,`/stages/${t}`,{method:`PATCH`,body:n}),listStages:()=>b(e,`/stages`),deleteStage:t=>b(e,`/stages/${t}`,{method:`DELETE`}),createStageArena:(t,n)=>b(e,`/stages/${t}/arenas`,{method:`POST`,body:n}),deleteStageArena:(t,n)=>b(e,`/stages/${t}/arenas/${n}`,{method:`DELETE`}),createStageOfficial:(t,n)=>b(e,`/stages/${t}/officials`,{method:`POST`,body:n}),deleteStageOfficial:t=>b(e,`/stage-officials/${t}`,{method:`DELETE`}),listRounds:()=>b(e,`/rounds`),listMatches:()=>b(e,`/matches`),completeMatch:(t,n)=>b(e,`/matches/${t}/complete`,{method:`POST`,body:n})}}async function b(e,t,n){let r={method:n?.method??`GET`,headers:{Accept:`application/json`,...n?.body===void 0?{}:{"Content-Type":`application/json`}}};n?.body!==void 0&&(r.body=JSON.stringify(n.body));let i=await fetch(vt(e,t),r);if(!i.ok)throw Error(await yt(i));if(i.status!==204)return await i.json()}function vt(e,t){return`${e.replace(/\/$/,``)}${t.startsWith(`/`)?t:`/${t}`}`}async function yt(e){let t=`Request failed with status ${e.status}.`;if((e.headers.get(`content-type`)??``).includes(`application/json`)){let n=await e.json();return n?.error?n.error:t}let n=await e.text();return n.trim().length>0?n:t}var bt=()=>({name:``,definition:Tt(St())}),xt=()=>({description:``,penalties:``,disqualify:!1}),St=()=>({weaponClass:``,matchParameters:{maxDurationSeconds:180,stopOnTimeOut:!0,maxPointsCap:10,pointSpreadVictory:5,scores:[1,2,3,4],maxDoubles:3,allowAfterBlow:!0,countDoubles:!0,useNetScore:!0,penalties:[]}}),Ct=class extends n{#e=_t();#t=``;#n=!1;#r=``;#i=[];#a;#o=bt();connectedCallback(){this.#t=this.getAttribute(`event-id`)??``,this.renderRulesetView(),this.registerEvent(this.root,`click`,e=>this.handleClick(e)),this.registerEvent(this.root,`submit`,e=>{e.preventDefault(),this.handleSubmit(e)}),this.load()}disconnectedCallback(){super.disconnectedCallback()}async load(){if(!this.#t){this.#r=`No event is selected for this ruleset view.`,this.renderRulesetView();return}this.#n=!0,this.#r=``,this.renderRulesetView();try{this.#i=(await this.#e.listRulesets(this.#t)).sort(Ft),this.pruneEditorSelection()}catch(e){this.#r=e instanceof Error?e.message:`Rulesets could not be loaded.`}finally{this.#n=!1,this.renderRulesetView()}}handleClick(e){let t=e.composedPath()[0],n=t instanceof Element?t.closest(`[data-action]`):null;if(!n){t instanceof Element&&t.classList.contains(`modal-backdrop`)&&this.closeEditor();return}let r=n.closest(`[data-action="ruleset-editor"]`);switch(n.dataset.action){case`refresh`:this.load();return;case`new-ruleset`:this.openNewRuleset();return;case`edit-ruleset`:n.dataset.id&&this.openRuleset(n.dataset.id);return;case`duplicate-ruleset`:n.dataset.id?this.openRulesetCopy(n.dataset.id):this.openNewRuleset();return;case`add-penalty`:this.addPenalty(r);return;case`remove-penalty`:n.dataset.index!==void 0&&this.removePenalty(Number(n.dataset.index),r);return;case`close-editor`:this.closeEditor();return;default:return}}async handleSubmit(e){if(!(e.target instanceof HTMLFormElement)||!this.#t||!this.#a)return;let t=this.editorRuleset;if(!(this.#a.mode===`edit`&&t?.locked))try{let n=new FormData(e.target);this.#o=Dt(n,this.#o.definition.matchParameters.penalties.length);let r=Et(this.#o.definition),i={name:kt(x(n,`name`),`Ruleset name`),definition:r};this.#a.mode===`edit`&&t?await this.#e.updateRuleset(t.id,i):await this.#e.createRuleset(this.#t,{...i,...this.#a.baseRulesetId?{baseRulesetId:this.#a.baseRulesetId}:{}}),this.#a=void 0,this.#o=bt(),this.dispatchRulesetChanged(),await this.load()}catch(e){this.#r=e instanceof Error?e.message:`The ruleset could not be saved.`,this.renderRulesetView()}}openNewRuleset(){this.#a={mode:`create`},this.#o=bt(),this.renderRulesetView()}openRuleset(e){let t=this.#i.find(t=>t.id===e);t&&(this.#a={mode:`edit`,rulesetId:t.id},this.#o=wt(t),this.renderRulesetView())}openRulesetCopy(e){let t=this.#i.find(t=>t.id===e);t&&(this.#a={mode:`create`,baseRulesetId:t.id},this.#o=wt(t),this.renderRulesetView())}closeEditor(){this.#a=void 0,this.#o=bt(),this.renderRulesetView()}pruneEditorSelection(){!this.#a||this.#a.mode!==`edit`||!this.#a.rulesetId||this.#i.find(e=>e.id===this.#a?.rulesetId)||this.closeEditor()}addPenalty(e){e&&(this.#o=Dt(new FormData(e),this.#o.definition.matchParameters.penalties.length)),this.#o={...this.#o,definition:{...this.#o.definition,matchParameters:{...this.#o.definition.matchParameters,penalties:[...this.#o.definition.matchParameters.penalties,xt()]}}},this.renderRulesetView()}removePenalty(e,t){t&&(this.#o=Dt(new FormData(t),this.#o.definition.matchParameters.penalties.length));let n=this.#o.definition.matchParameters.penalties.filter((t,n)=>n!==e);this.#o={...this.#o,definition:{...this.#o.definition,matchParameters:{...this.#o.definition.matchParameters,penalties:n}}},this.renderRulesetView()}get editorRuleset(){if(this.#a){if(this.#a.mode===`edit`&&this.#a.rulesetId)return this.#i.find(e=>e.id===this.#a?.rulesetId);if(this.#a.mode===`create`&&this.#a.baseRulesetId)return this.#i.find(e=>e.id===this.#a?.baseRulesetId)}}renderRulesetView(){this.render(ht,this.renderView())}renderView(){return`
      <section class="ruleset-view">
        <header class="ruleset-header">
          <div>
            <h2>Rulesets</h2>
            <p>Create, edit, and version rulesets for this event.</p>
          </div>
          <div class="ruleset-actions">
            <button type="button" class="button icon-button" data-action="new-ruleset" title="New ruleset" aria-label="New ruleset">+</button>
            <button type="button" class="button secondary" data-action="refresh">Refresh</button>
          </div>
        </header>

        ${this.#r?`<div class="error-banner">${S(this.#r)}</div>`:``}
        ${this.#n?`<div class="empty-state">Rulesets are loading...</div>`:``}
        ${!this.#n&&this.#i.length===0?`<div class="empty-state">No rulesets yet. Use + to create the first one.</div>`:``}

        ${!this.#n&&this.#i.length>0?`
            <div class="ruleset-list">
              ${this.#i.map(e=>this.renderRulesetCard(e)).join(``)}
            </div>
          `:``}

        ${this.renderEditor()}
      </section>
    `}renderRulesetCard(e){let t=!!(this.#a&&this.#a.mode===`edit`&&this.#a.rulesetId===e.id),n=e.definition??St();return`
      <article class="ruleset-card${t?` is-active`:``}" data-action="edit-ruleset" data-id="${S(e.id)}">
        <div class="ruleset-card-header">
          <div>
            <div class="ruleset-card-title">${S(this.rulesetTitle(e))}</div>
            <div class="ruleset-card-subtitle">${S(n.weaponClass||`No weapon class`)}</div>
          </div>
          <div class="card-actions">
            <button type="button" class="button secondary icon-button" data-action="edit-ruleset" data-id="${S(e.id)}" title="Edit ${S(e.name)}" aria-label="Edit ${S(e.name)}">&#9998;</button>
          </div>
        </div>
        <div class="badge-row">
          <span class="badge badge-muted">Version ${e.version}</span>
          <span class="badge badge-muted">Matches ${e.matchCount}</span>
          <span class="badge badge-muted">${n.matchParameters.penalties.length} penalty rules</span>
          <span class="badge badge-muted">${e.locked?`Locked`:`Editable`}</span>
        </div>
      </article>
    `}renderEditor(){if(!this.#a)return``;let e=this.editorRuleset,t=this.#a.mode===`edit`&&!!e,n=!!(e?.locked&&t);return`
      <event-editor-view>
        <section class="modal-backdrop" role="presentation">
          <div class="modal-card ruleset-modal-card" role="dialog" aria-modal="true" aria-labelledby="ruleset-editor-title">
            <header class="modal-header">
              <div>
                <div class="eyebrow">Ruleset management</div>
                <h2 id="ruleset-editor-title">${this.#a.mode===`create`?this.#a.baseRulesetId?`New version of ${S(this.rulesetLabel(e)??`ruleset`)}`:`Create ruleset`:`Edit ruleset`}</h2>
                <p class="editor-note">${S(this.#a.mode===`create`?this.#a.baseRulesetId?`Change the name or definition and save it as a new version.`:`Create a new ruleset for this event.`:n?`This version is already used in a match and cannot be changed.`:`Update the ruleset definition and save your changes.`)}</p>
              </div>
              <div class="modal-actions">
                ${this.#a.mode===`edit`&&n?`<button type="button" class="button secondary" data-action="duplicate-ruleset" data-id="${S(e?.id??``)}">Create new version</button>`:``}
                <button type="button" class="button secondary" data-action="close-editor">Close</button>
              </div>
            </header>

            <form class="ruleset-form" data-action="ruleset-editor">
              ${this.#a.baseRulesetId?`<input type="hidden" name="baseRulesetId" value="${S(this.#a.baseRulesetId)}" />`:``}

              <div class="field-grid">
                <label class="field">
                  <span>Name</span>
                  <input class="text-input" name="name" type="text" value="${S(this.#o.name)}" required ${n?`disabled`:``} />
                </label>

                <label class="field">
                  <span>Weapon class</span>
                  <input class="text-input" name="weaponClass" type="text" value="${S(this.#o.definition.weaponClass)}" required ${n?`disabled`:``} />
                </label>
              </div>

              <section class="field-group">
                <div class="field-group-header">
                  <div>
                    <h3>Match parameters</h3>
                    <p>These values are stored in JSON.</p>
                  </div>
                </div>

                <div class="field-grid">
                  <label class="field">
                    <span>Maximum duration (seconds)</span>
                    <input class="text-input" name="maxDurationSeconds" type="number" min="0" step="1" value="${S(this.#o.definition.matchParameters.maxDurationSeconds)}" ${n?`disabled`:``} />
                  </label>

                  <label class="field">
                    <span>Maximum points cap</span>
                    <input class="text-input" name="maxPointsCap" type="number" min="0" step="1" value="${S(this.#o.definition.matchParameters.maxPointsCap)}" ${n?`disabled`:``} />
                  </label>

                  <label class="field">
                    <span>Point spread victory</span>
                    <input class="text-input" name="pointSpreadVictory" type="number" min="0" step="1" value="${S(this.#o.definition.matchParameters.pointSpreadVictory)}" ${n?`disabled`:``} />
                  </label>

                  <label class="field">
                    <span>Max doubles</span>
                    <input class="text-input" name="maxDoubles" type="number" min="0" step="1" value="${S(this.#o.definition.matchParameters.maxDoubles)}" ${n?`disabled`:``} />
                  </label>

                  <label class="field">
                    <span>Scores</span>
                    <input class="text-input" name="scores" type="text" value="${S(this.#o.definition.matchParameters.scores)}" placeholder="1, 2, 3, 4" ${n?`disabled`:``} />
                  </label>

                  <label class="field checkbox-field">
                    <span>Stop on timeout</span>
                    <input type="checkbox" name="stopOnTimeOut" ${this.#o.definition.matchParameters.stopOnTimeOut?`checked`:``} ${n?`disabled`:``} />
                  </label>

                  <label class="field checkbox-field">
                    <span>Allow after blow</span>
                    <input type="checkbox" name="allowAfterBlow" ${this.#o.definition.matchParameters.allowAfterBlow?`checked`:``} ${n?`disabled`:``} />
                  </label>

                  <label class="field checkbox-field">
                    <span>Count doubles</span>
                    <input type="checkbox" name="countDoubles" ${this.#o.definition.matchParameters.countDoubles?`checked`:``} ${n?`disabled`:``} />
                  </label>

                  <label class="field checkbox-field">
                    <span>Use net score</span>
                    <input type="checkbox" name="useNetScore" ${this.#o.definition.matchParameters.useNetScore?`checked`:``} ${n?`disabled`:``} />
                  </label>
                </div>
              </section>

              <section class="field-group">
                <div class="field-group-header">
                  <div>
                    <h3>Penalty rules</h3>
                    <p>Add as many penalty rules as needed.</p>
                  </div>
                </div>

                <div class="penalty-list">
                  ${this.#o.definition.matchParameters.penalties.length>0?this.#o.definition.matchParameters.penalties.map((e,t)=>this.renderPenaltyRow(e,t,n)).join(``):`<div class="empty-state penalty-empty">No penalty rules yet.</div>`}
                </div>

                <div class="field-actions">
                  <button type="button" class="button secondary" data-action="add-penalty" ${n?`disabled`:``}>+ Add penalty</button>
                </div>
              </section>

              <div class="modal-actions">
                <button type="submit" class="button" ${n?`disabled`:``}>
                  ${this.#a.mode===`create`?`Create ruleset`:`Save changes`}
                </button>
                <button type="button" class="button secondary" data-action="close-editor">Close</button>
              </div>

              ${e?`
                  <div class="ruleset-meta">
                    <span class="badge">Version ${e.version}</span>
                    <span class="badge badge-muted">${e.locked?`Locked`:`Editable`}</span>
                    <span class="badge badge-muted">${e.matchCount} matches</span>
                  </div>
                `:``}
            </form>
          </div>
        </section>
      </event-editor-view>
    `}renderPenaltyRow(e,t,n){return`
      <article class="penalty-row">
        <label class="field">
          <span>Description</span>
          <input class="text-input" name="${Mt(t)}" type="text" value="${S(e.description)}" required ${n?`disabled`:``} />
        </label>

        <label class="field">
          <span>Penalty values</span>
          <input class="text-input" name="${Nt(t)}" type="text" value="${S(e.penalties)}" placeholder="0, 1, 2" ${n?`disabled`:``} />
        </label>

        <label class="field checkbox-field">
          <span>Disqualifies fighter</span>
          <input type="checkbox" name="${Pt(t)}" ${e.disqualify?`checked`:``} ${n?`disabled`:``} />
        </label>

        <div class="penalty-row-actions">
          <button type="button" class="button secondary icon-button" data-action="remove-penalty" data-index="${t}" title="Remove penalty" aria-label="Remove penalty" ${n?`disabled`:``}>−</button>
        </div>
      </article>
    `}rulesetTitle(e){return`${e.name} v${e.version}`}rulesetLabel(e){return e?this.rulesetTitle(e):void 0}dispatchRulesetChanged(){this.dispatchEvent(new CustomEvent(`rulesets-changed`,{bubbles:!0,composed:!0}))}};function wt(e){return{name:e.name,definition:Tt(e.definition??St())}}function Tt(e){return{weaponClass:e.weaponClass,matchParameters:{maxDurationSeconds:String(e.matchParameters.maxDurationSeconds),stopOnTimeOut:e.matchParameters.stopOnTimeOut,maxPointsCap:String(e.matchParameters.maxPointsCap),pointSpreadVictory:String(e.matchParameters.pointSpreadVictory),scores:e.matchParameters.scores.join(`, `),maxDoubles:String(e.matchParameters.maxDoubles),allowAfterBlow:e.matchParameters.allowAfterBlow,countDoubles:e.matchParameters.countDoubles,useNetScore:e.matchParameters.useNetScore,penalties:e.matchParameters.penalties.map(e=>({description:e.description,penalties:e.penalties.join(`, `),disqualify:e.disqualify}))}}}function Et(e){return{weaponClass:kt(e.weaponClass,`Weapon class`),matchParameters:{maxDurationSeconds:At(e.matchParameters.maxDurationSeconds,`Maximum duration`),stopOnTimeOut:e.matchParameters.stopOnTimeOut,maxPointsCap:At(e.matchParameters.maxPointsCap,`Maximum points cap`),pointSpreadVictory:At(e.matchParameters.pointSpreadVictory,`Point spread victory`),scores:jt(e.matchParameters.scores,`Scores`),maxDoubles:At(e.matchParameters.maxDoubles,`Max doubles`),allowAfterBlow:e.matchParameters.allowAfterBlow,countDoubles:e.matchParameters.countDoubles,useNetScore:e.matchParameters.useNetScore,penalties:e.matchParameters.penalties.map((e,t)=>({description:kt(e.description,`Penalty ${t+1} description`),penalties:jt(e.penalties,`Penalty ${t+1} values`),disqualify:e.disqualify}))}}}function Dt(e,t){return{name:x(e,`name`),definition:{weaponClass:x(e,`weaponClass`),matchParameters:{maxDurationSeconds:x(e,`maxDurationSeconds`),stopOnTimeOut:Ot(e,`stopOnTimeOut`),maxPointsCap:x(e,`maxPointsCap`),pointSpreadVictory:x(e,`pointSpreadVictory`),scores:x(e,`scores`),maxDoubles:x(e,`maxDoubles`),allowAfterBlow:Ot(e,`allowAfterBlow`),countDoubles:Ot(e,`countDoubles`),useNetScore:Ot(e,`useNetScore`),penalties:Array.from({length:t},(t,n)=>({description:x(e,Mt(n)),penalties:x(e,Nt(n)),disqualify:Ot(e,Pt(n))}))}}}}function x(e,t){let n=e.get(t);return typeof n==`string`?n.trim():``}function Ot(e,t){return e.get(t)!==null}function kt(e,t){let n=e.trim();if(n.length===0)throw Error(`${t} is required.`);return n}function At(e,t){let n=e.trim();if(n.length===0)throw Error(`${t} is required.`);let r=Number(n);if(!Number.isInteger(r)||r<0)throw Error(`${t} must be a non-negative integer.`);return r}function jt(e,t){let n=e.trim();return n.length===0?[]:n.split(`,`).map(e=>{let n=e.trim();if(n.length===0)throw Error(`${t} must not contain empty values.`);let r=Number(n);if(!Number.isInteger(r)||r<0)throw Error(`${t} must contain non-negative integers.`);return r})}function Mt(e){return`penalty-description-${e}`}function Nt(e){return`penalty-values-${e}`}function Pt(e){return`penalty-disqualify-${e}`}function S(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`)}function Ft(e,t){let n=e.name.localeCompare(t.name);return n===0?t.version-e.version:n}customElements.get(`ruleset-view`)||customElements.define(`ruleset-view`,Ct);var It=`:host {
  display: block;
  color-scheme: dark;
}

.pool-results-container {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.pool-results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.pool-results-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #f8fafc;
}

.pool-filter-select {
  padding: 0.45rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background-color: #0f172a;
  color: #f8fafc;
  font-size: 0.875rem;
}

.pool-card {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.96));
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 0.8rem;
  box-shadow: 0 12px 40px rgba(2, 6, 23, 0.35);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.pool-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  padding-bottom: 0.75rem;
  gap: 0.75rem;
}

.pool-card-title {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0;
  color: #f8fafc;
}

.pool-card-subtitle {
  font-size: 0.85rem;
  color: #94a3b8;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.7rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
}

.status-success {
  background-color: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
}

.status-warning {
  background-color: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.status-muted {
  background-color: rgba(148, 163, 184, 0.15);
  color: #cbd5e1;
}

.pool-ranking-rules {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.7rem;
  padding: 0.85rem 0.95rem;
}

.pool-ranking-title {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #cbd5e1;
  margin-bottom: 0.5rem;
}

.pool-ranking-list {
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.35rem;
  color: #e2e8f0;
  font-size: 0.9rem;
}

.table-wrapper {
  overflow-x: auto;
}

.standings-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  text-align: left;
}

.standings-table th {
  background-color: rgba(15, 23, 42, 0.85);
  color: #cbd5e1;
  font-weight: 600;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.standings-table td {
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  color: #e2e8f0;
}

.standings-table tr.winner-row {
  background-color: rgba(16, 185, 129, 0.12);
  font-weight: 600;
}

.rank-cell {
  font-weight: 600;
  width: 2.5rem;
  text-align: center;
  color: #cbd5e1;
}

.rank-1 {
  color: #34d399;
}

.net-positive {
  color: #34d399;
  font-weight: 600;
}

.net-negative {
  color: #f87171;
}

.matches-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.matches-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #cbd5e1;
  margin: 0;
}

.matches-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}

.match-item {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  background-color: rgba(15, 23, 42, 0.75);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  color: #e2e8f0;
}

.match-item.finished {
  background-color: rgba(30, 41, 59, 0.95);
  border-color: rgba(148, 163, 184, 0.26);
}

.match-fighters {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.match-fighter {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
}

.match-fighter.winner {
  font-weight: 700;
  color: #6ee7b7;
}

.match-score {
  font-weight: 600;
  font-family: monospace;
  font-size: 0.95rem;
  background: rgba(2, 6, 23, 0.95);
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  border: 1px solid rgba(148, 163, 184, 0.24);
  color: #f8fafc;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: #94a3b8;
}
`,Lt=[{title:`Primary ranking`,description:`Match points (Win = 3, Draw = 1, Loss = 0)`},{title:`Tie breaker 1`,description:`Head-to-head result between tied fighters`},{title:`Tie breaker 2`,description:`Net score (Hits given - Hits received)`},{title:`Tie breaker 3`,description:`Total hits given (Most points scored)`},{title:`Tie breaker 4`,description:`Total hits received (Fewest points conceded)`},{title:`Tie breaker 5`,description:`Deciding tie-breaker exchange or coin toss if all metrics remain equal`}];function C(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}var Rt=class extends n{#e;#t;#n;#r=`ALL`;get event(){return this.#e}set event(e){this.#e=e,this.#i()}get stage(){return this.#t}set stage(e){this.#t=e,this.#i()}get tournament(){return this.#n}set tournament(e){this.#n=e,this.#i()}setData(e,t,n){this.#e=e,this.#t=t,this.#n=n,this.#i()}connectedCallback(){this.registerEvent(this.root,`change`,e=>{let t=e.target;t?.classList.contains(`pool-filter-select`)&&(this.#r=t.value,this.#i())}),this.#i()}#i(){let e=this.#a(),t=this.#f(e);this.render(It,t)}#a(){if(!this.#t)return[];let e=(this.#n??this.#e?.tournaments.find(e=>e.id===this.#t?.tournamentId))?.entries??[],t=new Map(e.map(e=>[e.id,e])),n=this.#t.rounds.flatMap(e=>e.matches);return this.#o().map(e=>{let r=n.filter(t=>e.arenaId===null?t.arenaId===null:t.arenaId===e.arenaId),i=new Set;for(let e of r)e.entryAId&&i.add(e.entryAId),e.entryBId&&i.add(e.entryBId);let a=[...i].map(e=>t.get(e)).filter(e=>!!e);return this.#s(e.id,e.name,e.arenaName,e.timeSlotLabel,a,r,t)})}#o(){let e=this.#t?.arenas??[];if(e.length>0){let t=[],n=new Set;for(let r of e){let e=r.arenaId??null;if(!e||n.has(e))continue;n.add(e);let i=r.arena??this.#e?.arenas.find(t=>t.id===e);t.push({id:`arena-${e}`,name:`Pool ${t.length+1}${i?.name?` · ${i.name}`:``}`,arenaName:i?.name??`Onbekende arena`,timeSlotLabel:`-`,arenaId:e})}if(t.length>0)return t}let t=this.#t?.rounds.flatMap(e=>e.matches)??[],n=new Map;for(let e of t){let t=e.arenaId??`default`,r=n.get(t)??[];r.push(e),n.set(t,r)}return[...n.entries()].map(([e,t],n)=>{let r=this.#e?.arenas.find(t=>t.id===e)?.name??(e==="default"?`Standaard arena`:`Arena ${n+1}`);return{id:`arena-${e}`,name:`Pool ${n+1}${r?` · ${r}`:``}`,arenaName:r,timeSlotLabel:`-`,arenaId:e==="default"?null:e}})}#s(e,t,n,r,i,a,o){let s=new Map;for(let e of i)s.set(e.id,{entry:e,matchesPlayed:0,wins:0,losses:0,ties:0,pointsScored:0,pointsConceded:0,matchPoints:0,directResults:new Map});let c=[],l=0;for(let e of a){let t=e.entryAId?o.get(e.entryAId):void 0,n=e.entryBId?o.get(e.entryBId):void 0,r=t?.user.username??`Onbekend`,i=n?.user.username??`Onbekend`,a=e.winnerEntryId!==null||e.scoreA!==null&&e.scoreB!==null;if(a){l+=1;let t=e.scoreA??0,n=e.scoreB??0;if(e.entryAId&&s.has(e.entryAId)){let r=s.get(e.entryAId);r.matchesPlayed+=1,r.pointsScored+=t,r.pointsConceded+=n;let i=this.#c(e,e.entryAId,t,n);r.matchPoints+=this.#l(i),r.directResults.set(e.entryBId??``,i),i===`win`?r.wins+=1:i===`loss`?r.losses+=1:r.ties+=1}if(e.entryBId&&s.has(e.entryBId)){let r=s.get(e.entryBId);r.matchesPlayed+=1,r.pointsScored+=n,r.pointsConceded+=t;let i=this.#c(e,e.entryBId,t,n);r.matchPoints+=this.#l(i),r.directResults.set(e.entryAId??``,i),i===`win`?r.wins+=1:i===`loss`?r.losses+=1:r.ties+=1}}c.push({id:e.id,entryAId:e.entryAId,entryBId:e.entryBId,entryAName:r,entryBName:i,scoreA:e.scoreA,scoreB:e.scoreB,winnerEntryId:e.winnerEntryId,isFinished:a})}let u=a.length,d=l===u&&u>0;return{id:e,name:t,arenaName:n,timeSlotLabel:r,fighters:i,matches:c,standings:[...s.values()].map(e=>({rank:0,entryId:e.entry.id,username:e.entry.user.username,seed:e.entry.seed,matchesPlayed:e.matchesPlayed,wins:e.wins,losses:e.losses,ties:e.ties,pointsScored:e.pointsScored,pointsConceded:e.pointsConceded,netPoints:e.pointsScored-e.pointsConceded,matchPoints:e.matchPoints,directResults:e.directResults})).sort((e,t)=>this.#u(e,t)).map((e,t)=>({...e,rank:t+1})).map(e=>{let{matchPoints:t,directResults:n,...r}=e;return r}),totalMatches:u,completedMatches:l,isFinished:d}}#c(e,t,n,r){return e.winnerEntryId===t?`win`:e.winnerEntryId===null?n===r?`draw`:t===e.entryAId?n>r?`win`:`loss`:r>n?`win`:`loss`:`loss`}#l(e){switch(e){case`win`:return 3;case`draw`:return 1;default:return 0}}#u(e,t){if(e.matchPoints!==t.matchPoints)return t.matchPoints-e.matchPoints;let n=this.#d(e,t);return n===0?e.netPoints===t.netPoints?e.pointsScored===t.pointsScored?e.pointsConceded===t.pointsConceded?(e.seed??999)-(t.seed??999):e.pointsConceded-t.pointsConceded:t.pointsScored-e.pointsScored:t.netPoints-e.netPoints:n}#d(e,t){let n=e.directResults.get(t.entryId),r=t.directResults.get(e.entryId);return!n||!r?0:n===`win`&&r===`loss`?-1:+(n===`loss`&&r===`win`)}#f(e){if(!this.#t)return`<div class="empty-state">Geen stage geselecteerd.</div>`;if(e.length===0)return`<div class="empty-state">Nog geen pools aanwezig in deze stage.</div>`;let t=this.#r===`ALL`?e:e.filter(e=>e.id===this.#r);return`
      <div class="pool-results-container">
        <header class="pool-results-header">
          <h3 class="pool-results-title">Pool Uitslagen & Standen</h3>
          ${e.length>1?`<select class="pool-filter-select">
                  <option value="ALL"${this.#r===`ALL`?` selected`:``}>Alle pools (${e.length})</option>
                  ${e.map(e=>`<option value="${C(e.id)}"${e.id===this.#r?` selected`:``}>${C(e.name)} (${e.isFinished?`Afgerond`:`${e.completedMatches}/${e.totalMatches}`})</option>`).join(``)}
                </select>`:``}
        </header>

        ${t.map(e=>this.#p(e)).join(``)}
      </div>
    `}#p(e){let t=e.isFinished?`<span class="status-badge status-success">✓ Pool Completed (${e.completedMatches}/${e.totalMatches})</span>`:e.completedMatches>0?`<span class="status-badge status-warning">⏳ In Progress (${e.completedMatches}/${e.totalMatches})</span>`:`<span class="status-badge status-muted">⚪ Not Started (0/${e.totalMatches})</span>`;return`
      <article class="pool-card">
        <div class="pool-card-header">
          <div>
            <h4 class="pool-card-title">${C(e.name)}</h4>
            <div class="pool-card-subtitle">Arena: ${C(e.arenaName)} ${e.timeSlotLabel===`-`?``:`· Timeslot: ${C(e.timeSlotLabel)}`}</div>
          </div>
          <div>${t}</div>
        </div>

        <div class="pool-ranking-rules">
          <div class="pool-ranking-title">Winner Determination</div>
          <ol class="pool-ranking-list">
            ${Lt.map(e=>`<li><strong>${C(e.title)}:</strong> ${C(e.description)}</li>`).join(``)}
          </ol>
        </div>

        <div class="table-wrapper">
          <table class="standings-table">
            <thead>
              <tr>
                <th class="rank-cell">#</th>
                <th>Fighter</th>
                <th title="Matches Played">Matches Played</th>
                <th title="Wins">Wins</th>
                <th title="Losses">Losses</th>
                <th title="Draws">Draws</th>
                <th title="Points For (Hits Scored)">Points For</th>
                <th title="Points Against (Hits Conceded)">Points Against</th>
                <th title="Net Score">Net Score</th>
              </tr>
            </thead>
            <tbody>
              ${e.standings.map(t=>this.#m(t,e.isFinished)).join(``)}
            </tbody>
          </table>
        </div>

        ${e.matches.length>0?`<div class="matches-section">
                <div class="matches-title">Matches</div>
                <div class="matches-grid">
                  ${e.matches.map(e=>this.#h(e)).join(``)}
                </div>
              </div>`:``}
      </article>
    `}#m(e,t){let n=t&&e.rank===1,r=e.netPoints>0?`net-positive`:e.netPoints<0?`net-negative`:``,i=e.netPoints>0?`+${e.netPoints}`:`${e.netPoints}`;return`
      <tr class="${n?`winner-row`:``}">
        <td class="rank-cell rank-${e.rank}">${e.rank}</td>
        <td><strong>${C(e.username)}</strong> ${n?`👑`:``}</td>
        <td>${e.matchesPlayed}</td>
        <td>${e.wins}</td>
        <td>${e.losses}</td>
        <td>${e.ties}</td>
        <td>${e.pointsScored}</td>
        <td>${e.pointsConceded}</td>
        <td class="${r}">${i}</td>
      </tr>
    `}#h(e){let t=e.winnerEntryId===e.entryAId||e.scoreA!==null&&e.scoreB!==null&&e.scoreA>e.scoreB,n=e.winnerEntryId===e.entryBId||e.scoreA!==null&&e.scoreB!==null&&e.scoreB>e.scoreA,r=e.isFinished?`${e.scoreA??0} - ${e.scoreB??0}`:`v.s.`;return`
      <div class="match-item ${e.isFinished?`finished`:``}">
        <div class="match-fighters">
          <span class="match-fighter ${t?`winner`:``}">${C(e.entryAName)}</span>
          <span class="match-fighter ${n?`winner`:``}">${C(e.entryBName)}</span>
        </div>
        <div class="match-score">${r}</div>
      </div>
    `}};customElements.get(`pool-results`)||customElements.define(`pool-results`,Rt);function zt(){let e=T.querySelector(`.workspace`),t=T.querySelector(`.modal-card`);if(!(!e&&!t))return{workspaceTop:e?.scrollTop??0,modalTop:t?.scrollTop??0}}function Bt(e){let t=T.querySelector(`.workspace`);t&&(t.scrollTop=e.workspaceTop);let n=T.querySelector(`.modal-card`);n&&(n.scrollTop=e.modalTop)}var w=_t(),T,Vt,Ht=`#21c15b`,Ut=`#2f7dfa`,E={loading:!0,error:null,events:[],selectedEventId:null,selectedTournamentId:null,selectedStageId:null,editor:void 0,volunteerView:void 0,eventTab:`tournaments`,tournamentTab:`stages`,stageTab:`overview`,poolResultsFullscreen:!1};function Wt(e){T=e,Vt=void 0,T.addEventListener(`click`,Kt),T.addEventListener(`change`,qt),T.addEventListener(`submit`,Jt),T.addEventListener(`rulesets-changed`,Yt),D()}function Gt(e){e.removeEventListener(`click`,Kt),e.removeEventListener(`change`,qt),e.removeEventListener(`submit`,Jt),e.removeEventListener(`rulesets-changed`,Yt)}async function D(){E.loading=!0,O();try{E.events=await w.listEvents(),E.events.length===0&&(E.editor={kind:`event`},E.selectedEventId=null),E.error=null}catch(e){E.error=F(e)}finally{E.loading=!1,O()}}function Kt(e){let t=e.composedPath()[0],n=t instanceof Element?t.closest(`[data-action]`):null;if(n)switch(n.dataset.action){case`refresh`:E.loading=!0,E.error=null,D();return;case`select-event`:Mn(n.dataset.id);return;case`new-event`:Nn({kind:`event`});return;case`open-editor`:Nn({kind:n.dataset.editor,...n.dataset.id?{id:n.dataset.id}:{},...n.dataset.entryKind?{entryKind:n.dataset.entryKind}:{}});return;case`toggle-entry-mode`:Rn();return;case`open-volunteer-view`:Fn(n.dataset.scope===`tournament`?`tournament`:`event`);return;case`open-rulesets`:In();return;case`close-volunteer-view`:Ln();return;case`close-editor`:Pn();return;case`delete-entry`:zn(n.dataset.id);return;case`delete-event`:Bn(n.dataset.id);return;case`delete-tournament`:case`delete-arena`:case`delete-stage`:Vn(n.dataset.action,n.dataset.id);return;case`select-tournament`:Hn(n.dataset.id);return;case`select-stage`:Un(n.dataset.id);return;case`set-event-tab`:Gn(n.dataset.tab);return;case`set-tournament-tab`:Kn(n.dataset.tab);return;case`set-stage-tab`:qn(n.dataset.tab);return;case`set-current-stage`:Wn(n.dataset.stageId);return;case`advance-stage`:Wn(n.dataset.nextStageId);return;case`open-pool-results-fullscreen`:E.poolResultsFullscreen=!0,O();return;case`close-pool-results-fullscreen`:E.poolResultsFullscreen=!1,O();return;default:return}}function qt(e){let t=e.composedPath()[0];if(!(t instanceof Element))return;let n=t.closest(`[data-action="volunteer-update"]`);if(n){Yn(n);return}let r=t.closest(`[data-action="editor"]`);r&&t instanceof HTMLSelectElement&&t.name===`type`&&r.querySelector(`input[name="editorKind"]`)?.value===`stage`&&E.editor?.kind===`stage`&&(E.editor={...E.editor,stageType:t.value},O())}function Jt(e){let t=e.composedPath()[0],n=t instanceof HTMLFormElement?t:null;!n||n.dataset.action!==`editor`&&n.dataset.action!==`volunteer-update`||(e.preventDefault(),n.dataset.action===`editor`?Jn(n):Yn(n))}function Yt(){D()}function O(){if(Vt===void 0&&(Vt=zt()),E.loading){T.innerHTML=Zt();return}if(E.error){T.innerHTML=en(E.error);return}T.innerHTML=tn(),Xt(),Vt&&=(Bt(Vt),void 0)}function Xt(){let e=j(),t=e?M(e):void 0,n=N(t);for(let r of T.querySelectorAll(`pool-results`))e&&n&&r.setData?.(e,n,t)}function Zt(){return`
    <main class="app-shell">
      <section class="empty-state">
        <div class="badge badge-muted">Laden</div>
        <h1>Event admin wordt geladen</h1>
        <p class="loading-note">We halen de events op uit de bestaande backend.</p>
      </section>
    </main>
  `}function Qt(e,t,n){let r=e.rulesets;return`
    <select class="text-input" name="rulesetId" ${r.length===0?`disabled`:``}>
      <option value="" ${t===``?`selected`:``}>${R(n)}</option>
      ${r.map(e=>`
        <option value="${R(e.id)}" ${e.id===t?`selected`:``}>
          ${R(Ar(e))}
        </option>
      `).join(``)}
    </select>
  `}function $t(e,t,n){return e?`
    <div class="field-inline">
      ${Qt(e,t,n)}
      <button type="button" class="button secondary icon-button" data-action="open-rulesets" title="Nieuwe ruleset" aria-label="Nieuwe ruleset">+</button>
    </div>
  `:`<div class="empty-card">Maak eerst een event aan om rulesets te kiezen.</div>`}function en(e){return`
    <main class="app-shell">
      <section class="empty-state error-state">
        <div class="badge badge-danger">Fout</div>
        <h1>Kan de backend niet lezen</h1>
        <p>${R(e)}</p>
        <button type="button" class="button" data-action="refresh">Opnieuw proberen</button>
      </section>
    </main>
  `}function tn(){let e=j(),t=e?M(e):void 0,n=N(t),r=yr(t),i=e?xr(e):null,a=e&&t?Sr(e,t):null;return`
    <main class="app-shell">
      <header class="topbar">
        <div class="topbar-copy">
          <div class="eyebrow">HEMA Event Admin</div>
          <h1>${R(e?e.eventName:`Nog geen events`)}</h1>
          <p class="topbar-breadcrumb">
            ${e?R(e.eventName):`Maak het eerste event aan`}
            ${e&&t?` / ${R(t.name)}`:``}
            ${e&&n?` / ${R(P(n))}`:``}
          </p>
        </div>
        <div class="topbar-actions">
          ${e?`<div class="badge">${R(r?`Actieve fase: ${P(r)}`:`Geen actieve fase`)}</div>`:``}
          <div class="badge">${R(i?i.ruleset:`Geen ruleset`)}</div>
          <div class="badge badge-muted">${i?`${i.tournaments} toernooien`:`0 toernooien`}</div>
          <div class="badge badge-muted">${i?`${i.arenas} arenas`:`0 arenas`}</div>
          <button type="button" class="button secondary" data-action="refresh">Verversen</button>
        </div>
      </header>

      <section class="workspace">
        <article class="panel">
          <header class="panel-header">
            <div>
              <div class="eyebrow">Events</div>
              <h2>Overzicht</h2>
            </div>
            <div class="panel-actions">
              <div class="panel-meta">${E.events.length} events</div>
              <button type="button" class="button icon-button" data-action="new-event" title="New event" aria-label="New event">+</button>
            </div>
          </header>
          <div class="panel-body">
            ${nn(e)}
          </div>
        </article>

        <article class="panel">
          <header class="panel-header">
            <div>
              <div class="eyebrow">Event</div>
              <h2>${R(e?e.eventName:`Geen events`)}</h2>
              <p class="panel-meta">${e?`Beheer de onderdelen van dit event.`:`Maak een event aan in het overzicht.`}</p>
            </div>
            ${e?`<div class="panel-actions">${ln()}</div>`:``}
          </header>
          ${jn(`event`,E.eventTab,[{value:`tournaments`,label:`Toernooien`},{value:`arenas`,label:`Arenas`},{value:`officials`,label:`Vrijwilligers`},{value:`rulesets`,label:`Rulesets`}])} 
          <div class="panel-body">
            ${e?cn(e):k(`Maak eerst een event aan.`)}
          </div>
        </article>

        <article class="panel">
          <header class="panel-header">
            <div>
              <div class="eyebrow">Toernooi</div>
              <h2>${t?R(t.name):`Geen toernooi geselecteerd`}</h2>
            </div>
            <div class="panel-actions">
              <div class="panel-meta">${a?`${a.entries} inschrijvingen`:`Geen data`}</div>
              ${e&&t?un():``}
            </div>
          </header>
          ${jn(`tournament`,E.tournamentTab,[{value:`entries`,label:`Deelnemers`},{value:`officials`,label:`Vrijwilligers`},{value:`stages`,label:`Stages`}])}
          <div class="panel-body">
            ${e&&t?pn(e,t):k(`Selecteer een toernooi.`)}
          </div>
        </article>

      </section>
      ${an()}
      ${on()}
      ${gn()}
    </main>
  `}function nn(e){if(E.events.length===0)return k(`Nog geen events aangemaakt.`);let t=e?.id??E.events[0]?.id;return`
    <div class="list">
      ${E.events.map(e=>{let n=xr(e);return`
            <div
                class="info-card list-item ${e.id===t?`is-active`:``}"
                data-action="select-event"
                data-id="${R(e.id)}"
              >
                <span class="list-title">${R(e.eventName)}</span>
                <span class="list-meta">${R(n.ruleset)}</span>
                <span class="list-stats">${n.tournaments} toernooien · ${n.arenas} arenas</span>
              ${rn(e)}
            </div>
          `}).join(``)}
    </div>
  `}function rn(e){let t=R(e.eventName);return`
    <div class="card-actions">
      <a class="button secondary icon-button" data-route href="/planning?eventId=${encodeURIComponent(e.id)}" title="Planning" aria-label="Planning">&#128339;</a>
      <button type="button" class="button secondary icon-button" data-action="open-editor" data-editor="event" data-id="${R(e.id)}" title="Bewerk ${t}" aria-label="Bewerk ${t}">&#9998;</button>
      <button type="button" class="button secondary icon-button danger-button" data-action="delete-event" data-id="${R(e.id)}" title="Verwijder ${t}" aria-label="Verwijder ${t}">&#128465;</button>
    </div>
  `}function an(){let e=E.editor;if(!e)return``;let t=j(),n=t?M(t):void 0,r=N(n),i=!!e.id,a=e.kind===`entry`&&!i&&e.entryMode===`bulk`,o=e.kind===`entry`?`${a?`Bulk import`:i?`Edit`:`New`} ${dr(e.kind,e.entryKind)}`:`${i?`Bewerk`:`Nieuw`} ${dr(e.kind,e.entryKind)}`,s=sn(e,t,n,r);return`
    <event-editor-view>
      <section class="modal-backdrop" role="presentation">
        <form class="modal-card" data-action="editor" aria-modal="true" aria-labelledby="editor-title">
        <header class="modal-header">
          <div>
            <div class="eyebrow">Event admin</div>
            <h2 id="editor-title">${R(o)}</h2>
          </div>
          <button type="button" class="button secondary" data-action="close-editor">Sluiten</button>
        </header>
        <input type="hidden" name="editorKind" value="${R(e.kind)}" />
        ${e.id?`<input type="hidden" name="id" value="${R(e.id)}" />`:``}
        ${e.entryKind?`<input type="hidden" name="entryKind" value="${R(e.entryKind)}" />`:``}
        ${e.kind===`entry`&&!e.id?`<input type="hidden" name="entryMode" value="${R(e.entryMode??`single`)}" />`:``}
        <div class="editor-form">${s}</div>
        <div class="modal-actions">
          ${e.kind===`entry`&&!i?`<button type="button" class="button secondary" data-action="toggle-entry-mode" aria-pressed="${a}">${a?`Enkel`:`Bulk`}</button>`:``}
          <button type="submit" class="button">${e.kind===`entry`?a?`Bulk importeren`:i?`Save changes`:`Create ${dr(e.kind,e.entryKind)}`:i?`Wijzigingen opslaan`:`${dr(e.kind,e.entryKind)} aanmaken`}</button>
          <button type="button" class="button secondary" data-action="close-editor">Sluiten</button>
        </div>
        </form>
      </section>
    </event-editor-view>
  `}function on(){let e=E.volunteerView;if(!e)return``;let t=E.events.find(t=>t.id===e.eventId)??j();if(!t)return``;let n=e.scope===`tournament`?t.tournaments.find(t=>t.id===e.tournamentId):void 0,r=fr(t,n);return`
    <event-editor-view>
      <section class="modal-backdrop" role="presentation">
        <div class="modal-card volunteer-modal-card" role="dialog" aria-modal="true" aria-labelledby="volunteer-view-title">
          <header class="modal-header">
            <div>
              <div class="eyebrow">Vrijwilligersoverzicht</div>
              <h2 id="volunteer-view-title">${e.scope===`tournament`?`Vrijwilligers · ${R(n?.name??`Toernooi`)}`:`Vrijwilligers · ${R(t.eventName)}`}</h2>
              <p class="editor-note">${e.scope===`tournament`?`Vrijwilligers in ${R(n?.name??`dit toernooi`)}`:`Vrijwilligers in ${R(t.eventName)}`}</p>
            </div>
            <button type="button" class="button secondary" data-action="close-volunteer-view">Sluiten</button>
          </header>
          <div class="volunteer-view-body">
            ${r.length>0?`<div class="volunteer-view-grid">
                  ${r.map(e=>pr(e)).join(``)}
                </div>`:k(`Geen vrijwilligers gevonden voor deze selectie.`)}
          </div>
        </div>
      </section>
    </event-editor-view>
  `}function sn(e,t,n,r){let i=n?.id??t?.tournaments[0]?.id??``;switch(e.kind){case`event`:{let n=E.events.find(t=>t.id===e.id);return Zn([[`eventName`,`Event naam`,n?.eventName??``,`Bijv. HEMA Open 2026`,!0]])+`
        <label class="field">
          <span>Ruleset</span>
          ${$t(t,n?.ruleset?.id??``,`Geen ruleset`)}
        </label>
        <label class="checkbox-field">
          <input name="allFightersAreVolunteers" type="checkbox" ${n?.allFightersAreVolunteers?`checked`:``} />
          <span>All fighters are volunteers</span>
        </label>
      `}case`tournament`:{let n=t?.tournaments.find(t=>t.id===e.id);return Zn([[`name`,`Naam`,n?.name??``,`Bijv. Heren staal`,!0],[`order`,`Volgorde`,String(n?.order??t?.tournaments.length??0),``,!0,`number`]])+`
        <label class="field">
          <span>Ruleset</span>
          ${$t(t,n?.ruleset?.id??t?.ruleset?.id??``,`Erft van event`)}
        </label>
      `}case`arena`:{let n=t?.arenas.find(t=>t.id===e.id);return Zn([[`name`,`Naam`,n?.name??``,`Bijv. Arena 1`,!0],[`order`,`Volgorde`,String(n?.order??t?.arenas.length??0),``,!0,`number`],[`leftColor`,`Linker kleur`,n?.leftColor??Ht,``,!0,`color`],[`rightColor`,`Rechter kleur`,n?.rightColor??Ut,``,!0,`color`]])}case`entry`:{let n=hr(t,e.id),r=n?.kind??e.entryKind??`FIGHTER`;if(!n){let n=e.entryMode===`bulk`;return`
          <input type="hidden" name="entryKind" value="${R(r)}" />
          ${n?Qn(`usernames`,`Namen`,``,`Een naam per regel`,!0,6):Zn([[`username`,`Name`,``,`For example, Jane Doe`,!0]])}
          ${er(ir(),[],`entry-new`)}
          ${r===`FIGHTER`&&!t?.allFightersAreVolunteers?`<label class="checkbox-field"><input name="alsoVolunteer" type="checkbox" /> <span>Also Volunteer</span></label>`:``}
        `}return`
        ${Zn([[`username`,`Name`,n.user.username,`For example, Jane Doe`,!0]])}
        ${er(n.user,n.user.skills??[],`entry-${n.id}`)}
        ${$n(t,n.tournamentId??i)}
        <label class="field">
          <span>Entry type</span>
          <select class="text-input" name="entryKind">
            <option value="FIGHTER" ${r===`FIGHTER`?`selected`:``}>Fighter</option>
            <option value="VOLUNTEER" ${r===`VOLUNTEER`?`selected`:``}>Volunteer</option>
            <option value="BOTH" ${r===`BOTH`?`selected`:``}>Fighter and Volunteer</option>
          </select>
        </label>
        <label class="field">
          <span>Seed</span>
          <input class="text-input" name="seed" type="number" min="0" step="1" value="${n.seed??``}" placeholder="Optional" />
        </label>
      `}case`stage`:{let r=n?.stages.find(t=>t.id===e.id),i=e.stageType??r?.type??`POOL`;return`
        <label class="field"><span>Type</span><select class="text-input" name="type">
          <option value="POOL" ${i===`POOL`?`selected`:``}>POOL</option>
          <option value="ELIMINATION" ${i===`ELIMINATION`?`selected`:``}>ELIMINATION</option>
          <option value="SEMI_FINAL" ${i===`SEMI_FINAL`?`selected`:``}>SEMI_FINAL</option>
          <option value="FINAL" ${i===`FINAL`?`selected`:``}>FINAL</option>
        </select></label>
        ${Zn([[`name`,`Naam`,r?.name??``,`Optioneel`,!1]])}
        <label class="field">
          <span>Ruleset</span>
          ${$t(t,r?.ruleset?.id??n?.ruleset?.id??t?.ruleset?.id??``,`Erft van tournament`)}
        </label>
        ${lr(i,r,n)}
      `}case`stage-arena`:{let e=new Set(r?.arenas.map(e=>e.arenaId));return cr(`arenaId`,`Arena`,(t?.arenas.filter(t=>!e.has(t.id))??[]).map(e=>[e.id,e.name]),`Geen vrije arenas`)}case`stage-official`:{let e=new Set(r?.officials.map(e=>e.entryId));return`
        ${cr(`entryId`,`Vrijwilliger`,(n?.entries.filter(t=>t.kind!==`FIGHTER`&&!e.has(t.id))??[]).map(e=>[e.id,e.user.username]),`Geen vrije vrijwilligers`)}
        ${cr(`role`,`Rol`,[[`JUDGE`,`Scheids`],[`JURY`,`Jury`],[`TELLER`,`Teller`],[`TABLE`,`Tafel`]])}
      `}}}function cn(e){switch(E.eventTab){case`tournaments`:return _n(e,M(e));case`arenas`:return vn(e,e.arenas);case`officials`:return yn(e);case`rulesets`:return`<ruleset-view event-id="${R(e.id)}"></ruleset-view>`}}function ln(){switch(E.eventTab){case`tournaments`:return fn(`tournament`,`Nieuw toernooi`);case`arenas`:return fn(`arena`,`Nieuwe arena`);case`officials`:return`${dn(`event`)}${fn(`entry`,`Nieuwe vrijwilliger`,`VOLUNTEER`)}`;case`rulesets`:return``}}function un(){switch(E.tournamentTab){case`entries`:return fn(`entry`,`Nieuwe deelnemer`,`FIGHTER`);case`officials`:return`${dn(`tournament`)}${fn(`entry`,`Nieuwe vrijwilliger`,`VOLUNTEER`)}`;case`stages`:return fn(`stage`,`Nieuwe stage`)}}function dn(e){return`
    <button
      type="button"
      class="button secondary icon-button"
      data-action="open-volunteer-view"
      data-scope="${e}"
      title="Vrijwilligersoverzicht openen"
      aria-label="Vrijwilligersoverzicht openen"
    >↗</button>
  `}function fn(e,t,n){return`
    <button type="button" class="button icon-button" data-action="open-editor" data-editor="${e}" ${n?`data-entry-kind="${n}"`:``} title="${R(t)}" aria-label="${R(t)}">+</button>
  `}function pn(e,t){switch(E.tournamentTab){case`entries`:return bn(t.entries.filter(e=>e.kind!==`VOLUNTEER`));case`officials`:return wn(t);case`stages`:return`
        <div class="stage-workspace">
          ${Tn(e,t,N(t))}
          <div class="stage-detail">
            ${N(t)?jn(`stage`,E.stageTab,[{value:`overview`,label:`Overzicht`},{value:`arenas`,label:`Arenas`},{value:`officials`,label:`Vrijwilligers`},{value:`rounds`,label:`Rondes`},{value:`matches`,label:`Matches`},{value:`pool-results`,label:`Pool resultaten`}])+`<div class="panel-body">${mn(e,t,N(t))}</div>`:k(`Selecteer een stage.`)}
          </div>
        </div>
      `}}function mn(e,t,n){switch(E.stageTab){case`overview`:return`
        <div class="section-actions">
          <button type="button" class="button" data-action="open-editor" data-editor="stage" data-id="${R(n.id)}">Stage bewerken</button>
        </div>
        ${En(e,t,n)}
      `;case`arenas`:return`
        <div class="section-actions">
          <button type="button" class="button icon-button" data-action="open-editor" data-editor="stage-arena" title="Nieuwe arena-koppeling" aria-label="Nieuwe arena-koppeling">+</button>
        </div>
        ${Dn(n)}
      `;case`officials`:return`
        <div class="section-actions">
          <button type="button" class="button icon-button" data-action="open-editor" data-editor="stage-official" title="Nieuwe vrijwilliger-koppeling" aria-label="Nieuwe vrijwilliger-koppeling">+</button>
        </div>
        ${On(t,n)}
      `;case`rounds`:return kn(n);case`matches`:return An(t,n);case`pool-results`:return hn(e,t,n)}}function hn(e,t,n){return`
    <div class="section-actions">
      <div class="badge badge-muted">Overzicht per pool</div>
      <button type="button" class="button secondary" data-action="open-pool-results-fullscreen">Volledig scherm</button>
    </div>
    <div class="info-card">
      <div class="info-card-title">Pool uitslagen</div>
      <div class="info-card-subtitle">Bekijk per pool alle gespeelde wedstrijden en resultaten.</div>
    </div>
    <pool-results></pool-results>
  `}function gn(){if(!E.poolResultsFullscreen)return``;let e=j(),t=N(e?M(e):void 0);return!e||!t?``:`
    <div class="pool-results-fullscreen-overlay" role="dialog" aria-modal="true" aria-label="Pool resultaten volledig scherm">
      <div class="pool-results-fullscreen-panel">
        <div class="pool-results-fullscreen-header">
          <div>
            <div class="eyebrow">Pool resultaten</div>
            <h2>${R(P(t))}</h2>
          </div>
          <button type="button" class="button secondary" data-action="close-pool-results-fullscreen">Sluiten</button>
        </div>
        <div class="pool-results-fullscreen-body">
          <pool-results></pool-results>
        </div>
      </div>
    </div>
  `}function _n(e,t){return e.tournaments.length===0?k(`Geen toernooien in dit event.`):`
    <div class="list">
      ${e.tournaments.map(n=>{let r=Sr(e,n);return`
            <div class="info-card list-item ${t?.id===n.id?`is-active`:``}" data-action="select-tournament" data-id="${R(n.id)}">
                <span class="tournament-title"><span class="tournament-color" style="background-color: ${R(n.color)}" title="Tournament color: ${R(n.color)}"></span><span class="list-title">${R(n.name)}</span></span>
                <span class="list-meta">${R(r.ruleset)}</span>
                <span class="list-stats">${r.entries} inschrijvingen · ${r.stages} stages</span>
              ${Cn(`tournament`,n.id,n.name)}
            </div>
          `}).join(``)}
    </div>
  `}function vn(e,t){return t.length===0?k(`Geen arenas in dit event.`):`
    <div class="list">
      ${t.map(t=>{let n=e.tournaments.flatMap(e=>e.stages.flatMap(e=>e.arenas.filter(e=>e.arenaId===t.id).map(t=>P(e))));return`
            <div class="info-card">
              <div class="info-card-title">${R(t.name)}</div>
              <div class="info-card-subtitle">Volgorde ${t.order+1}</div>
              <div class="badge-row">
              <span class="tournament-color" style="background-color: ${R(t.leftColor??Ht)}" title="Linker kleur"></span>
              <span class="tournament-color" style="background-color: ${R(t.rightColor??Ut)}" title="Rechter kleur"></span>
            </div>
            <div class="badge-row">
              ${n.length>0?n.map(e=>`<span class="badge badge-muted">${R(e)}</span>`).join(``):`<span class="badge badge-muted">Nog niet gekoppeld</span>`}
              </div>
              ${Cn(`arena`,t.id,t.name)}
            </div>
          `}).join(``)}
    </div>
  `}function yn(e){let t=wr(e);return t.length===0?k(`Geen officials in dit event.`):`
    <div class="list">
      ${t.map(({entry:e,assignments:t})=>`
          <div class="info-card">
            <div class="info-card-title">${R(e.user.username)}</div>
            <div class="info-card-subtitle">${R(jr(e.kind))}</div>
            <div class="badge-row">
              ${t.length>0?t.map(e=>`<span class="badge badge-muted">${R(e)}</span>`).join(``):`<span class="badge badge-muted">Geen stage-assignments</span>`}
            </div>
            ${Sn(e)}
          </div>
        `).join(``)}
    </div>
  `}function bn(e){return e.length===0?k(`Geen deelnemers gevonden.`):`
    <div class="list">
      ${e.map(e=>xn(e)).join(``)}
    </div>
  `}function xn(e){return`
    <div class="info-card">
      <div class="info-card-title">${R(e.user.username)}</div>
      <div class="info-card-subtitle">Seed ${e.seed??`n.v.t.`}</div>
      <div class="badge-row">
        <span class="badge badge-muted">${R(jr(e.kind))}</span>
      </div>
      ${Sn(e)}
    </div>
  `}function Sn(e){let t=R(e.user.username);return`
    <div class="card-actions">
      <button type="button" class="button secondary icon-button" data-action="open-editor" data-editor="entry" data-id="${R(e.id)}" title="Bewerk ${t}" aria-label="Bewerk ${t}">&#9998;</button>
      <button type="button" class="button secondary icon-button danger-button" data-action="delete-entry" data-id="${R(e.id)}" title="Verwijder ${t}" aria-label="Verwijder ${t}">&#128465;</button>
    </div>
  `}function Cn(e,t,n){let r=R(n);return`
    <div class="card-actions list-row-actions">
      <button type="button" class="button secondary icon-button" data-action="open-editor" data-editor="${e}" data-id="${R(t)}" title="Bewerk ${r}" aria-label="Bewerk ${r}">&#9998;</button>
      <button type="button" class="button secondary icon-button danger-button" data-action="delete-${e}" data-id="${R(t)}" title="Verwijder ${r}" aria-label="Verwijder ${r}">&#128465;</button>
    </div>
  `}function wn(e){let t=e.entries.filter(e=>e.kind!==`FIGHTER`);return t.length===0?k(`Geen vrijwilligers in dit toernooi.`):`
    <div class="list">
      ${t.map(t=>{let n=Tr(e,t.id);return`
            <div class="info-card">
              <div class="info-card-title">${R(t.user.username)}</div>
              <div class="info-card-subtitle">${R(jr(t.kind))}</div>
              <div class="badge-row">
                ${n.length>0?n.map(e=>`<span class="badge badge-muted">${R(e)}</span>`).join(``):`<span class="badge badge-muted">Nog niet toegewezen</span>`}
              </div>
              ${Sn(t)}
            </div>
          `}).join(``)}
    </div>
  `}function Tn(e,t,n){if(t.stages.length===0)return k(`Geen stages in dit toernooi.`);let r=yr(t);return`
    <div class="list">
      ${t.stages.map(i=>{let a=Cr(e,t,i),o=r?.id===i.id;return`
            <div class="info-card list-item ${n?.id===i.id?`is-active`:``}" data-action="select-stage" data-id="${R(i.id)}">
                <span class="list-title">${R(P(i))}</span>
                <span class="list-meta">${R(a.ruleset)}</span>
                <span class="list-stats">${a.rounds} rondes · ${a.matches} matches</span>
                <div class="badge-row">
                  ${o?`<span class="badge badge-muted">Huidige fase</span>`:``}
                </div>
              ${Cn(`stage`,i.id,P(i))}
            </div>
          `}).join(``)}
    </div>
  `}function En(e,t,n){let r=Cr(e,t,n),i=yr(t),a=i?.id===n.id?br(t,n):void 0;return`
    <div class="detail-grid">
      <div class="metric-card">
        <div class="metric-label">Type</div>
        <div class="metric-value">${R(n.type)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Ruleset</div>
        <div class="metric-value">${R(r.ruleset)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Tussen matches</div>
        <div class="metric-value">${n.timeBetweenMatchesMinutes} min</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Arenas</div>
        <div class="metric-value">${r.arenas}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Vrijwilligers</div>
        <div class="metric-value">${r.officials}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Rondes</div>
        <div class="metric-value">${r.rounds}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Matches</div>
        <div class="metric-value">${r.matches}</div>
      </div>
    </div>
    <div class="info-card">
      <div class="info-card-title">${R(P(n))}</div>
      <div class="info-card-subtitle">${R(t.name)} in ${R(e.eventName)}</div>
      <div class="badge-row">
        <span class="badge badge-muted">${R(n.type)}</span>
        <span class="badge badge-muted">${r.matches} matches</span>
        <span class="badge badge-muted">${i?.id===n.id?`Huidige fase`:`Actieve fase: ${R(P(i??n))}`}</span>
        ${n.type===`POOL`?`<span class="badge badge-muted">Pool ${n.minPoolSize??4}-${n.maxPoolSize??6} · voorkeur ${n.preferredPoolSize??5}</span>`:``}
        ${n.type===`ELIMINATION`?`<span class="badge badge-muted">Naar eliminatie ${n.eliminationParticipantCount??5}</span>`:``}
      </div>
      <div class="card-actions">
        ${i?.id===n.id?a?`<button type="button" class="button" data-action="advance-stage" data-next-stage-id="${R(a.id)}">Volgende fase</button>`:`<span class="badge badge-muted">Laatste fase</span>`:`<button type="button" class="button" data-action="set-current-stage" data-stage-id="${R(n.id)}">Maak actief</button>`}
      </div>
    </div>
  `}function Dn(e){return e.arenas.length===0?k(`Geen arena-koppelingen voor deze stage.`):`
    <div class="list">
      ${e.arenas.map(e=>`
          <div class="info-card">
            <div class="info-card-title">${R(e.arena.name)}</div>
            <div class="info-card-subtitle">Volgorde ${e.arena.order+1}</div>
          </div>
        `).join(``)}
    </div>
  `}function On(e,t){return t.officials.length===0?k(`Geen stage officials toegewezen.`):`
    <div class="list">
      ${t.officials.map(t=>`
            <div class="info-card">
              <div class="info-card-title">${R(Er(e,t.entryId)?.user.username??t.entryId)}</div>
              <div class="info-card-subtitle">${R(Mr(t.role))}</div>
            </div>
          `).join(``)}
    </div>
  `}function kn(e){return e.rounds.length===0?k(`Geen rondes gevonden.`):`
    <div class="list">
      ${e.rounds.map(e=>`
          <div class="info-card">
            <div class="info-card-title">Ronde ${e.roundNumber+1}</div>
            <div class="info-card-subtitle">${e.matches.length} matches</div>
          </div>
        `).join(``)}
    </div>
  `}function An(e,t){let n=t.rounds.flatMap(e=>e.matches.map(t=>({round:e,match:t})));return n.length===0?k(`Geen matches gevonden.`):`
    <div class="list">
      ${n.map(({round:n,match:r})=>{let i=Dr(e,r.entryAId),a=Dr(e,r.entryBId),o=Dr(e,r.winnerEntryId),s=Or(t,r.arenaId);return`
            <div class="info-card">
              <div class="info-card-title">Ronde ${n.roundNumber+1}</div>
              <div class="info-card-subtitle">
                ${R(kr(i)??`Onbekend`)}
                vs
                ${R(kr(a)??`Onbekend`)}
              </div>
              <div class="badge-row">
                <span class="badge badge-muted">${R(s?.name??`Geen arena`)}</span>
                <span class="badge badge-muted">${r.scoreA??`?`}-${r.scoreB??`?`}</span>
                <span class="badge badge-muted">${R(kr(o)??`Geen winnaar`)}</span>
              </div>
            </div>
          `}).join(``)}
    </div>
  `}function jn(e,t,n){return`
    <nav class="tabs" style="--tab-count: ${n.length};" aria-label="${R(e)} tabs">
      ${n.map(n=>`
            <button
              type="button"
              class="tab ${n.value===t?`is-active`:``}"
              data-action="set-${e}-tab"
              data-tab="${R(n.value)}"
            >
              ${R(n.label)}
            </button>
          `).join(``)}
    </nav>
  `}function k(e){return`<div class="empty-card">${R(e)}</div>`}function Mn(e){e&&(E.selectedEventId=e,E.selectedTournamentId=null,E.selectedStageId=null,O())}function Nn(e){if(!(e.kind!==`event`&&!j())){if(E.volunteerView=void 0,e.kind===`entry`&&!e.id&&!e.entryMode)E.editor={...e,entryMode:`single`};else if(e.kind===`stage`&&!e.stageType){let t=j(),n=N(t?M(t):void 0);E.editor={...e,stageType:n?.type??`POOL`}}else E.editor=e;O()}}function Pn(){E.editor=E.events.length===0?{kind:`event`}:void 0,O()}function Fn(e){let t=j();if(!t)return;E.editor=void 0;let n={scope:e,eventId:t.id};if(e===`tournament`){let e=M(t);e&&(n.tournamentId=e.id)}E.volunteerView=n,O()}function In(){j()&&(E.editor=void 0,E.volunteerView=void 0,E.eventTab=`rulesets`,O())}function Ln(){E.volunteerView=void 0,O()}function Rn(){let e=E.editor;!e||e.kind!==`entry`||e.id||(E.editor={...e,entryMode:e.entryMode===`bulk`?`single`:`bulk`},O())}async function zn(e){let t=hr(j(),e);if(t&&window.confirm(`Weet je zeker dat je ${t.user.username} wilt verwijderen?`)){E.loading=!0,E.error=null,O();try{await w.deleteEntry(t.id),await D()}catch(e){E.loading=!1,E.error=F(e),O()}}}async function Bn(e){let t=E.events.find(t=>t.id===e);if(t&&window.confirm(`Weet je zeker dat je ${t.eventName} wilt verwijderen?`)){E.loading=!0,E.error=null,O();try{await w.deleteEvent(t.id),E.selectedEventId===t.id&&(E.selectedEventId=null,E.selectedTournamentId=null,E.selectedStageId=null),await D()}catch(e){E.loading=!1,E.error=F(e),O()}}}async function Vn(e,t){let n=j(),r=n?.tournaments.find(e=>e.id===t),i=n?.arenas.find(e=>e.id===t),a=n?.tournaments.flatMap(e=>e.stages).find(e=>e.id===t),o=e===`delete-tournament`?r?.name:e===`delete-arena`?i?.name:a?P(a):void 0;if(!(!t||!o||!window.confirm(`Weet je zeker dat je ${o} wilt verwijderen?`))){E.loading=!0,E.error=null,O();try{e===`delete-tournament`&&await w.deleteTournament(t),e===`delete-arena`&&await w.deleteArena(t),e===`delete-stage`&&await w.deleteStage(t),await D()}catch(e){E.loading=!1,E.error=F(e),O()}}}function Hn(e){e&&(E.selectedTournamentId=e,E.selectedStageId=null,O())}function Un(e){e&&(E.selectedStageId=e,O())}async function Wn(e){let t=j(),n=t?M(t):void 0;if(!(!t||!n||!e)){E.loading=!0,E.error=null,O();try{await w.updateTournament(n.id,{currentStageId:e}),E.selectedStageId=e,await D()}catch(e){E.loading=!1,E.error=F(e),O()}}}function Gn(e){E.eventTab=e,O()}function Kn(e){E.tournamentTab=e,O()}function qn(e){E.stageTab=e,O()}async function Jn(e){let t=new FormData(e),n=I(t.get(`editorKind`),`Onderdeel`),r=L(t.get(`id`)),i=j(),a=i?M(i):void 0,o=N(a);E.loading=!0,O();try{await Xn(n,r,t,i,a,o),await D()}catch(e){E.loading=!1,E.error=F(e),O()}}async function Yn(e){let t=e.dataset.userId;if(!t)return;let n=j();if(!n)return;let r=mr(n,t,E.volunteerView?.tournamentId);if(r){E.loading=!0,O();try{let n=new FormData(e);await or(t,n),await sr(t,n,r.user.skills??[]),await D()}catch(e){E.loading=!1,E.error=F(e),O()}}}async function Xn(e,t,n,r,i,a){switch(e){case`event`:{let e=I(n.get(`eventName`),`Event naam`),r=L(n.get(`rulesetId`))??null,i=n.get(`allFightersAreVolunteers`)===`on`;E.selectedEventId=(t?await w.updateEvent(t,{eventName:e,rulesetId:r,allFightersAreVolunteers:i}):await w.createEvent({eventName:e,rulesetId:r,allFightersAreVolunteers:i})).id,E.selectedTournamentId=null,E.selectedStageId=null;return}case`tournament`:{let e={eventId:r?.id??Pr(),name:I(n.get(`name`),`Naam`),order:A(n.get(`order`),`Volgorde`),rulesetId:L(n.get(`rulesetId`))??null};E.selectedTournamentId=(t?await w.updateTournament(t,e):await w.createTournament(e)).id,E.selectedStageId=null;return}case`arena`:{let e={eventId:r?.id??Pr(),name:I(n.get(`name`),`Naam`),order:A(n.get(`order`),`Volgorde`),leftColor:I(n.get(`leftColor`),`Linker kleur`),rightColor:I(n.get(`rightColor`),`Rechter kleur`)};await(t?w.updateArena(t,e):w.createArena(e));return}case`entry`:{let e=t?I(n.get(`tournamentId`),`Tournament`):i?.id??(()=>{throw Error(`Select a tournament first.`)})(),a=I(n.get(`entryKind`),`Entry type`);if(t){let i=I(n.get(`username`),`Naam`),o=gr(n.get(`seed`),`Seed`),s=hr(r,t);if(!s)throw Error(`Inschrijving niet gevonden.`);await w.updateUser(s.userId,{username:i}),await w.updateEntry(t,{tournamentId:e,kind:a,seed:o??null}),await or(s.userId,n),await sr(s.userId,n,s.user.skills??[])}else{if((L(n.get(`entryMode`))===`bulk`?`bulk`:`single`)==`bulk`){let t=_r(I(n.get(`usernames`),`Namen`)),o=await w.listUsers();for(let s of t){let t=vr(o,s),c=!t;t||(t=await w.createUser({username:s}),o.push(t));let l=a===`FIGHTER`&&(n.get(`alsoVolunteer`)===`on`||r?.allFightersAreVolunteers)?`BOTH`:a,u=i?.entries.find(e=>e.userId===t.id);u?await w.updateEntry(u.id,{tournamentId:e,kind:l}):await w.createEntry({tournamentId:e,userId:t.id,kind:l}),c&&(await or(t.id,n),await sr(t.id,n,t.skills??[]))}return}let t=I(n.get(`username`),`Naam`),o=(await w.listUsers()).find(e=>e.username.localeCompare(t,void 0,{sensitivity:`accent`})===0),s=o??await w.createUser({username:t}),c=a===`FIGHTER`&&(n.get(`alsoVolunteer`)===`on`||r?.allFightersAreVolunteers)?`BOTH`:a,l=i?.entries.find(e=>e.userId===s.id);l?await w.updateEntry(l.id,{tournamentId:e,kind:c}):await w.createEntry({tournamentId:e,userId:s.id,kind:c}),o||(await or(s.id,n),await sr(s.id,n,s.skills??[]))}return}case`stage`:{let e=i?.id;if(!e)throw Error(`Selecteer eerst een toernooi.`);let r=I(n.get(`type`),`Type`),a={tournamentId:e,type:r,name:L(n.get(`name`))??null,rulesetId:L(n.get(`rulesetId`))??null,timeBetweenMatchesMinutes:A(n.get(`timeBetweenMatchesMinutes`),`Time between matches`),minPoolSize:r===`POOL`?A(n.get(`minPoolSize`),`Minimum pool size`):null,maxPoolSize:r===`POOL`?A(n.get(`maxPoolSize`),`Maximum pool size`):null,preferredPoolSize:r===`POOL`?A(n.get(`preferredPoolSize`),`Preferred pool size`):null,eliminationParticipantCount:r===`ELIMINATION`?A(n.get(`eliminationParticipantCount`),`Deelnemers naar eliminatie`):null};E.selectedStageId=(t?await w.updateStage(t,a):await w.createStage(a)).id;return}case`stage-arena`:if(!a)throw Error(`Selecteer eerst een stage.`);await w.createStageArena(a.id,{arenaId:I(n.get(`arenaId`),`Arena`)});return;case`stage-official`:if(!a)throw Error(`Selecteer eerst een stage.`);await w.createStageOfficial(a.id,{entryId:I(n.get(`entryId`),`Vrijwilliger`),role:I(n.get(`role`),`Rol`)});return}}function Zn(e){return e.map(([e,t,n,r,i,a=`text`])=>`
      <label class="field">
        <span>${R(t)}</span>
        <input class="text-input" name="${R(e)}" type="${R(a)}" value="${R(n)}" placeholder="${R(r)}" ${i?`required`:``} ${a===`number`?`min="0" step="1"`:``} />
      </label>
    `).join(``)}function Qn(e,t,n,r,i,a=6){return`
    <label class="field">
      <span>${R(t)}</span>
      <textarea class="text-input bulk-text-input" name="${R(e)}" rows="${a}" placeholder="${R(r)}" ${i?`required`:``}>${R(n)}</textarea>
    </label>
  `}function $n(e,t){return cr(`tournamentId`,`Toernooi`,(e?.tournaments??[]).map(e=>[e.id,e.name]),`Maak eerst een toernooi aan.`,t)}function er(e,t,n){return`
    <div class="volunteer-preferences">
      <span>Volunteer preferences:</span>
      <div class="volunteer-checkboxes">
        <label class="checkbox-field"><input name="judgeVolunteer" type="checkbox" ${e.judgeVolunteer?`checked`:``} /><span>Judge</span></label>
        <label class="checkbox-field"><input name="juryVolunteer" type="checkbox" ${e.juryVolunteer?`checked`:``} /><span>Jury</span></label>
        <label class="checkbox-field"><input name="tableVolunteer" type="checkbox" ${e.tableVolunteer?`checked`:``} /><span>Table</span></label>
        <label class="checkbox-field"><input name="otherVolunteer" type="checkbox" ${e.otherVolunteer?`checked`:``} /><span>Other volunteer work</span></label>
      </div>
      <div class="volunteer-skills">
        <span>Skills</span>
        ${rr(n,`judgeSkill`,`Judge`,ar(t,`JUDGE`))}
        ${rr(n,`jurySkill`,`Jury`,ar(t,`JURY`))}
      </div>
    </div>
  `}function tr(e,t){let n=t.find(e=>e.skillName===`JUDGE`&&e.skillLevel>0),r=t.find(e=>e.skillName===`JURY`&&e.skillLevel>0),i=nr(e);return`
    <div class="volunteer-summary">
      <div class="volunteer-summary-line">${[n,r].filter(e=>!!e).map(e=>`${R(e.skillName===`JUDGE`?`Judge`:`Jury`)} ${`&#9733;`.repeat(e.skillLevel)}`).join(` · `)||`Geen skills`}</div>
      ${i?`<div class="badge-row">${i}</div>`:``}
    </div>
  `}function nr(e){return[[e.judgeVolunteer,`Judge`],[e.juryVolunteer,`Jury`],[e.tableVolunteer,`Table`],[e.otherVolunteer,`Other volunteer work`]].filter(([e])=>e).map(([,e])=>`<span class="badge badge-muted">${R(e)}</span>`).join(``)}function rr(e,t,n,r){return`
    <fieldset class="field skill-rating">
      <span>${R(n)} skill</span>
      <div class="star-picker" role="radiogroup" aria-label="${R(n)} skill">
        ${Array.from({length:5},(n,i)=>{let a=5-i,o=`${e}-${t}-${a}`;return`
            <input id="${R(o)}" name="${R(t)}" type="radio" value="${a}" ${a===r?`checked`:``} />
            <label for="${R(o)}" title="${a} ${a===1?`star`:`stars`}" aria-label="${a} ${a===1?`star`:`stars`}">&#9733;</label>
          `}).join(``)}
      </div>
    </fieldset>
  `}function ir(){return{judgeVolunteer:!1,juryVolunteer:!1,tableVolunteer:!1,otherVolunteer:!1}}function ar(e,t){return e.find(e=>e.skillName===t&&e.skillLevel>0)?.skillLevel??0}async function or(e,t){await w.updateUser(e,{judgeVolunteer:t.get(`judgeVolunteer`)===`on`,juryVolunteer:t.get(`juryVolunteer`)===`on`,tableVolunteer:t.get(`tableVolunteer`)===`on`,otherVolunteer:t.get(`otherVolunteer`)===`on`})}async function sr(e,t,n){for(let[r,i]of[[`JUDGE`,`judgeSkill`],[`JURY`,`jurySkill`]]){let a=n.filter(e=>e.skillName===r),o=a[0],s=gr(t.get(i),`${r} skill`);if(s===void 0){if(a.length>1)for(let e of a.slice(1))await w.deleteSkill(e.id);continue}if(o){o.skillLevel!==s&&await w.updateSkill(o.id,{skillLevel:s});for(let e of a.slice(1))await w.deleteSkill(e.id)}else await w.createSkill({userId:e,skillName:r,skillLevel:s})}}function cr(e,t,n,r=`Geen opties beschikbaar`,i){return`
    <label class="field">
      <span>${R(t)}</span>
      <select class="text-input" name="${R(e)}" ${n.length===0?`disabled`:``}>
        ${n.length>0?n.map(([e,t])=>`<option value="${R(e)}" ${e===i?`selected`:``}>${R(t)}</option>`).join(``):`<option value="">${R(r)}</option>`}
      </select>
    </label>
  `}function lr(e,t,n){let r=t?.timeBetweenMatchesMinutes??2,i=t?.minPoolSize??4,a=t?.maxPoolSize??6,o=t?.preferredPoolSize??5,s=t?.eliminationParticipantCount??ur(n,t)??5;return`
    <label class="field">
      <span>Time between matches (minutes)</span>
      <input class="text-input" name="timeBetweenMatchesMinutes" type="number" min="0" step="1" value="${r}" required />
    </label>
    ${e===`POOL`?`
        <div class="field-grid">
          <label class="field">
            <span>Min pool size</span>
            <input class="text-input" name="minPoolSize" type="number" min="1" step="1" value="${i}" required />
          </label>
          <label class="field">
            <span>Max pool size</span>
            <input class="text-input" name="maxPoolSize" type="number" min="1" step="1" value="${a}" required />
          </label>
          <label class="field">
            <span>Preferred pool size</span>
            <input class="text-input" name="preferredPoolSize" type="number" min="1" step="1" value="${o}" required />
          </label>
        </div>
      `:``}
    ${e===`ELIMINATION`?`
        <label class="field">
          <span>Deelnemers naar eliminatie</span>
          <input class="text-input" name="eliminationParticipantCount" type="number" min="1" step="1" value="${s}" required />
        </label>
      `:``}
  `}function ur(e,t){if(t?.type===`POOL`&&t.preferredPoolSize!==null)return t.preferredPoolSize;let n=e?.stages.find(e=>e.type===`POOL`&&e.preferredPoolSize!==null);if(n?.preferredPoolSize!==null&&n?.preferredPoolSize!==void 0)return n.preferredPoolSize}function dr(e,t){switch(e){case`event`:return`event`;case`tournament`:return`toernooi`;case`arena`:return`arena`;case`entry`:return t===`VOLUNTEER`?`Volunteer`:t===`BOTH`?`Fighter and Volunteer`:`Fighter`;case`stage`:return`stage`;case`stage-arena`:return`arena-koppeling`;case`stage-official`:return`vrijwilliger-koppeling`}}function fr(e,t){let n=t?t.entries:e.tournaments.flatMap(e=>e.entries),r=new Map;for(let e of n){if(e.kind===`FIGHTER`)continue;let t=r.get(e.userId);(!t||t.kind!==`BOTH`&&e.kind===`BOTH`)&&r.set(e.userId,e)}return[...r.values()].sort((e,t)=>e.user.username.localeCompare(t.user.username))}function pr(e){return`
    <article class="editor-card volunteer-card">
      <header class="editor-card-header">
        <div>
          <div class="volunteer-name">${R(e.user.username)}</div>
          <p class="editor-note">${R(jr(e.kind))}</p>
        </div>
        ${tr(e.user,e.user.skills??[])}
      </header>
      <form class="editor-form volunteer-update-form" data-action="volunteer-update" data-user-id="${R(e.userId)}">
        ${er(e.user,e.user.skills??[],`volunteer-${e.userId}`)}
      </form>
    </article>
  `}function mr(e,t,n){return(n?e.tournaments.filter(e=>e.id===n):e.tournaments).flatMap(e=>e.entries).find(e=>e.userId===t&&e.kind!==`FIGHTER`)}function hr(e,t){if(t)return e?.tournaments.flatMap(e=>e.entries).find(e=>e.id===t)}function A(e,t){let n=gr(e,t);if(n===void 0)throw Error(`${t} is verplicht.`);return n}function gr(e,t){let n=L(e);if(n===void 0)return;let r=Number(n);if(!Number.isInteger(r)||r<0)throw Error(`${t} moet een positief geheel getal zijn.`);return r}function _r(e){return[...new Set(e.split(/\r?\n/).map(e=>e.trim()).filter(e=>e.length>0))]}function vr(e,t){return e.find(e=>e.username.localeCompare(t,void 0,{sensitivity:`accent`})===0)}function j(){return E.events.find(e=>e.id===E.selectedEventId)??E.events[0]}function M(e){return e.tournaments.find(e=>e.id===E.selectedTournamentId)??e.tournaments[0]}function N(e){if(e)return e.stages.find(e=>e.id===E.selectedStageId)??yr(e)}function yr(e){if(e){if(e.currentStageId){let t=e.stages.find(t=>t.id===e.currentStageId);if(t)return t}for(let t of Nr){let n=e.stages.find(e=>e.type===t);if(n)return n}return e.stages[0]}}function br(e,t){let n=Nr.indexOf(t.type),r=Nr.slice(n+1);for(let t of r){let n=e.stages.find(e=>e.type===t);if(n)return n}}function xr(e){let t=e.tournaments.flatMap(e=>e.entries.filter(e=>e.kind!==`VOLUNTEER`)),n=wr(e);return{ruleset:e.ruleset?Ar(e.ruleset):`Geen ruleset`,tournaments:e.tournaments.length,arenas:e.arenas.length,fighters:t.length,officials:n.length}}function Sr(e,t){return{ruleset:Ar(t.ruleset??e.ruleset),entries:t.entries.length,stages:t.stages.length}}function Cr(e,t,n){let r=n.arenas??[],i=n.officials??[],a=n.rounds??[];return{ruleset:Ar(n.ruleset??t.ruleset??e.ruleset),arenas:r.length,officials:i.length,rounds:a.length,matches:a.reduce((e,t)=>e+(t.matches??[]).length,0)}}function wr(e){return e.tournaments.flatMap(e=>e.entries.filter(e=>e.kind!==`FIGHTER`).map(t=>({entry:t,assignments:Tr(e,t.id)}))).sort((e,t)=>e.entry.user.username.localeCompare(t.entry.user.username))}function Tr(e,t){let n=[];for(let r of e.stages)for(let e of r.officials)e.entryId===t&&n.push(`${P(r)} · ${Mr(e.role)}`);return n}function Er(e,t){return e.entries.find(e=>e.id===t)}function Dr(e,t){if(t)return Er(e,t)}function Or(e,t){if(t)return e.arenas.map(e=>e.arena).find(e=>e.id===t)}function kr(e){return e?.user.username}function Ar(e){return e?`${e.name} v${e.version}`:`Erft ruleset`}function jr(e){return e===`VOLUNTEER`?`Volunteer`:e===`BOTH`?`Fighter and Volunteer`:`Fighter`}function Mr(e){switch(e){case`JUDGE`:return`Scheids`;case`JURY`:return`Jury`;case`TELLER`:return`Teller`;case`TABLE`:return`Tafel`}}function P(e){return e.name?e.name:e.type}var Nr=[`POOL`,`ELIMINATION`,`SEMI_FINAL`,`FINAL`];function F(e){return e instanceof Error?e.message:`Onbekende fout.`}function I(e,t){if(typeof e!=`string`)throw Error(`${t} is verplicht.`);let n=e.trim();if(n.length===0)throw Error(`${t} is verplicht.`);return n}function L(e){if(typeof e!=`string`)return;let t=e.trim();return t.length>0?t:void 0}function Pr(){let e=j();if(!e)throw Error(`No event is selected.`);return e.id}function R(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}var Fr=class extends n{#e=!1;connectedCallback(){this.render(ut,dt),Wt(this),this.#e=!0}disconnectedCallback(){this.#e&&=(Gt(this),!1),super.disconnectedCallback()}};customElements.get(`event-view`)||customElements.define(`event-view`,Fr);var Ir=`:host {\r
  display: block;\r
  min-height: 100vh;\r
  background: #0d1117;\r
  color: #f2f5f7;\r
}\r
\r
.planner {\r
  box-sizing: border-box;\r
  min-height: 100vh;\r
  padding: 1rem;\r
}\r
\r
.planner-header,\r
.planner-controls,\r
.planner-layout {\r
  max-width: 100%;\r
}\r
\r
.planner-header {\r
  display: flex;\r
  align-items: end;\r
  justify-content: space-between;\r
  gap: 1rem;\r
  margin-bottom: 1rem;\r
}\r
\r
.planner-header-actions {\r
  display: flex;\r
  align-items: end;\r
  gap: 0.5rem;\r
}\r
\r
.planner-header h1,\r
.planner-header h2,\r
.planner-header h3,\r
.planner-header p {\r
  margin: 0;\r
}\r
\r
.planner-header a {\r
  color: #8fb2ff;\r
}\r
\r
.planner-header label,\r
.planner-controls label,\r
.slot-header label {\r
  display: grid;\r
  gap: 0.25rem;\r
  font-size: 0.8rem;\r
  font-weight: 600;\r
}\r
\r
select,\r
input,\r
button {\r
  font: inherit;\r
}\r
\r
select,\r
input {\r
  min-width: 0;\r
  border: 1px solid rgba(255, 255, 255, 0.1);\r
  border-radius: 0.45rem;\r
  padding: 0.35rem 0.45rem;\r
  background: #0f1623;\r
  color: inherit;\r
}\r
\r
button {\r
  border: 0;\r
  border-radius: 0.45rem;\r
  padding: 0.45rem 0.65rem;\r
  background: linear-gradient(180deg, #2d66ff, #1b4ad8);\r
  color: #fff;\r
  cursor: pointer;\r
}\r
\r
button:disabled {\r
  cursor: not-allowed;\r
  opacity: 0.45;\r
}\r
\r
.icon-button {\r
  min-width: 2.1rem;\r
  padding: 0.45rem 0.4rem;\r
  text-align: center;\r
}\r
\r
.planner-controls {\r
  display: grid;\r
  grid-template-columns: max-content minmax(0, 1fr);\r
  gap: 1rem;\r
  align-items: end;\r
  padding: 0.8rem;\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 0.8rem;\r
  background: #111723;\r
}\r
\r
.planner-active-slot {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 0.75rem;\r
  padding: 0.65rem 0.75rem;\r
  border-radius: 0.65rem;\r
  background: rgba(255, 255, 255, 0.05);\r
}\r
\r
.badge-row {\r
  display: flex;\r
  gap: 0.5rem;\r
  flex-wrap: wrap;\r
}\r
\r
.badge {\r
  align-items: center;\r
  background: #20283a;\r
  border-radius: 999px;\r
  color: white;\r
  display: inline-flex;\r
  font-size: 0.75rem;\r
  min-height: 1.5rem;\r
  padding: 0 0.65rem;\r
}\r
\r
.badge.badge-muted {\r
  color: rgba(255, 255, 255, 0.78);\r
}\r
\r
.empty-state {\r
  background: #101621;\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 0.9rem;\r
  padding: 0.9rem;\r
}\r
\r
.modal-backdrop {\r
  align-items: center;\r
  background: rgba(4, 8, 15, 0.72);\r
  display: flex;\r
  inset: 0;\r
  justify-content: center;\r
  padding: 1.25rem;\r
  position: fixed;\r
  z-index: 20;\r
}\r
\r
.modal-card {\r
  background: #111723;\r
  border: 1px solid rgba(255, 255, 255, 0.14);\r
  border-radius: 1rem;\r
  box-shadow: 0 1.2rem 3rem rgba(0, 0, 0, 0.45);\r
  display: grid;\r
  gap: 1rem;\r
  max-height: calc(100vh - 2.5rem);\r
  max-width: 72rem;\r
  overflow: auto;\r
  padding: 1rem;\r
  width: 100%;\r
}\r
\r
.modal-header {\r
  align-items: start;\r
  display: flex;\r
  gap: 1rem;\r
  justify-content: space-between;\r
}\r
\r
.modal-header h2 {\r
  margin: 0.25rem 0 0;\r
}\r
\r
.modal-actions {\r
  display: flex;\r
  gap: 0.5rem;\r
  justify-content: flex-end;\r
}\r
\r
.suggestion-summary {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 0.5rem;\r
}\r
\r
.suggestion-list {\r
  display: grid;\r
  gap: 0.75rem;\r
}\r
\r
.suggestion-card {\r
  background: #101621;\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-left: 0.35rem solid var(--tournament-color, #2d66ff);\r
  border-radius: 0.9rem;\r
  display: grid;\r
  gap: 0.75rem;\r
  padding: 0.9rem;\r
}\r
\r
.suggestion-card-header {\r
  display: flex;\r
  justify-content: space-between;\r
  gap: 0.75rem;\r
}\r
\r
.suggestion-card-header h3 {\r
  margin: 0;\r
}\r
\r
.suggestion-card-header p {\r
  color: rgba(255, 255, 255, 0.7);\r
  margin: 0.25rem 0 0;\r
}\r
\r
.suggestion-pill {\r
  align-self: start;\r
  background: rgba(255, 255, 255, 0.08);\r
  border-radius: 999px;\r
  font-size: 0.8rem;\r
  padding: 0.35rem 0.65rem;\r
  white-space: nowrap;\r
}\r
\r
.suggestion-metrics {\r
  display: grid;\r
  gap: 0.75rem;\r
  grid-template-columns: repeat(4, minmax(0, 1fr));\r
}\r
\r
.suggestion-metrics span {\r
  color: rgba(255, 255, 255, 0.65);\r
  display: block;\r
  font-size: 0.75rem;\r
}\r
\r
.suggestion-metrics strong {\r
  display: block;\r
  margin-top: 0.2rem;\r
}\r
\r
.suggestion-warning {\r
  background: rgba(229, 72, 77, 0.12);\r
  border: 1px solid rgba(229, 72, 77, 0.35);\r
  border-radius: 0.6rem;\r
  color: #ffb6b9;\r
  padding: 0.65rem 0.75rem;\r
}\r
\r
.start-time-form,\r
.slot-form {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: end;\r
  gap: 0.5rem;\r
}\r
\r
.checkbox-label {\r
  display: flex !important;\r
  align-items: center;\r
  gap: 0.35rem;\r
}\r
\r
.planner-layout {\r
  display: grid;\r
  grid-template-columns: 15rem minmax(0, 1fr);\r
  gap: 1rem;\r
  margin-top: 1rem;\r
  align-items: stretch;\r
}\r
\r
.phase-sidebar {\r
  display: flex;\r
  flex-direction: column;\r
  align-self: stretch;\r
  height: calc(100vh - 11rem);\r
  min-height: 0;\r
  padding: 0.8rem;\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 0.8rem;\r
  background: #111723;\r
}\r
\r
.phase-sidebar-content {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 0.75rem;\r
  flex: 1;\r
  min-height: 0;\r
  overflow: auto;\r
  justify-content: flex-start;\r
}\r
\r
.phase-sidebar h2 {\r
  margin: 0 0 0.75rem;\r
  font-size: 1rem;\r
}\r
\r
.planner-mode-tabs {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 0.35rem;\r
  margin-bottom: 0.75rem;\r
  flex: 0 0 auto;\r
}\r
\r
.planner-mode-tabs button {\r
  flex: 1 1 calc(50% - 0.175rem);\r
  min-width: 0;\r
}\r
\r
.planner-mode-tabs button:last-child {\r
  flex-basis: 100%;\r
}\r
\r
.phase-sidebar-actions {\r
  display: grid;\r
  gap: 0.35rem;\r
  margin-bottom: 0.75rem;\r
}\r
\r
.random-assign-button {\r
  width: 100%;\r
  background: linear-gradient(180deg, #3b7cff, #2554d9);\r
}\r
\r
.planner-mode-tabs button[aria-pressed="false"] {\r
  background: #20283a;\r
}\r
\r
.volunteer-source {\r
  display: grid;\r
  gap: 0.18rem;\r
  position: relative;\r
  width: 100%;\r
  margin-top: 0.4rem;\r
  background: #20283a;\r
  border: 1px solid rgba(255, 255, 255, 0.12);\r
  text-align: left;\r
}\r
\r
.fighter-source {\r
  align-items: center;\r
  background: color-mix(in srgb, var(--tournament-color) 16%, #20283a);\r
  border: 1px solid color-mix(in srgb, var(--tournament-color) 52%, transparent);\r
  border-left: 0.35rem solid var(--tournament-color);\r
  display: grid;\r
  gap: 0.5rem;\r
  grid-template-columns: auto minmax(0, 1fr);\r
  margin-top: 0.4rem;\r
  padding: 0.55rem 0.65rem;\r
  position: relative;\r
  text-align: left;\r
  width: 100%;\r
}\r
\r
.fighter-source-dot {\r
  background: var(--tournament-color);\r
  border-radius: 999px;\r
  box-shadow: 0 0 0 0.18rem color-mix(in srgb, var(--tournament-color) 28%, transparent);\r
  height: 0.75rem;\r
  width: 0.75rem;\r
}\r
\r
.fighter-source-text {\r
  display: grid;\r
  gap: 0.1rem;\r
  min-width: 0;\r
}\r
\r
.fighter-source-text strong {\r
  font-size: 0.82rem;\r
}\r
\r
.fighter-source-text span {\r
  color: rgba(255, 255, 255, 0.62);\r
  font-size: 0.72rem;\r
}\r
\r
.volunteer-source strong {\r
  font-size: 0.82rem;\r
}\r
\r
.volunteer-skills {\r
  display: grid;\r
  gap: 0.14rem;\r
}\r
\r
.volunteer-skill {\r
  display: flex;\r
  align-items: center;\r
  gap: 0.35rem;\r
  color: rgba(255, 255, 255, 0.65);\r
  font-size: 0.72rem;\r
}\r
\r
.volunteer-skill-label {\r
  min-width: 3rem;\r
}\r
\r
.volunteer-skill-stars {\r
  color: #ffc96b;\r
  letter-spacing: 0.08em;\r
}\r
\r
.volunteer-wish {\r
  display: inline-flex;\r
  align-items: center;\r
  border-radius: 999px;\r
  padding: 0.1rem 0.4rem;\r
  background: rgba(255, 201, 107, 0.14);\r
  color: #ffc96b;\r
  font-size: 0.68rem;\r
  line-height: 1;\r
}\r
\r
.volunteer-tooltip {\r
  position: absolute;\r
  top: calc(100% + 0.35rem);\r
  left: 0;\r
  z-index: 8;\r
  display: none;\r
  gap: 0.35rem;\r
  min-width: 12rem;\r
  max-width: min(18rem, 72vw);\r
  padding: 0.5rem 0.55rem;\r
  border: 1px solid rgba(255, 255, 255, 0.14);\r
  border-radius: 0.4rem;\r
  background: #111723;\r
  box-shadow: 0 0.5rem 1.2rem rgba(0, 0, 0, 0.35);\r
  pointer-events: none;\r
}\r
\r
.volunteer-tooltip-name {\r
  font-size: 0.8rem;\r
  font-weight: 700;\r
  color: #f2f5f7;\r
}\r
\r
.volunteer-source[data-hovered="true"] .volunteer-tooltip,\r
.assignment-volunteer[data-hovered="true"] .volunteer-tooltip {\r
  display: grid;\r
}\r
\r
.volunteer-tooltip-section {\r
  display: grid;\r
  gap: 0.2rem;\r
}\r
\r
.volunteer-tooltip-heading {\r
  color: rgba(255, 255, 255, 0.55);\r
  font-size: 0.62rem;\r
  font-weight: 700;\r
  letter-spacing: 0.08em;\r
  text-transform: uppercase;\r
}\r
\r
:host([data-dragging="true"]) .volunteer-tooltip {\r
  display: none;\r
}\r
\r
.tournament-phases {\r
  margin-top: 0.75rem;\r
  padding: 0.55rem;\r
  border-left: 0.35rem solid var(--tournament-color);\r
  border-radius: 0.45rem;\r
  background: color-mix(in srgb, var(--tournament-color) 10%, #101621);\r
}\r
\r
.tournament-phases h3,\r
.tournament-participants h3 {\r
  margin: 0 0 0.45rem;\r
  font-size: 0.9rem;\r
}\r
\r
.tournament-participants {\r
  margin-top: 0.75rem;\r
  padding: 0.55rem;\r
  border-left: 0.35rem solid var(--tournament-color);\r
  border-radius: 0.45rem;\r
  background: color-mix(in srgb, var(--tournament-color) 10%, #101621);\r
}\r
\r
.phase-source {\r
  display: block;\r
  width: 100%;\r
  margin-top: 0.35rem;\r
  border: 1px solid color-mix(in srgb, var(--tournament-color) 55%, transparent);\r
  border-left: 0.3rem solid var(--tournament-color);\r
  background: color-mix(in srgb, var(--tournament-color) 18%, #101621);\r
  text-align: left;\r
}\r
\r
.phase-source:hover {\r
  background: color-mix(in srgb, var(--tournament-color) 28%, #101621);\r
}\r
\r
.timeline-scroll {\r
  overflow: auto;\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 0.8rem;\r
  background: #111723;\r
}\r
\r
.timeline-grid {\r
  display: grid;\r
  min-width: max-content;\r
}\r
\r
.arena-corner,\r
.slot-header,\r
.arena-label,\r
.schedule-cell {\r
  border-right: 1px solid rgba(255, 255, 255, 0.08);\r
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);\r
}\r
\r
.arena-corner,\r
.arena-label {\r
  position: sticky;\r
  left: 0;\r
  z-index: 2;\r
  padding: 0.75rem;\r
  background: #20283a;\r
  font-weight: 700;\r
}\r
\r
.arena-corner {\r
  top: 0;\r
  z-index: 4;\r
}\r
\r
.arena-corner span {\r
  display: block;\r
}\r
\r
.slot-details-toggle {\r
  width: 100%;\r
  margin-top: 0.5rem;\r
  padding: 0.3rem;\r
  background: #111723;\r
  border: 1px solid rgba(255, 255, 255, 0.12);\r
  font-size: 0.75rem;\r
}\r
\r
.slot-header {\r
  position: sticky;\r
  top: 0;\r
  z-index: 3;\r
  min-width: 0;\r
  padding: 0.45rem;\r
  border-top: 0.35rem solid var(--slot-color);\r
  background: #111723;\r
}\r
\r
.slot-header.active-slot {\r
  box-shadow: inset 0 0 0 1px rgba(143, 178, 255, 0.45);\r
}\r
\r
.slot-header p {\r
  margin: 0 0 0.45rem;\r
  font-size: 0.75rem;\r
  font-weight: 700;\r
}\r
\r
.slot-label {\r
  display: block;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.slot-active-badge {\r
  display: inline-flex;\r
  align-items: center;\r
  margin-top: 0.25rem;\r
  padding: 0.15rem 0.45rem;\r
  border-radius: 999px;\r
  background: rgba(143, 178, 255, 0.18);\r
  color: #bcd0ff;\r
  font-size: 0.72rem;\r
  font-weight: 700;\r
}\r
\r
.slot-details {\r
  margin-top: 0.45rem;\r
}\r
\r
.slot-actions {\r
  display: flex;\r
  gap: 0.35rem;\r
  margin-top: 0.5rem;\r
}\r
\r
.slot-header form {\r
  display: grid;\r
  margin-top: 0.45rem;\r
  gap: 0.35rem;\r
}\r
\r
.slot-header input {\r
  width: 100%;\r
  box-sizing: border-box;\r
}\r
\r
.icon-button {\r
  min-width: 2.1rem;\r
  padding: 0.45rem 0.4rem;\r
  text-align: center;\r
}\r
\r
.slot-header .icon-button,\r
.phase-card button {\r
  margin-top: 0.4rem;\r
  background: #a61b1b;\r
}\r
\r
.schedule-cell {\r
  position: relative;\r
  display: grid;\r
  min-height: 7rem;\r
  place-items: center;\r
  padding: 0.4rem;\r
  background: #101621;\r
}\r
\r
.schedule-cell[data-drop-active="true"] {\r
  outline: 0.2rem dashed #2d66ff;\r
  outline-offset: -0.3rem;\r
  background: rgba(45, 102, 255, 0.18);\r
}\r
\r
.drop-hint {\r
  color: rgba(255, 255, 255, 0.46);\r
  font-size: 0.8rem;\r
  text-align: center;\r
}\r
\r
.break-slot,\r
.break-cell {\r
  background: repeating-linear-gradient(-45deg, #2c2025, #2c2025 0.6rem, #3b272d 0.6rem, #3b272d 1.2rem);\r
}\r
\r
.phase-card {\r
  width: 100%;\r
  box-sizing: border-box;\r
  padding: 0.45rem;\r
  border: 1px solid color-mix(in srgb, var(--tournament-color) 50%, transparent);\r
  border-left: 0.35rem solid var(--tournament-color);\r
  border-radius: 0.3rem;\r
  background: color-mix(in srgb, var(--tournament-color) 16%, #20283a);\r
  box-shadow: 0 1px 0.3rem rgb(0 0 0 / 30%);\r
  cursor: grab;\r
}\r
\r
.phase-card span,\r
.phase-card strong {\r
  display: block;\r
}\r
\r
.phase-card span {\r
  color: rgba(255, 255, 255, 0.65);\r
  font-size: 0.72rem;\r
}\r
\r
.phase-card button {\r
  float: right;\r
  margin-top: 0.3rem;\r
  padding: 0.1rem 0.35rem;\r
  background: #a61b1b;\r
}\r
\r
.assignment-dropzones {\r
  display: grid;\r
  gap: 0.3rem;\r
  margin-top: 0.5rem;\r
}\r
\r
.assignment-dropzone {\r
  display: grid;\r
  gap: 0.35rem;\r
  min-height: 1.8rem;\r
  padding: 0.25rem;\r
  border: 1px dashed rgba(255, 255, 255, 0.28);\r
  border-radius: 0.25rem;\r
  font-size: 0.72rem;\r
}\r
\r
.assignment-dropzone-header {\r
  align-items: center;\r
  display: flex;\r
  justify-content: space-between;\r
  gap: 0.35rem;\r
}\r
\r
.assignment-dropzone-count {\r
  color: rgba(255, 255, 255, 0.58);\r
  font-size: 0.7rem;\r
}\r
\r
.assignment-dropzone-hint {\r
  color: rgba(255, 255, 255, 0.48);\r
  font-size: 0.68rem;\r
}\r
\r
.assignment-dropzone[data-drop-possible="true"] {\r
  border-color: #5f92ff;\r
  background: rgba(45, 102, 255, 0.18);\r
  box-shadow: inset 0 0 0 1px rgba(143, 178, 255, 0.22);\r
}\r
\r
.assignment-dropzone[data-drop-possible="false"] {\r
  border-color: rgba(229, 72, 77, 0.45);\r
  background: rgba(229, 72, 77, 0.14);\r
}\r
\r
.assignment-dropzone[data-drop-active="true"][data-drop-possible="true"] {\r
  border-color: #7ef0a3;\r
  background: rgba(86, 204, 126, 0.22);\r
}\r
\r
.assignment-dropzone[data-drop-active="true"][data-drop-possible="false"] {\r
  border-color: #ff6d6d;\r
  background: rgba(229, 72, 77, 0.24);\r
}\r
\r
.assignment-volunteers {\r
  display: grid;\r
  gap: 0.2rem;\r
}\r
\r
.assignment-volunteer {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 0.25rem;\r
  position: relative;\r
  padding: 0.15rem 0.3rem;\r
  border-radius: 0.2rem;\r
  background: rgba(255, 255, 255, 0.1);\r
}\r
\r
.assignment-dropzone[data-role="FIGHTER"] .assignment-volunteer {\r
  background: color-mix(in srgb, var(--tournament-color) 14%, rgba(255, 255, 255, 0.1));\r
}\r
\r
.fighter-assignment-volunteers {\r
  display: grid;\r
  gap: 0.35rem;\r
  min-height: calc(var(--fighter-slot-count, 1) * 2.25rem);\r
}\r
\r
.fighter-assignment-slot {\r
  align-items: center;\r
  display: grid;\r
  gap: 0.35rem;\r
  grid-template-columns: minmax(0, 1fr) auto;\r
  min-height: 2rem;\r
  padding: 0.2rem 0.35rem;\r
  border-radius: 0.25rem;\r
  background: rgba(255, 255, 255, 0.08);\r
}\r
\r
.fighter-assignment-slot-empty {\r
  border: 1px dashed rgba(255, 255, 255, 0.15);\r
  color: rgba(255, 255, 255, 0.45);\r
}\r
\r
.fighter-assignment-slot-filled {\r
  border: 1px solid color-mix(in srgb, var(--tournament-color) 35%, transparent);\r
  background: color-mix(in srgb, var(--tournament-color) 14%, rgba(255, 255, 255, 0.08));\r
}\r
\r
.fighter-assignment-slot-name {\r
  min-width: 0;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.assignment-volunteer button {\r
  float: none;\r
  min-height: 0;\r
  padding: 0 0.3rem;\r
  background: transparent;\r
  color: #ffb6b9;\r
}\r
\r
.assignment-dropzone em {\r
  color: rgba(255, 255, 255, 0.48);\r
}\r
\r
.planner-error {\r
  padding: 0.7rem;\r
  border-radius: 0.4rem;\r
  border: 1px solid rgba(229, 72, 77, 0.4);\r
  background: rgba(229, 72, 77, 0.16);\r
  color: #ffb6b9;\r
}\r
\r
.planner-empty {\r
  padding: 2rem;\r
  text-align: center;\r
}\r
\r
@media (max-width: 52rem) {\r
  .planner-header,\r
  .planner-controls,\r
  .planner-layout {\r
    grid-template-columns: 1fr;\r
  }\r
\r
  .planner-header {\r
    align-items: stretch;\r
    flex-direction: column;\r
  }\r
\r
  .planner-header-actions {\r
    width: 100%;\r
  }\r
\r
  .planner-header-actions label {\r
    flex: 1;\r
  }\r
\r
  .phase-sidebar {\r
    max-height: none;\r
  }\r
\r
  .modal-header,\r
  .suggestion-card-header {\r
    flex-direction: column;\r
  }\r
\r
  .suggestion-metrics {\r
    grid-template-columns: 1fr 1fr;\r
  }\r
}\r
`,Lr=class extends n{#e=_t();#t=[];#n;#r;#i;#a=!1;#o=!1;#s=!1;#c=`stages`;#l=!1;#u;#d=!1;connectedCallback(){this.#r=new URLSearchParams(window.location.search).get(`eventId`)??void 0,this.renderPlanner(),this.registerEvent(this.root,`change`,e=>this.handleChange(e)),this.registerEvent(this.root,`submit`,e=>{e.preventDefault(),this.handleSubmit(e)}),this.registerEvent(this.root,`click`,e=>{this.handleClick(e)}),this.registerEvent(this.root,`dragstart`,e=>this.handleDragStart(e)),this.registerEvent(this.root,`dragover`,e=>this.handleDragOver(e)),this.registerEvent(this.root,`dragleave`,e=>this.handleDragLeave(e)),this.registerEvent(this.root,`drop`,e=>{this.handleDrop(e)}),this.registerEvent(this.root,`dragend`,()=>this.handleDragEnd()),this.registerEvent(this.root,`mouseover`,e=>this.handleVolunteerMouseOver(e)),this.registerEvent(this.root,`mouseout`,e=>this.handleVolunteerMouseOut(e)),this.registerEvent(window,`popstate`,()=>{this.#r=new URLSearchParams(window.location.search).get(`eventId`)??void 0,this.load()}),this.load()}disconnectedCallback(){super.disconnectedCallback()}async load(){this.#a=!0,this.#i=void 0,this.renderPlanner();try{this.#t=await this.#e.listEvents(),this.#n=this.#r?await this.#e.getEventSchedule(this.#r):void 0}catch(e){this.#n=void 0,this.#i=e instanceof Error?e.message:`The planner could not be loaded.`}finally{this.#a=!1,this.renderPlanner()}}handleChange(e){let t=e.target;if(!(t instanceof HTMLSelectElement)||t.name!==`eventId`)return;let n=new URL(window.location.href);t.value?n.searchParams.set(`eventId`,t.value):n.searchParams.delete(`eventId`),window.history.pushState({},``,`${n.pathname}${n.search}`),this.#r=t.value||void 0,this.load()}async handleSubmit(e){let t=e.target;if(!(t instanceof HTMLFormElement))return;let n=t.dataset.action,r=this.#r;if(!r)return;let i=new FormData(t);try{switch(n){case`update-start-time`:await this.#e.updateEventSchedule(r,{startTimeMinutes:Wr(Vr(i,`startTime`))});break;case`add-slot`:await this.#e.createScheduleTimeSlot(r,{durationMinutes:Ur(i,`durationMinutes`),label:Vr(i,`label`),color:Hr(i,`color`),isBreak:i.get(`isBreak`)===`on`});break;case`update-slot`:await this.#e.updateScheduleTimeSlot(Vr(i,`slotId`),{durationMinutes:Ur(i,`durationMinutes`),label:Vr(i,`label`),color:Hr(i,`color`),isBreak:i.get(`isBreak`)===`on`});break;default:return}await this.load()}catch(e){this.#i=e instanceof Error?e.message:`The change could not be saved.`,this.renderPlanner()}}async handleClick(e){let t=e.target;if(!(t instanceof Element))return;let n=t.closest(`[data-click-action]`);if(!n){t.classList.contains(`modal-backdrop`)&&(this.#s=!1,this.renderPlanner());return}if(n.dataset.clickAction===`toggle-slot-details`){this.#o=!this.#o,this.renderPlanner();return}if(n.dataset.clickAction===`set-current-time-slot`){let e=n.dataset.id;if(!e||!this.#r)return;try{await this.#e.updateEventSchedule(this.#r,{currentTimeSlotId:e}),await this.load()}catch(e){this.#i=e instanceof Error?e.message:`The change could not be saved.`,this.renderPlanner()}return}if(n.dataset.clickAction===`advance-time-slot`){let e=n.dataset.nextSlotId;if(!e||!this.#r)return;try{await this.#e.updateEventSchedule(this.#r,{currentTimeSlotId:e}),await this.load()}catch(e){this.#i=e instanceof Error?e.message:`The change could not be saved.`,this.renderPlanner()}return}if(n.dataset.clickAction===`open-suggestions`){this.#s=!0,this.renderPlanner();return}if(n.dataset.clickAction===`close-suggestions`){this.#s=!1,this.renderPlanner();return}if(n.dataset.clickAction===`set-mode`){this.#c=n.dataset.mode===`volunteers`?`volunteers`:n.dataset.mode===`fighters`?`fighters`:`stages`,this.renderPlanner();return}if(n.dataset.clickAction===`random-assign-fighters`){this.handleRandomAssignFighters();return}let r=n.dataset.id;if(r)try{if(n.dataset.clickAction===`delete-slot`){if(!window.confirm(`Delete this time slot?`))return;await this.#e.deleteScheduleTimeSlot(r)}else if(n.dataset.clickAction===`delete-placement`){if(!window.confirm(`Delete this stage placement?`))return;await this.#e.deleteScheduledPhase(r)}else if(n.dataset.clickAction===`delete-assignment`)await this.#e.deleteScheduledAssignment(r);else return;await this.load()}catch(e){this.#i=e instanceof Error?e.message:`The change could not be saved.`,this.renderPlanner()}}handleDragStart(e){let t=e.composedPath()[0],n=t instanceof Element?t:e.target;if(!(n instanceof Element))return;let r=n.closest(`[data-stage-id]`),i=n.closest(`[data-user-id][data-participant-kind][data-tournament-id]`),a=n.closest(`[data-placement-id]`);if(!(!a&&!r&&!i)&&(this.#l=!0,this.root.host.toggleAttribute(`data-dragging`,!0),this.clearHoveredVolunteer(),this.clearActiveDropTargets(),e.dataTransfer)){if(a)e.dataTransfer.setData(`application/x-hema-scheduled-phase`,a.dataset.placementId??``);else if(r)e.dataTransfer.setData(`application/x-hema-stage`,r.dataset.stageId??``);else if(i){let t=i.dataset.userId??``;i.dataset.participantKind===`fighter`?(e.dataTransfer.setData(`application/x-hema-fighter`,t),this.#u={kind:`fighter`,userId:t,tournamentId:i.dataset.tournamentId??``},this.updateParticipantDropzoneStates()):(e.dataTransfer.setData(`application/x-hema-volunteer`,t),this.#u={kind:`volunteer`,userId:t,tournamentId:i.dataset.tournamentId??``})}e.dataTransfer.effectAllowed=`move`}}handleDragOver(e){let t=e.target;if(!(t instanceof Element))return;let n=t.closest(`[data-assignment-phase-id][data-role='FIGHTER']`);if(n&&this.#u?.kind===`fighter`){n.dataset.dropPossible===`true`&&(e.preventDefault(),this.clearActiveDropTargets(),n.dataset.dropActive=`true`);return}let r=t.closest(`[data-assignment-phase-id], [data-arena-id][data-time-slot-id]`);r&&r.dataset.break!==`true`&&(e.preventDefault(),this.clearActiveDropTargets(),r.dataset.dropActive=`true`)}handleDragLeave(e){let t=e.target;if(!(t instanceof Element))return;let n=t.closest(`[data-assignment-phase-id]`);n&&(n.dataset.dropActive=`false`)}async handleDrop(e){let t=e.target;if(!(t instanceof Element)||!e.dataTransfer)return;let n=t.closest(`[data-assignment-phase-id], [data-arena-id][data-time-slot-id]`);if(!n||n.dataset.break===`true`)return;e.preventDefault(),n.dataset.dropActive=`false`;let r=n.dataset.arenaId,i=n.dataset.timeSlotId,a=e.dataTransfer.getData(`application/x-hema-stage`),o=e.dataTransfer.getData(`application/x-hema-scheduled-phase`),s=e.dataTransfer.getData(`application/x-hema-volunteer`),c=e.dataTransfer.getData(`application/x-hema-fighter`),l=n.dataset.assignmentPhaseId,u=n.dataset.role,d=c||s;if(d&&l&&u){let e=this.getParticipantDropState(l,d,u);if(!e.valid){this.#i=e.reason??`This participant cannot be assigned to that time slot.`,this.renderPlanner();return}try{let e=await this.#e.createScheduledAssignment(l,{userId:d,role:u});this.addAssignmentToSchedule(l,e),this.renderPlanner()}catch(e){this.#i=e instanceof Error?e.message:`The assignment could not be saved.`,this.renderPlanner()}return}if(!(!r||!i||!a&&!o))try{o?await this.#e.updateScheduledPhase(o,{arenaId:r,timeSlotId:i}):await this.#e.createScheduledPhase({stageId:a,arenaId:r,timeSlotId:i}),await this.load()}catch(e){this.#i=e instanceof Error?e.message:`The stage could not be placed.`,this.renderPlanner()}}renderPlanner(){let e=this.#n,t=this.#r??``,n=this.#t.map(e=>`<option value="${z(e.id)}"${e.id===t?` selected`:``}>${z(e.eventName)}</option>`).join(``),r=e?.schedule,i=e?.event;this.render(Ir,`
      <section class="planner"${this.#l?` data-dragging="true"`:``}>
        <header class="planner-header">
          <div>
            <a data-route href="/">Event administration</a>
            <h1>Event planner</h1>
          </div>
          <div class="planner-header-actions">
            <label>
              Event
              <select name="eventId" ${this.#a?`disabled`:``}>
                <option value="">Choose an event</option>
                ${n}
              </select>
            </label>
            <button
              type="button"
              class="button secondary icon-button"
              data-click-action="open-suggestions"
              title="Open suggestions"
              aria-label="Open suggestions"
              ${i?``:`disabled`}
            >✦</button>
          </div>
        </header>
        ${this.#i?`<p class="planner-error" role="alert">${z(this.#i)}</p>`:``}
        ${this.#a?`<p>Loading planner...</p>`:``}
        ${!this.#a&&!i?`<p class="planner-empty">Choose an event to create a schedule.</p>`:``}
        ${i&&r?this.renderSchedule(i,r):``}
        ${i?this.renderSuggestionsModal(i):``}
      </section>
    `)}renderSchedule(e,t){let n=t.timeSlots,r=t.currentTimeSlotId?n.findIndex(e=>e.id===t.currentTimeSlotId):-1,i=r>=0?n[r]:void 0,a=this.#c===`fighters`?n.filter(e=>e.scheduledPhases.some(e=>e.stage.type===`POOL`)):n;if(this.#c===`fighters`&&a.length===0)return`<div class="planner-empty">No pool time slots are visible for fighter assignments.</div>`;let o=`11rem ${a.map(e=>`${Math.max(12,e.durationMinutes/4)}rem`).join(` `)}`,s=t.startTimeMinutes,c=s,l=n.map((e,r)=>{let i=n[r+1],o=this.renderSlotHeader(e,c,t.currentTimeSlotId??void 0,i?.id);return c+=e.durationMinutes,a.includes(e)?o:``}).join(``);return`
      <div class="planner-controls">
        <form data-action="update-start-time" class="start-time-form">
          <label>Start time <input name="startTime" type="time" value="${Gr(s)}" required></label>
          <button type="submit">Save start time</button>
        </form>
        <div class="planner-active-slot">
          <span>Active time slot: <strong>${z(i?.label??`None`)}</strong></span>
        </div>
        <form data-action="add-slot" class="slot-form">
          <label>Duration (min.) <input name="durationMinutes" type="number" min="1" max="1440" value="60" required></label>
          <label>Label <input name="label" value="New time slot" required></label>
          <label>Color <input name="color" type="color" value="#6b7280"></label>
          <label class="checkbox-label"><input name="isBreak" type="checkbox"> Break</label>
          <button type="submit">Add time slot</button>
        </form>
      </div>
      <div class="planner-layout">
        <aside class="phase-sidebar">
          <div class="planner-mode-tabs">
            <button type="button" data-click-action="set-mode" data-mode="stages" aria-pressed="${this.#c===`stages`}">Tournament stages</button>
            <button type="button" data-click-action="set-mode" data-mode="volunteers" aria-pressed="${this.#c===`volunteers`}">Volunteers</button>
            <button type="button" data-click-action="set-mode" data-mode="fighters" aria-pressed="${this.#c===`fighters`}">Fighters</button>
          </div>
          ${this.#c===`fighters`?`
            <div class="phase-sidebar-actions">
              <button type="button" class="random-assign-button" data-click-action="random-assign-fighters" ${this.#d||this.#a?`disabled`:``}>
                ${this.#d?`Assigning fighters...`:`Random assign fighters`}
              </button>
            </div>
          `:``}
          <div class="phase-sidebar-content">
            ${this.#c===`stages`?e.tournaments.map(e=>`
              <section class="tournament-phases" style="--tournament-color: ${z(e.color)}">
                <h3>${z(e.name)}</h3>
                ${e.stages.map(e=>`
                  <button class="phase-source" type="button" draggable="true" data-stage-id="${z(e.id)}">
                    ${z(e.name??Kr(e.type))}
                  </button>
                `).join(``)}
              </section>
            `).join(``):this.#c===`volunteers`?this.renderVolunteerList(e):this.renderFighterList(e)}
          </div>
        </aside>
        <div class="timeline-scroll">
          <div class="timeline-grid" style="grid-template-columns: ${o}">
            <div class="arena-corner">
              <span>Arena / time slot</span>
              <button type="button" class="slot-details-toggle" data-click-action="toggle-slot-details" aria-pressed="${this.#o}" title="${this.#o?`Hide all time slot details`:`Show all time slot details`}">
                ${this.#o?`Hide details`:`Show details`}
              </button>
            </div>
            ${l}
            ${e.arenas.sort((e,t)=>e.order-t.order).map(e=>`
              <div class="arena-label">${z(e.name)}</div>
              ${a.map(t=>this.renderScheduleCell(e.id,t)).join(``)}
            `).join(``)}
          </div>
        </div>
      </div>
    `}renderSuggestionsModal(e){if(!this.#s)return``;let t=qr(e),n=t.reduce((e,t)=>Math.max(e,t.longestSlotMinutes),0),r=t.reduce((e,t)=>e+t.participantCount,0),i=t.reduce((e,t)=>e+t.poolCount,0);return`
      <event-editor-view>
        <section class="modal-backdrop" role="presentation">
          <div class="modal-card suggestions-modal-card" role="dialog" aria-modal="true" aria-labelledby="suggestions-title">
            <header class="modal-header">
              <div>
                <div class="eyebrow">Planning suggestions</div>
                <h2 id="suggestions-title">Pool and elimination suggestions</h2>
                <p class="editor-note">These are estimates based on the current event, participant counts, pool limits, elimination setup, ruleset match length, and time between matches.</p>
              </div>
              <div class="modal-actions">
                <button type="button" class="button secondary" data-click-action="close-suggestions">Close</button>
              </div>
            </header>

            <div class="suggestion-summary">
              <span class="badge">Tournaments ${t.length}</span>
              <span class="badge badge-muted">Participants ${r}</span>
              <span class="badge badge-muted">Pools ${i}</span>
              <span class="badge badge-muted">Longest slot ${oi(n)}</span>
            </div>

            <div class="suggestion-list">
              ${t.length>0?t.map(e=>this.renderSuggestionCard(e)).join(``):`<div class="empty-state">No tournaments with pool suggestions yet.</div>`}
            </div>
          </div>
        </section>
      </event-editor-view>
    `}renderSuggestionCard(e){return`
      <article class="suggestion-card" style="--tournament-color: ${z(e.color)}">
        <div class="suggestion-card-header">
          <div>
            <h3>${z(e.tournamentName)}</h3>
            <p>${z(e.reason)}</p>
          </div>
          <div class="suggestion-pill">${e.participantCount} participants</div>
        </div>

        <div class="badge-row">
          <span class="badge badge-muted">Pool sizes ${z(e.poolSizes.join(`, `))}</span>
          <span class="badge badge-muted">Pools ${e.poolCount}</span>
          <span class="badge badge-muted">Pool slot lengths ${z(e.waveLengths.map(oi).join(`, `))}</span>
          <span class="badge badge-muted">Elimination length ${oi(e.eliminationLengthMinutes)}</span>
          <span class="badge badge-muted">Total ${oi(e.totalMinutes)}</span>
        </div>

        <div class="suggestion-metrics">
          <div>
            <span>Participant count</span>
            <strong>${e.participantCount}</strong>
          </div>
          <div>
            <span>Match block</span>
            <strong>${oi(e.matchBlockMinutes)}</strong>
          </div>
          <div>
            <span>Preferred pool</span>
            <strong>${e.preferredPoolSize}</strong>
          </div>
          <div>
            <span>Limits</span>
            <strong>${e.minPoolSize} - ${e.maxPoolSize}</strong>
          </div>
        </div>

        ${e.warnings.length>0?`<div class="suggestion-warning">${e.warnings.map(z).join(`<br />`)}</div>`:``}
      </article>
    `}renderSlotHeader(e,t,n,r){let i=t+e.durationMinutes,a=e.scheduledPhases.length,o=e.id===n;return`
      <section class="slot-header${e.isBreak?` break-slot`:``}${o?` active-slot`:``}" style="--slot-color: ${z(e.color??`#6b7280`)}">
        <p>${Gr(t)} - ${Gr(i)}</p>
        <strong class="slot-label">${z(e.label)}</strong>
        ${o?`<span class="slot-active-badge">Active</span>`:``}
        ${this.#o?`
          <div class="slot-details">
          <form data-action="update-slot">
            <input name="slotId" type="hidden" value="${z(e.id)}">
            <label>Label <input name="label" value="${z(e.label)}" required></label>
            <label>Duration <input name="durationMinutes" type="number" min="1" max="1440" value="${e.durationMinutes}" required></label>
            <label>Color <input name="color" type="color" value="${z(e.color??`#6b7280`)}"></label>
            <label class="checkbox-label"><input name="isBreak" type="checkbox"${e.isBreak?` checked`:``}> Break</label>
            <button type="submit">Save</button>
          </form>
          <button type="button" class="icon-button" data-click-action="delete-slot" data-id="${z(e.id)}"${a>0?` disabled`:``} aria-label="Delete time slot" title="Delete time slot">×</button>
          </div>
        `:``}
        <div class="slot-actions">
          ${o?r?`<button type="button" data-click-action="advance-time-slot" data-next-slot-id="${z(r)}">Next time slot</button>`:``:`<button type="button" data-click-action="set-current-time-slot" data-id="${z(e.id)}">Make active</button>`}
        </div>
      </section>
    `}renderScheduleCell(e,t){let n=t.scheduledPhases.find(t=>t.arenaId===e);return`
      <div class="schedule-cell${t.isBreak?` break-cell`:``}" data-arena-id="${z(e)}" data-time-slot-id="${z(t.id)}" data-break="${t.isBreak}">
        ${n?`
          <article class="phase-card" draggable="${this.#c===`stages`}" data-placement-id="${z(n.id)}" style="--tournament-color: ${z(n.stage.tournament.color)}">
            <span>${z(n.stage.tournament.name)}</span>
            <strong>${z(n.stage.name??Kr(n.stage.type))}</strong>
            ${this.#c===`stages`?`<button type="button" data-click-action="delete-placement" data-id="${z(n.id)}" aria-label="Delete stage placement" title="Delete stage placement">×</button>`:``}
            ${this.#c===`volunteers`?this.renderAssignmentDropzones(n,`volunteers`):this.#c===`fighters`&&n.stage.type===`POOL`?this.renderAssignmentDropzones(n,`fighters`):``}
          </article>
        `:t.isBreak?`<span>Break</span>`:`<span class="drop-hint">Drag a stage here</span>`}
      </div>
    `}renderVolunteerList(e){let t=new Map;for(let n of e.tournaments)for(let e of n.entries)(e.kind===`VOLUNTEER`||e.kind===`BOTH`)&&t.set(e.userId,{username:e.user.username,skills:e.user.skills});return[...t.entries()].map(([e,t])=>{let n=Rr(t.skills??[]),r=zr(t.username,t.skills??[]);return`
      <button class="volunteer-source" type="button" draggable="true" data-user-id="${z(e)}" data-participant-kind="volunteer" data-tournament-id="" data-volunteer-hover-key="source:${z(e)}">
        <strong>${z(t.username)}</strong>
        ${n?`<div class="volunteer-skills">${n}</div>`:``}
        ${r}
      </button>
    `}).join(``)||`<p class="planner-empty">No volunteers are available for this event.</p>`}renderFighterList(e){let t=this.getAssignedFighterParticipantIds();return e.tournaments.map(e=>{let n=e.entries.filter(e=>(e.kind===`FIGHTER`||e.kind===`BOTH`)&&!t.has(e.userId));return n.length===0?``:`
          <section class="tournament-participants" style="--tournament-color: ${z(e.color)}">
            <h3>${z(e.name)}</h3>
            ${n.map(t=>this.renderFighterSource(t,e.name,e.color)).join(``)}
          </section>
        `}).join(``)||`<p class="planner-empty">No fighters are available for this event.</p>`}renderFighterSource(e,t,n){let r=e.seed===null?``:`Seed ${e.seed}`;return`
      <button class="fighter-source" type="button" draggable="true" data-user-id="${z(e.userId)}" data-participant-kind="fighter" data-tournament-id="${z(e.tournamentId)}" style="--tournament-color: ${z(n)}">
        <span class="fighter-source-dot" aria-hidden="true"></span>
        <span class="fighter-source-text">
          <strong>${z(e.user.username)}</strong>
          <span>${z(t)}${r?` · ${z(r)}`:``}</span>
        </span>
      </button>
    `}renderAssignmentDropzones(e,t){return`<div class="assignment-dropzones">${(t===`fighters`?[`FIGHTER`]:[`JUDGE`,`JURY`,`TABLE`]).map(n=>{let r=e.assignments?.filter(e=>e.role===n)??[],i=n===`FIGHTER`?`Drop contender`:`Drop volunteer`,a=n===`FIGHTER`?`Contenders`:n,o=n===`JURY`?4:n===`FIGHTER`?this.getFighterLimit(e):1;return`<div class="assignment-dropzone" data-assignment-phase-id="${z(e.id)}" data-role="${n}" data-role-limit="${o}"${n===`FIGHTER`?` style="--fighter-slot-count: ${o}"`:``}>
        <div class="assignment-dropzone-header">
          <span>${a}</span>
          ${n===`FIGHTER`?`<span class="assignment-dropzone-count">${r.length}/${o}</span>`:``}
        </div>
        <small class="assignment-dropzone-hint">${i}</small>
        <div class="assignment-volunteers${n===`FIGHTER`?` fighter-assignment-volunteers`:``}">
          ${t===`fighters`?this.renderFighterAssignmentSlots(r,o):r.map(e=>`
            <span class="assignment-volunteer" data-volunteer-hover-key="assignment:${z(e.id)}">${z(e.user.username)}
              <button type="button" data-click-action="delete-assignment" data-id="${z(e.id)}" aria-label="Remove ${z(e.user.username)}" title="Remove ${z(e.user.username)}">×</button>
              ${zr(e.user.username,e.user.skills??[])}
            </span>
          `).join(``)||`<em>${i}</em>`}
        </div>
      </div>`}).join(``)}</div>`}addAssignmentToSchedule(e,t){for(let n of this.#n?.schedule.timeSlots??[]){let r=n.scheduledPhases.find(t=>t.id===e);if(r){r.assignments=[...r.assignments??[],t];return}}}handleDragEnd(){this.#l=!1,this.#u=void 0,this.root.host.toggleAttribute(`data-dragging`,!1),this.clearHoveredVolunteer(),this.clearActiveDropTargets(),this.clearParticipantDropzoneStates()}handleVolunteerMouseOver(e){if(this.#l)return;let t=e.target;if(!(t instanceof Element))return;let n=t.closest(`[data-volunteer-hover-key]`);n&&(this.clearHoveredVolunteer(),n.dataset.hovered=`true`)}handleVolunteerMouseOut(e){if(this.#l)return;let t=e.target;if(!(t instanceof Element))return;let n=t.closest(`[data-volunteer-hover-key]`);if(!n)return;let r=e.relatedTarget;r instanceof Element&&r.closest(`[data-volunteer-hover-key]`)===n||delete n.dataset.hovered}clearHoveredVolunteer(){let e=this.root.querySelector(`[data-volunteer-hover-key][data-hovered='true']`);e&&delete e.dataset.hovered}clearActiveDropTargets(){this.root.querySelectorAll(`[data-drop-active='true']`).forEach(e=>{delete e.dataset.dropActive})}clearParticipantDropzoneStates(){this.root.querySelectorAll(`[data-assignment-phase-id]`).forEach(e=>{delete e.dataset.dropPossible,delete e.dataset.dropReason;let t=e.querySelector(`.assignment-dropzone-hint`);t&&(t.textContent=e.dataset.role===`FIGHTER`?`Drop contender`:`Drop volunteer`)})}updateParticipantDropzoneStates(){this.clearParticipantDropzoneStates();let e=this.#u;if(!(!e||e.kind!==`fighter`||!this.#n))for(let t of this.root.querySelectorAll(`[data-assignment-phase-id][data-role='FIGHTER']`)){let n=this.findScheduledPhase(t.dataset.assignmentPhaseId??``);if(!n)continue;let r=this.getParticipantDropState(n.id,e.userId,`FIGHTER`);t.dataset.dropPossible=String(r.valid),r.valid||(t.dataset.dropReason=r.reason??`Unavailable`);let i=t.querySelector(`.assignment-dropzone-hint`);i&&(i.textContent=r.valid?`Drop contender`:r.reason??`Unavailable`)}}getParticipantDropState(e,t,n){let r=this.findScheduledPhase(e);if(!r)return{valid:!1,reason:`This target is unavailable.`};if(n===`FIGHTER`){let e=this.#u?.userId===t?this.#u.tournamentId:this.findParticipantTournamentId(t);if(!e||r.stage.tournament.id!==e)return{valid:!1,reason:`This contender belongs to a different tournament.`};if(r.assignments.filter(e=>e.role===`FIGHTER`).length>=this.getFighterLimit(r))return{valid:!1,reason:`This contender slot is already full.`}}let i=this.findTimeSlotForScheduledPhase(e);return i?i.scheduledPhases.some(e=>e.assignments.some(e=>e.userId===t))?{valid:!1,reason:`This participant is already booked in that time slot.`}:{valid:!0}:{valid:!1,reason:`This target is unavailable.`}}findScheduledPhase(e){for(let t of this.#n?.schedule.timeSlots??[]){let n=t.scheduledPhases.find(t=>t.id===e);if(n)return n}}findTimeSlotForScheduledPhase(e){return this.#n?.schedule.timeSlots.find(t=>t.scheduledPhases.some(t=>t.id===e))}findParticipantTournamentId(e){for(let t of this.#n?.event.tournaments??[])if(t.entries.some(t=>t.userId===e))return t.id}getFighterLimit(e){return Math.max(1,e.stage.maxPoolSize??e.stage.preferredPoolSize??6)}renderFighterAssignmentSlots(e,t){let n=Math.max(t,e.length);return Array.from({length:n},(t,n)=>{let r=e[n];return r?`
        <span class="fighter-assignment-slot fighter-assignment-slot-filled" data-volunteer-hover-key="assignment:${z(r.id)}">
          <span class="fighter-assignment-slot-name">${z(r.user.username)}</span>
          <button type="button" data-click-action="delete-assignment" data-id="${z(r.id)}" aria-label="Remove ${z(r.user.username)}" title="Remove ${z(r.user.username)}">×</button>
          ${zr(r.user.username,r.user.skills??[])}
        </span>
      `:`<div class="fighter-assignment-slot fighter-assignment-slot-empty"><em>Open slot</em></div>`}).join(``)}getAssignedFighterParticipantIds(){let e=new Set;for(let t of this.#n?.schedule.timeSlots??[])for(let n of t.scheduledPhases)for(let t of n.assignments??[])t.role===`FIGHTER`&&e.add(t.userId);return e}async handleRandomAssignFighters(){let e=this.#n;if(e){this.#d=!0,this.#i=void 0,this.renderPlanner();try{let t=this.getAssignedFighterParticipantIds(),n=this.buildBlockedTimeSlotsByUserId(e.schedule.timeSlots),r=this.shuffle(e.event.tournaments.flatMap(e=>e.entries.filter(e=>(e.kind===`FIGHTER`||e.kind===`BOTH`)&&!t.has(e.userId)).map(t=>({entry:t,tournament:e})))),i=this.buildPoolStates(e.schedule.timeSlots),a=new Map;for(let e of i){let t=a.get(e.tournamentId)??[];t.push(e),a.set(e.tournamentId,t)}for(let e of r){let r=(a.get(e.tournament.id)??[]).filter(t=>t.assignedCount<t.limit&&!(n.get(e.entry.userId)?.has(t.timeSlotId)??!1)).sort((e,t)=>{let n=e.assignedCount<e.preferredCount?0:1,r=t.assignedCount<t.preferredCount?0:1;return n===r?e.assignedCount===t.assignedCount?Math.random()-.5:e.assignedCount-t.assignedCount:n-r})[0];if(!r)continue;let i=await this.#e.createScheduledAssignment(r.scheduledPhaseId,{userId:e.entry.userId,role:`FIGHTER`});this.addAssignmentToSchedule(r.scheduledPhaseId,i),r.assignedCount+=1,t.add(e.entry.userId);let o=n.get(e.entry.userId)??new Set;o.add(r.timeSlotId),n.set(e.entry.userId,o)}await this.load()}catch(e){this.#i=e instanceof Error?e.message:`The fighters could not be assigned.`,this.renderPlanner()}finally{this.#d=!1,this.renderPlanner()}}}buildPoolStates(e){let t=[];for(let n of e)for(let e of n.scheduledPhases){if(e.stage.type!==`POOL`)continue;let n=e.assignments?.filter(e=>e.role===`FIGHTER`).length??0,r=this.getFighterLimit(e),i=Math.max(1,e.stage.preferredPoolSize??r);t.push({scheduledPhaseId:e.id,tournamentId:e.stage.tournament.id,timeSlotId:e.timeSlotId,assignedCount:n,limit:r,preferredCount:i})}return t}buildBlockedTimeSlotsByUserId(e){let t=new Map;for(let n of e)for(let e of n.scheduledPhases)for(let r of e.assignments??[]){let e=t.get(r.userId)??new Set;e.add(n.id),t.set(r.userId,e)}return t}shuffle(e){let t=[...e];for(let e=t.length-1;e>0;--e){let n=Math.floor(Math.random()*(e+1)),r=t[e],i=t[n];t[e]=i,t[n]=r}return t}};function Rr(e){return e.filter(e=>(e.skillName===`JUDGE`||e.skillName===`JURY`)&&e.skillLevel>0).map(e=>{let t=e.skillName===`JUDGE`?`Judge`:`Jury`,n=Array.from({length:e.skillLevel},()=>`&#9733;`).join(``);return`<span class="volunteer-skill"><span class="volunteer-skill-label">${z(t)}</span><span class="volunteer-skill-stars" aria-hidden="true">${n}</span></span>`}).join(``)}function zr(e,t){let n=Rr(t),r=Br(t);return!n&&!r?``:`
    <div class="volunteer-tooltip" role="tooltip">
      <div class="volunteer-tooltip-name">${z(e)}</div>
      ${n?`<div class="volunteer-tooltip-section"><span class="volunteer-tooltip-heading">Skills</span>${n}</div>`:``}
      ${r?`<div class="volunteer-tooltip-section"><span class="volunteer-tooltip-heading">Wensen</span>${r}</div>`:``}
    </div>
  `}function Br(e){return[[`JUDGE`,`Judge`],[`JURY`,`Jury`],[`TABLE`,`Table`]].filter(([t])=>e.some(e=>e.skillName===t)).map(([,e])=>`<span class="volunteer-wish">${z(e)}</span>`).join(``)}function Vr(e,t){let n=e.get(t);if(typeof n!=`string`||n.trim().length===0)throw Error(`${t} is required.`);return n.trim()}function Hr(e,t){let n=e.get(t);return typeof n==`string`&&n.trim().length>0?n.trim():null}function Ur(e,t){let n=Number(e.get(t));if(!Number.isInteger(n)||n<1)throw Error(`${t} must be a positive integer.`);return n}function Wr(e){let t=/^(\d{2}):(\d{2})$/.exec(e);if(!t)throw Error(`Enter a valid start time.`);let n=Number(t[1]),r=Number(t[2]);if(n>23||r>59)throw Error(`Enter a valid start time.`);return n*60+r}function Gr(e){let t=(e%1440+1440)%1440;return`${String(Math.floor(t/60)).padStart(2,`0`)}:${String(t%60).padStart(2,`0`)}`}function Kr(e){switch(e){case`POOL`:return`Pool`;case`ELIMINATION`:return`Elimination`;case`SEMI_FINAL`:return`Semi-final`;case`FINAL`:return`Final`;default:return e}}function z(e){return e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function qr(e){let t=Math.max(1,e.arenas.length);return[...e.tournaments].sort((e,t)=>e.order-t.order||e.name.localeCompare(t.name)).map(n=>Jr(n,t,e.ruleset))}function Jr(e,t,n){let r=e.stages.find(e=>e.type===`POOL`),i=e.stages.find(e=>e.type===`ELIMINATION`||e.type===`SEMI_FINAL`||e.type===`FINAL`),a=e.entries.filter(e=>e.kind!==`VOLUNTEER`).length,o=Yr(r?.ruleset??e.ruleset??n),s=r?.minPoolSize??4,c=r?.maxPoolSize??6,l=r?.preferredPoolSize??5,u=r?.timeBetweenMatchesMinutes??2,d=Math.max(1,Math.ceil((o?.definition?.matchParameters.maxDurationSeconds??180)/60)),f=d+u,p=Zr(Xr(r,i,a),t,f),ee=[];if(r||ee.push(`No pool stage settings were found; default pool limits were used.`),a===0)return ee.push(`No participants are registered yet.`),{tournamentId:e.id,tournamentName:e.name,color:e.color,participantCount:a,poolSizes:[],poolCount:0,waveLengths:[],firstSlotLengthMinutes:0,eliminationLengthMinutes:p,longestSlotMinutes:p,totalMinutes:0,matchBlockMinutes:f,minPoolSize:s,maxPoolSize:c,preferredPoolSize:l,reason:`No participant data is available yet.`,warnings:ee};let m=Qr(a,s,c,l,t,d,u);if(!m){ee.push(`The participant count does not fit the configured pool limits.`);let t=a,n=[t],r=[ti(t,d,u)];return{tournamentId:e.id,tournamentName:e.name,color:e.color,participantCount:a,poolSizes:n,poolCount:n.length,waveLengths:r,firstSlotLengthMinutes:r[0]??0,eliminationLengthMinutes:p,longestSlotMinutes:Math.max(p,...r),totalMinutes:r.reduce((e,t)=>e+t,0)+p,matchBlockMinutes:f,minPoolSize:s,maxPoolSize:c,preferredPoolSize:l,reason:`Fallback to a single pool of ${t}; elimination length ${oi(p)}.`,warnings:ee}}let te=ni(m.sizes.map(e=>ti(e,d,u)),t),ne=te.reduce((e,t)=>e+t,0)+p,re=te[0]??0,ie=Math.max(p,...te),ae=m.sizes[0]??a,oe=m.sizes[m.sizes.length-1]??a;return{tournamentId:e.id,tournamentName:e.name,color:e.color,participantCount:a,poolSizes:m.sizes,poolCount:m.sizes.length,waveLengths:te,firstSlotLengthMinutes:re,eliminationLengthMinutes:p,longestSlotMinutes:ie,totalMinutes:ne,matchBlockMinutes:f,minPoolSize:s,maxPoolSize:c,preferredPoolSize:l,reason:`Balanced across ${m.sizes.length} pools with sizes ${m.sizes.join(`, `)}; elimination length ${oi(p)}.`,warnings:[...m.sizes.some(e=>e<s||e>c)?[`One or more pools fall outside the configured limits.`]:[],...ae===oe?[]:[`Pool sizes vary between ${oe} and ${ae}.`],...ee]}}function Yr(e){return e??null}function Xr(e,t,n){return t?.eliminationParticipantCount!==null&&t?.eliminationParticipantCount!==void 0?t.eliminationParticipantCount:e?.preferredPoolSize!==null&&e?.preferredPoolSize!==void 0?e.preferredPoolSize:Math.min(Math.max(1,n),5)}function Zr(e,t,n){if(e<=1)return 0;let r=e,i=0;for(;r>1;){let e=Math.floor(r/2);e>0&&(i+=Math.ceil(e/t)*n),r=Math.ceil(r/2)}return ai(i)}function Qr(e,t,n,r,i,a,o){if(e<t)return;let s=Math.ceil(e/n),c=Math.floor(e/t),l;for(let u=s;u<=c;u+=1){let s=$r(e,u,t,n,r);if(!s)continue;let c=s.reduce((e,t)=>e+Math.abs(t-r),0),d=Math.max(...s)-Math.min(...s),f={sizes:s,totalMinutes:ei(s,i,a,o),deviation:c,spread:d};if(!l){l=f;continue}let p=[l.totalMinutes,l.deviation,l.spread,l.sizes.length];ri([f.totalMinutes,f.deviation,f.spread,f.sizes.length],p)<0&&(l=f)}return l?{sizes:l.sizes}:void 0}function $r(e,t,n,r,i){if(e<t*n||e>t*r)return;let a=ii(i,n,r),o=Array.from({length:t},()=>a),s=e-a*t;if(s>0)for(;s>0;){let e=!1;for(let t=0;t<o.length&&s>0;t+=1){let n=o[t];n===void 0||n>=r||(o[t]=n+1,--s,e=!0)}if(!e)return}else if(s<0)for(;s<0;){let e=!1;for(let t=o.length-1;t>=0&&s<0;--t){let r=o[t];r===void 0||r<=n||(o[t]=r-1,s+=1,e=!0)}if(!e)return}return o.sort((e,t)=>t-e)}function ei(e,t,n,r){return ni(e.map(e=>ti(e,n,r)),t).reduce((e,t)=>e+t,0)}function ti(e,t,n){let r=e*(e-1)/2;if(r<=0)return 0;let i=r*t+Math.max(0,r-1)*n;return ai(Math.max(t+n,i))}function ni(e,t){if(e.length===0)return[];let n=[...e].sort((e,t)=>t-e),r=[];for(let e=0;e<n.length;e+=t)r.push(Math.max(...n.slice(e,e+t)));return r}function ri(e,t){for(let n=0;n<Math.max(e.length,t.length);n+=1){let r=(e[n]??0)-(t[n]??0);if(r!==0)return r}return 0}function ii(e,t,n){return Math.max(t,Math.min(n,e))}function ai(e){return Math.ceil(e/5)*5}function oi(e){if(e<=0)return`0 min`;let t=Math.floor(e/60),n=e%60;return t===0?`${e} min`:n===0?`${t} h`:`${t} h ${n} min`}customElements.get(`event-planner-view`)||customElements.define(`event-planner-view`,Lr);var si=`:host {
  display: block;
  height: 100%;
}

.competition-selector-view {
  background: var(--hema-bg);
  box-sizing: border-box;
  color: var(--hema-text);
  min-height: 100%;
  padding: 32px 20px;
}

header,
main {
  margin: 0 auto;
  max-width: 480px;
}

header {
  border-bottom: 1px solid var(--hema-line);
  margin-bottom: 28px;
  padding-bottom: 24px;
}

header p,
header h1 {
  font-family: var(--hema-font-display);
  text-transform: uppercase;
}

header p {
  color: var(--hema-text-dim);
  font-size: 12px;
  letter-spacing: 0.16em;
  margin: 0 0 8px;
}

header h1 {
  font-size: 26px;
  letter-spacing: 0.06em;
  margin: 0;
}

.message {
  color: var(--hema-text-dim);
  font-size: 14px;
  margin-bottom: 14px;
}

.message.is-error {
  color: var(--hema-danger);
}

.competition-list {
  display: grid;
  gap: 10px;
}

.competition-button {
  background: var(--hema-surface);
  border: 1px solid var(--hema-line);
  border-radius: var(--hema-radius);
  color: var(--hema-text);
  font-family: var(--hema-font-ui);
  padding: 14px 16px;
  text-align: left;
  width: 100%;
}

.competition-button:hover,
.competition-button:focus-visible {
  border-color: var(--hema-left-color);
  outline: none;
}

.competition-button strong,
.competition-button span {
  display: block;
}

.competition-button strong {
  font-size: 16px;
}

.competition-button span {
  color: var(--hema-text-dim);
  font-size: 12px;
  margin-top: 4px;
}
`,ci=`<div class="competition-selector-view">
  <header>
    <p>Competition</p>
    <h1>Choose a competition</h1>
  </header>
  <main>
    <div id="message" class="message"></div>
    <div id="competition-list" class="competition-list"></div>
  </main>
</div>
`,li=class extends n{#e={loading:!0,error:null,competitions:[]};connectedCallback(){this.#t()}disconnectedCallback(){super.disconnectedCallback()}configure(e){this.#e=e,this.#t()}#t(){this.render(si,ci);let e=this.queryRoot(`#message`),t=this.queryRoot(`#competition-list`);if(t.replaceChildren(),e.textContent=``,e.classList.remove(`is-error`),this.#e.loading){e.textContent=`Loading competitions...`;return}if(this.#e.error){e.textContent=this.#e.error,e.classList.add(`is-error`);return}if(this.#e.competitions.length===0){e.textContent=`No competitions are available yet.`;return}for(let e of this.#e.competitions){let n=document.createElement(`button`);n.type=`button`,n.className=`competition-button`;let r=document.createElement(`strong`);r.textContent=e.name;let i=document.createElement(`span`);i.textContent=`${e.startDate} – ${e.endDate}`,n.append(r,i),this.registerEvent(n,`click`,()=>{this.dispatchEvent(new CustomEvent(`competition-selected`,{bubbles:!0,detail:{competitionId:e.id}}))}),t.append(n)}}};customElements.get(`competition-selector-view`)||customElements.define(`competition-selector-view`,li);var ui=`:host {
  display: block;
  height: 100%;
}

.ranking-view {
  background: var(--hema-bg);
  box-sizing: border-box;
  color: var(--hema-text);
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 32px 20px 96px;
}

header,
main {
  margin: 0 auto;
  max-width: 480px;
  width: 100%;
}

header {
  border-bottom: 1px solid var(--hema-line);
  margin-bottom: 28px;
  padding-bottom: 24px;
}

.header-nav {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
}

.header-nav-actions {
  align-items: center;
  display: flex;
  gap: 16px;
}

.back-button,
.tab-button,
.refresh-button {
  background: none;
  border: none;
  color: var(--hema-text-dim);
  cursor: pointer;
  font-family: var(--hema-font-ui);
  font-size: 13px;
  padding: 0;
}

.tab-button {
  color: var(--hema-left-color);
}

.back-button:hover,
.back-button:focus-visible,
.tab-button:hover,
.tab-button:focus-visible,
.refresh-button:hover,
.refresh-button:focus-visible {
  color: var(--hema-text);
  outline: none;
}

.refresh-button:disabled {
  cursor: default;
  opacity: 0.5;
}

header p,
header h1 {
  font-family: var(--hema-font-display);
  text-transform: uppercase;
}

header p {
  color: var(--hema-text-dim);
  font-size: 12px;
  letter-spacing: 0.16em;
  margin: 0 0 8px;
}

header h1 {
  font-size: 26px;
  letter-spacing: 0.06em;
  margin: 0;
}

.message {
  color: var(--hema-text-dim);
  font-size: 14px;
  margin-bottom: 14px;
}

.message.is-error {
  color: var(--hema-danger);
}

.ranking-list {
  display: grid;
  gap: 8px;
}

.ranking-row {
  align-items: center;
  background: var(--hema-surface);
  border: 1px solid var(--hema-line);
  border-radius: var(--hema-radius);
  color: var(--hema-text);
  display: grid;
  font-family: var(--hema-font-ui);
  gap: 12px;
  grid-template-columns: 40px 1fr auto;
  padding: 12px 16px;
  text-align: left;
  width: 100%;
}

.ranking-row:hover,
.ranking-row:focus-visible {
  border-color: var(--hema-left-color);
  outline: none;
}

.ranking-position,
.ranking-rating {
  color: var(--hema-text-dim);
  font-family: var(--hema-font-display);
  font-size: 13px;
}

footer {
  bottom: 0;
  box-sizing: border-box;
  left: 0;
  padding: 16px 20px;
  position: fixed;
  width: 100%;
}

.primary-button {
  background: var(--hema-left-color);
  border: none;
  border-radius: var(--hema-radius);
  color: #071a0d;
  font-family: var(--hema-font-ui);
  font-size: 14px;
  font-weight: 600;
  padding: 14px 16px;
}

.primary-button:hover,
.primary-button:focus-visible {
  filter: brightness(1.1);
  outline: none;
}

.new-bout-button {
  display: block;
  margin: 0 auto;
  max-width: 480px;
  width: 100%;
}
`,di=`<div class="ranking-view">
  <header>
    <div class="header-nav">
      <button id="back-button" type="button" class="back-button">← Back</button>
      <div class="header-nav-actions">
        <button id="refresh-button" type="button" class="refresh-button">⟳ Refresh</button>
        <button id="view-participants-button" type="button" class="tab-button">Participants →</button>
      </div>
    </div>
    <p>Ranking</p>
    <h1 id="competition-name"></h1>
  </header>
  <main>
    <div id="message" class="message"></div>
    <div id="ranking-list" class="ranking-list"></div>
  </main>
  <footer>
    <button id="new-bout-button" type="button" class="primary-button new-bout-button">New bout</button>
  </footer>
</div>
`,fi=class extends n{#e={loading:!0,error:null,competitionName:``,entries:[]};connectedCallback(){this.#t()}disconnectedCallback(){super.disconnectedCallback()}configure(e){this.#e=e,this.#t()}#t(){this.render(ui,di),this.queryRoot(`#competition-name`).textContent=this.#e.competitionName,this.registerEvent(this.queryRoot(`#back-button`),`click`,()=>{this.dispatchEvent(new CustomEvent(`back-requested`,{bubbles:!0}))}),this.registerEvent(this.queryRoot(`#view-participants-button`),`click`,()=>{this.dispatchEvent(new CustomEvent(`view-participants-requested`,{bubbles:!0}))});let e=this.queryRoot(`#refresh-button`);e.disabled=this.#e.loading,this.registerEvent(e,`click`,()=>{this.dispatchEvent(new CustomEvent(`refresh-requested`,{bubbles:!0}))}),this.registerEvent(this.queryRoot(`#new-bout-button`),`click`,()=>{this.dispatchEvent(new CustomEvent(`new-bout-requested`,{bubbles:!0}))});let t=this.queryRoot(`#message`),n=this.queryRoot(`#ranking-list`);if(n.replaceChildren(),t.textContent=``,t.classList.remove(`is-error`),this.#e.loading){t.textContent=`Loading ranking...`;return}if(this.#e.error){t.textContent=this.#e.error,t.classList.add(`is-error`);return}if(this.#e.entries.length===0){t.textContent=`No ranked participants yet.`;return}for(let e of this.#e.entries){let t=document.createElement(`button`);t.type=`button`,t.className=`ranking-row`;let r=document.createElement(`span`);r.className=`ranking-position`,r.textContent=`#${e.position}`;let i=document.createElement(`strong`);i.textContent=e.name;let a=document.createElement(`span`);a.className=`ranking-rating`,a.textContent=String(e.rating),t.append(r,i,a),this.registerEvent(t,`click`,()=>{this.dispatchEvent(new CustomEvent(`participant-selected`,{bubbles:!0,detail:{participantId:e.participantId}}))}),n.append(t)}}};customElements.get(`ranking-view`)||customElements.define(`ranking-view`,fi);var pi=`:host {
  display: block;
  height: 100%;
}

.participants-view {
  background: var(--hema-bg);
  box-sizing: border-box;
  color: var(--hema-text);
  min-height: 100%;
  padding: 32px 20px;
}

header,
main {
  margin: 0 auto;
  max-width: 480px;
}

header {
  border-bottom: 1px solid var(--hema-line);
  margin-bottom: 28px;
  padding-bottom: 24px;
}

.header-nav {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
}

.header-nav-actions {
  align-items: center;
  display: flex;
  gap: 16px;
}

.back-button,
.tab-button,
.refresh-button {
  background: none;
  border: none;
  color: var(--hema-text-dim);
  cursor: pointer;
  font-family: var(--hema-font-ui);
  font-size: 13px;
  padding: 0;
}

.tab-button {
  color: var(--hema-left-color);
}

.back-button:hover,
.back-button:focus-visible,
.tab-button:hover,
.tab-button:focus-visible,
.refresh-button:hover,
.refresh-button:focus-visible {
  color: var(--hema-text);
  outline: none;
}

.refresh-button:disabled {
  cursor: default;
  opacity: 0.5;
}

header p,
header h1 {
  font-family: var(--hema-font-display);
  text-transform: uppercase;
}

header p {
  color: var(--hema-text-dim);
  font-size: 12px;
  letter-spacing: 0.16em;
  margin: 0 0 8px;
}

header h1 {
  font-size: 26px;
  letter-spacing: 0.06em;
  margin: 0;
}

.form-section {
  background: var(--hema-surface);
  border: 1px solid var(--hema-line);
  border-radius: var(--hema-radius);
  margin-bottom: 20px;
  padding: 16px;
}

.form-section h2 {
  font-family: var(--hema-font-display);
  font-size: 13px;
  letter-spacing: 0.1em;
  margin: 0 0 8px;
  text-transform: uppercase;
}

.hint {
  color: var(--hema-text-dim);
  font-size: 13px;
  margin: 0 0 12px;
}

.form-row {
  display: flex;
  gap: 10px;
}

.form-row input {
  background: var(--hema-surface-raised);
  border: 1px solid var(--hema-line);
  border-radius: var(--hema-radius);
  color: var(--hema-text);
  flex: 1;
  font-family: var(--hema-font-ui);
  font-size: 14px;
  padding: 10px 12px;
}

.form-row input:focus-visible {
  border-color: var(--hema-left-color);
  outline: none;
}

.primary-button {
  background: var(--hema-left-color);
  border: none;
  border-radius: var(--hema-radius);
  color: #071a0d;
  font-family: var(--hema-font-ui);
  font-size: 14px;
  font-weight: 600;
  padding: 10px 16px;
}

.primary-button:hover,
.primary-button:focus-visible {
  filter: brightness(1.1);
  outline: none;
}

.message {
  color: var(--hema-text-dim);
  font-size: 14px;
  margin-bottom: 14px;
}

.message.is-error {
  color: var(--hema-danger);
}

.participant-list {
  display: grid;
  gap: 8px;
  margin-bottom: 20px;
}

.participant-row {
  align-items: center;
  background: var(--hema-surface);
  border: 1px solid var(--hema-line);
  border-radius: var(--hema-radius);
  color: var(--hema-text);
  display: flex;
  font-family: var(--hema-font-ui);
  justify-content: space-between;
  padding: 12px 16px;
  text-align: left;
  width: 100%;
}

.participant-row:hover,
.participant-row:focus-visible {
  border-color: var(--hema-left-color);
  outline: none;
}

.participant-row.is-me {
  border-color: var(--hema-left-color);
}

.me-badge {
  background: var(--hema-left-color);
  border-radius: 999px;
  color: #071a0d;
  font-family: var(--hema-font-display);
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 2px 8px;
  text-transform: uppercase;
}
`,mi=`<div class="participants-view">
  <header>
    <div class="header-nav">
      <button id="back-button" type="button" class="back-button">← Back</button>
      <div class="header-nav-actions">
        <button id="refresh-button" type="button" class="refresh-button">⟳ Refresh</button>
        <button id="view-ranking-button" type="button" class="tab-button">Ranking →</button>
      </div>
    </div>
    <p>Participants</p>
    <h1 id="competition-name"></h1>
  </header>
  <main>
    <section id="register-self-section" class="form-section" hidden>
      <h2>Register yourself</h2>
      <p class="hint">Pick a name so this competition remembers who you are.</p>
      <div class="form-row">
        <input id="register-self-input" type="text" placeholder="Your name" autocomplete="off" />
        <button id="register-self-button" type="button" class="primary-button">Register</button>
      </div>
    </section>

    <p id="submit-error" class="message is-error" hidden></p>
    <div id="message" class="message"></div>
    <div id="participant-list" class="participant-list"></div>

    <section class="form-section">
      <h2>Add a participant</h2>
      <div class="form-row">
        <input id="add-participant-input" type="text" placeholder="Participant name" autocomplete="off" />
        <button id="add-participant-button" type="button" class="primary-button">Add</button>
      </div>
    </section>
  </main>
</div>
`,hi=class extends n{#e={loading:!0,error:null,competitionName:``,participants:[],canRegisterSelf:!1};#t=!1;#n=null;#r;#i;#a;connectedCallback(){this.#s()}disconnectedCallback(){super.disconnectedCallback()}configure(e){this.#e=e,this.#t=!1,this.#n=null,this.#s()}setSubmitting(e){this.#t=e,this.#o()}setSubmitError(e){this.#n=e,this.#o()}#o(){this.#r&&(this.#r.disabled=this.#t),this.#i&&(this.#i.disabled=this.#t),this.#a&&(this.#a.textContent=this.#n??``,this.#a.hidden=!this.#n)}#s(){this.render(pi,mi),this.queryRoot(`#competition-name`).textContent=this.#e.competitionName,this.registerEvent(this.queryRoot(`#back-button`),`click`,()=>{this.dispatchEvent(new CustomEvent(`back-requested`,{bubbles:!0}))}),this.registerEvent(this.queryRoot(`#view-ranking-button`),`click`,()=>{this.dispatchEvent(new CustomEvent(`view-ranking-requested`,{bubbles:!0}))});let e=this.queryRoot(`#refresh-button`);e.disabled=this.#e.loading,this.registerEvent(e,`click`,()=>{this.dispatchEvent(new CustomEvent(`refresh-requested`,{bubbles:!0}))});let t=this.queryRoot(`#register-self-section`);t.hidden=!this.#e.canRegisterSelf;let n=this.queryRoot(`#register-self-input`);this.#i=this.queryRoot(`#register-self-button`),this.registerEvent(this.#i,`click`,()=>{if(this.#t)return;let e=n.value.trim();e&&(this.dispatchEvent(new CustomEvent(`self-register-requested`,{bubbles:!0,detail:{name:e}})),n.value=``)});let r=this.queryRoot(`#add-participant-input`);this.#r=this.queryRoot(`#add-participant-button`),this.registerEvent(this.#r,`click`,()=>{if(this.#t)return;let e=r.value.trim();e&&(this.dispatchEvent(new CustomEvent(`participant-add-requested`,{bubbles:!0,detail:{name:e}})),r.value=``)}),this.#a=this.queryRoot(`#submit-error`),this.#o();let i=this.queryRoot(`#message`),a=this.queryRoot(`#participant-list`);if(a.replaceChildren(),i.textContent=``,i.classList.remove(`is-error`),this.#e.loading){i.textContent=`Loading participants...`;return}if(this.#e.error){i.textContent=this.#e.error,i.classList.add(`is-error`);return}this.#e.participants.length===0&&(i.textContent=`No participants yet — add the first one below.`);for(let e of this.#e.participants){let t=document.createElement(`button`);t.type=`button`,t.className=`participant-row`,t.classList.toggle(`is-me`,e.isMe);let n=document.createElement(`strong`);if(n.textContent=e.name,t.append(n),e.isMe){let e=document.createElement(`span`);e.className=`me-badge`,e.textContent=`You`,t.append(e)}this.registerEvent(t,`click`,()=>{this.dispatchEvent(new CustomEvent(`participant-selected`,{bubbles:!0,detail:{participantId:e.id}}))}),a.append(t)}}};customElements.get(`participants-view`)||customElements.define(`participants-view`,hi);var gi=`:host {
  display: block;
  height: 100%;
}

.bouts-view {
  background: var(--hema-bg);
  box-sizing: border-box;
  color: var(--hema-text);
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 32px 20px 96px;
}

header,
main {
  margin: 0 auto;
  max-width: 480px;
  width: 100%;
}

header {
  border-bottom: 1px solid var(--hema-line);
  margin-bottom: 28px;
  padding-bottom: 24px;
}

.back-button {
  background: none;
  border: none;
  color: var(--hema-text-dim);
  cursor: pointer;
  display: block;
  font-family: var(--hema-font-ui);
  font-size: 13px;
  margin: 0 0 14px;
  padding: 0;
}

.back-button:hover,
.back-button:focus-visible {
  color: var(--hema-text);
  outline: none;
}

header p,
header h1 {
  font-family: var(--hema-font-display);
  text-transform: uppercase;
}

header p {
  color: var(--hema-text-dim);
  font-size: 12px;
  letter-spacing: 0.16em;
  margin: 0 0 8px;
}

header h1 {
  font-size: 26px;
  letter-spacing: 0.06em;
  margin: 0;
}

.message {
  color: var(--hema-text-dim);
  font-size: 14px;
  margin-bottom: 14px;
}

.message.is-error {
  color: var(--hema-danger);
}

.bout-list {
  display: grid;
  gap: 8px;
}

.bout-row {
  background: var(--hema-surface);
  border: 1px solid var(--hema-line);
  border-left-width: 4px;
  border-radius: var(--hema-radius);
  color: var(--hema-text);
  display: grid;
  font-family: var(--hema-font-ui);
  gap: 4px;
  padding: 12px 16px;
  text-align: left;
  width: 100%;
}

.bout-row:hover,
.bout-row:focus-visible {
  outline: none;
}

.bout-row-win {
  border-left-color: var(--hema-left-color);
}

.bout-row-loss {
  border-left-color: var(--hema-danger);
}

.bout-row-draw {
  border-left-color: var(--hema-text-dim);
}

.bout-score,
.bout-date {
  color: var(--hema-text-dim);
  font-family: var(--hema-font-display);
  font-size: 12px;
}

footer {
  bottom: 0;
  box-sizing: border-box;
  left: 0;
  padding: 16px 20px;
  position: fixed;
  width: 100%;
}

.primary-button {
  background: var(--hema-left-color);
  border: none;
  border-radius: var(--hema-radius);
  color: #071a0d;
  font-family: var(--hema-font-ui);
  font-size: 14px;
  font-weight: 600;
  padding: 14px 16px;
}

.primary-button:hover,
.primary-button:focus-visible {
  filter: brightness(1.1);
  outline: none;
}

.new-bout-button {
  display: block;
  margin: 0 auto;
  max-width: 480px;
  width: 100%;
}
`,_i=`<div class="bouts-view">
  <header>
    <button id="back-button" type="button" class="back-button">← Back</button>
    <p>Bouts</p>
    <h1 id="participant-name"></h1>
  </header>
  <main>
    <div id="message" class="message"></div>
    <div id="bout-list" class="bout-list"></div>
  </main>
  <footer>
    <button id="new-bout-button" type="button" class="primary-button new-bout-button">New bout</button>
  </footer>
</div>
`,vi=class extends n{#e={loading:!0,error:null,participantName:``,bouts:[]};connectedCallback(){this.#t()}disconnectedCallback(){super.disconnectedCallback()}configure(e){this.#e=e,this.#t()}#t(){this.render(gi,_i),this.queryRoot(`#participant-name`).textContent=this.#e.participantName,this.registerEvent(this.queryRoot(`#back-button`),`click`,()=>{this.dispatchEvent(new CustomEvent(`back-requested`,{bubbles:!0}))}),this.registerEvent(this.queryRoot(`#new-bout-button`),`click`,()=>{this.dispatchEvent(new CustomEvent(`new-bout-requested`,{bubbles:!0}))});let e=this.queryRoot(`#message`),t=this.queryRoot(`#bout-list`);if(t.replaceChildren(),e.textContent=``,e.classList.remove(`is-error`),this.#e.loading){e.textContent=`Loading bouts...`;return}if(this.#e.error){e.textContent=this.#e.error,e.classList.add(`is-error`);return}if(this.#e.bouts.length===0){e.textContent=`No bouts recorded yet.`;return}for(let e of this.#e.bouts){let n=document.createElement(`button`);n.type=`button`,n.className=`bout-row bout-row-${e.result}`;let r=document.createElement(`strong`);r.textContent=`vs ${e.opponentName}`;let i=document.createElement(`span`);i.className=`bout-score`,i.textContent=`${e.scoreForParticipant} – ${e.scoreForOpponent}`;let a=document.createElement(`span`);a.className=`bout-date`,a.textContent=e.date,n.append(r,i,a),this.registerEvent(n,`click`,()=>{this.dispatchEvent(new CustomEvent(`bout-selected`,{bubbles:!0,detail:{boutId:e.id}}))}),t.append(n)}}};customElements.get(`bouts-view`)||customElements.define(`bouts-view`,vi);var yi=`:host {
  display: block;
  height: 100%;
}

.bout-details-view {
  background: var(--hema-bg);
  box-sizing: border-box;
  color: var(--hema-text);
  min-height: 100%;
  padding: 32px 20px;
}

header,
main {
  margin: 0 auto;
  max-width: 480px;
}

header {
  border-bottom: 1px solid var(--hema-line);
  margin-bottom: 28px;
  padding-bottom: 24px;
}

.back-button {
  background: none;
  border: none;
  color: var(--hema-text-dim);
  cursor: pointer;
  display: block;
  font-family: var(--hema-font-ui);
  font-size: 13px;
  margin: 0 0 14px;
  padding: 0;
}

.back-button:hover,
.back-button:focus-visible {
  color: var(--hema-text);
  outline: none;
}

header p,
header h1 {
  font-family: var(--hema-font-display);
  text-transform: uppercase;
}

header p {
  color: var(--hema-text-dim);
  font-size: 12px;
  letter-spacing: 0.16em;
  margin: 0 0 8px;
}

header h1 {
  font-size: 26px;
  letter-spacing: 0.06em;
  margin: 0;
}

.message {
  color: var(--hema-text-dim);
  font-size: 14px;
  margin-bottom: 14px;
}

.message.is-error {
  color: var(--hema-danger);
}

.summary {
  background: var(--hema-surface);
  border: 1px solid var(--hema-line);
  border-radius: var(--hema-radius);
  padding: 20px;
  text-align: center;
}

.date {
  color: var(--hema-text-dim);
  font-family: var(--hema-font-display);
  font-size: 12px;
  letter-spacing: 0.08em;
  margin: 0 0 16px;
  text-transform: uppercase;
}

.score-row {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr auto 1fr;
}

.fighter strong {
  display: block;
  font-size: 16px;
  margin-bottom: 6px;
}

.fighter strong.is-winner {
  color: var(--hema-left-color);
}

.fighter .score {
  font-family: var(--hema-font-display);
  font-size: 28px;
}

.versus {
  color: var(--hema-text-dim);
  font-family: var(--hema-font-display);
  font-size: 12px;
  text-transform: uppercase;
}

.winner {
  color: var(--hema-text-dim);
  font-size: 13px;
  margin: 16px 0 0;
}
`,bi=`<div class="bout-details-view">
  <header>
    <button id="back-button" type="button" class="back-button">← Back</button>
    <p>Bout</p>
    <h1>Bout details</h1>
  </header>
  <main>
    <div id="message" class="message"></div>
    <section id="summary" class="summary" hidden>
      <p id="date" class="date"></p>
      <div class="score-row">
        <div class="fighter">
          <strong id="fighter-a-name"></strong>
          <span id="score-a" class="score"></span>
        </div>
        <span class="versus">vs</span>
        <div class="fighter">
          <strong id="fighter-b-name"></strong>
          <span id="score-b" class="score"></span>
        </div>
      </div>
      <p id="winner" class="winner"></p>
    </section>
  </main>
</div>
`,xi=class extends n{#e={loading:!0,error:null,bout:null};connectedCallback(){this.#t()}disconnectedCallback(){super.disconnectedCallback()}configure(e){this.#e=e,this.#t()}#t(){this.render(yi,bi),this.registerEvent(this.queryRoot(`#back-button`),`click`,()=>{this.dispatchEvent(new CustomEvent(`back-requested`,{bubbles:!0}))});let e=this.queryRoot(`#message`),t=this.queryRoot(`#summary`);if(e.textContent=``,e.classList.remove(`is-error`),t.hidden=!0,this.#e.loading){e.textContent=`Loading bout...`;return}if(this.#e.error){e.textContent=this.#e.error,e.classList.add(`is-error`);return}let n=this.#e.bout;if(!n){e.textContent=`Bout not found.`;return}t.hidden=!1;let r=this.queryRoot(`#fighter-a-name`),i=this.queryRoot(`#fighter-b-name`);r.textContent=n.fighterAName,i.textContent=n.fighterBName,this.queryRoot(`#score-a`).textContent=String(n.scoreA),this.queryRoot(`#score-b`).textContent=String(n.scoreB),this.queryRoot(`#date`).textContent=n.date,this.queryRoot(`#winner`).textContent=n.winnerName?`Winner: ${n.winnerName}`:`Draw`,r.classList.toggle(`is-winner`,n.winnerName===n.fighterAName),i.classList.toggle(`is-winner`,n.winnerName===n.fighterBName)}};customElements.get(`bout-details-view`)||customElements.define(`bout-details-view`,xi);var Si=`:host {
  display: block;
  height: 100%;
}

.new-bout-view {
  background: var(--hema-bg);
  box-sizing: border-box;
  color: var(--hema-text);
  min-height: 100%;
  padding: 32px 20px;
}

header,
main {
  margin: 0 auto;
  max-width: 480px;
}

header {
  border-bottom: 1px solid var(--hema-line);
  margin-bottom: 28px;
  padding-bottom: 24px;
}

.back-button {
  background: none;
  border: none;
  color: var(--hema-text-dim);
  cursor: pointer;
  display: block;
  font-family: var(--hema-font-ui);
  font-size: 13px;
  margin: 0 0 14px;
  padding: 0;
}

.back-button:hover,
.back-button:focus-visible {
  color: var(--hema-text);
  outline: none;
}

header p,
header h1 {
  font-family: var(--hema-font-display);
  text-transform: uppercase;
}

header p {
  color: var(--hema-text-dim);
  font-size: 12px;
  letter-spacing: 0.16em;
  margin: 0 0 8px;
}

header h1 {
  font-size: 26px;
  letter-spacing: 0.06em;
  margin: 0;
}

.field-grid {
  display: grid;
  gap: 16px;
  margin-bottom: 20px;
}

.field {
  display: grid;
  gap: 6px;
}

.field span {
  color: var(--hema-text-dim);
  font-family: var(--hema-font-display);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.field select {
  background: var(--hema-surface);
  border: 1px solid var(--hema-line);
  border-radius: var(--hema-radius);
  color: var(--hema-text);
  font-family: var(--hema-font-ui);
  font-size: 15px;
  padding: 10px 12px;
}

.field select:focus-visible {
  border-color: var(--hema-left-color);
  outline: none;
}

.message {
  color: var(--hema-text-dim);
  font-size: 14px;
  margin-bottom: 14px;
}

.message.is-error {
  color: var(--hema-danger);
}

.primary-button {
  background: var(--hema-left-color);
  border: none;
  border-radius: var(--hema-radius);
  color: #071a0d;
  font-family: var(--hema-font-ui);
  font-size: 15px;
  font-weight: 600;
  padding: 14px 16px;
  width: 100%;
}

.primary-button:hover,
.primary-button:focus-visible {
  filter: brightness(1.1);
  outline: none;
}

.primary-button:disabled {
  filter: none;
  opacity: 0.5;
}
`,Ci=`<div class="new-bout-view">
  <header>
    <button id="back-button" type="button" class="back-button">← Back</button>
    <p>New bout</p>
    <h1>Choose two participants</h1>
  </header>
  <main>
    <div class="field-grid">
      <label class="field">
        <span>Fighter A</span>
        <select id="fighter-a-select"></select>
      </label>
      <label class="field">
        <span>Fighter B</span>
        <select id="fighter-b-select"></select>
      </label>
    </div>
    <div id="message" class="message"></div>
    <button id="create-button" type="button" class="primary-button">Start bout</button>
  </main>
</div>
`,wi=class extends n{#e={participants:[],preselectedParticipantId:null};connectedCallback(){this.#t()}disconnectedCallback(){super.disconnectedCallback()}configure(e){this.#e=e,this.#t()}#t(){this.render(Si,Ci),this.registerEvent(this.queryRoot(`#back-button`),`click`,()=>{this.dispatchEvent(new CustomEvent(`back-requested`,{bubbles:!0}))});let e=this.queryRoot(`#fighter-a-select`),t=this.queryRoot(`#fighter-b-select`),n=this.queryRoot(`#create-button`),r=this.queryRoot(`#message`);e.replaceChildren(),t.replaceChildren(),r.textContent=``,r.classList.remove(`is-error`);let i=this.#e.preselectedParticipantId;for(let n of[e,t])for(let e of this.#e.participants){let t=document.createElement(`option`);t.value=e.id,t.textContent=e.name,n.append(t)}let a=i??this.#e.participants[0]?.id,o=this.#e.participants.find(e=>e.id!==a);a&&(e.value=a),o&&(t.value=o.id);let s=this.#e.participants.length>=2;e.disabled=!s,t.disabled=!s,n.disabled=!s,s||(r.textContent=`Add at least two participants before creating a bout.`),this.registerEvent(n,`click`,()=>{let n=e.value,i=t.value;if(!(!n||!i)){if(n===i){r.textContent=`Choose two different participants.`,r.classList.add(`is-error`);return}this.dispatchEvent(new CustomEvent(`bout-create-requested`,{bubbles:!0,detail:{fighterAId:n,fighterBId:i}}))}})}};customElements.get(`new-bout-view`)||customElements.define(`new-bout-view`,wi);var Ti=`:host {
  display: block;
  height: 100%;
}

.match-publish-view {
  background: var(--hema-bg);
  box-sizing: border-box;
  color: var(--hema-text);
  min-height: 100%;
  padding: 32px 20px;
}

header,
main {
  margin: 0 auto;
  max-width: 480px;
}

header {
  border-bottom: 1px solid var(--hema-line);
  margin-bottom: 28px;
  padding-bottom: 24px;
}

header p,
header h1 {
  font-family: var(--hema-font-display);
  text-transform: uppercase;
}

header p {
  color: var(--hema-text-dim);
  font-size: 12px;
  letter-spacing: 0.16em;
  margin: 0 0 8px;
}

header h1 {
  font-size: 26px;
  letter-spacing: 0.06em;
  margin: 0;
}

.summary {
  background: var(--hema-surface);
  border: 1px solid var(--hema-line);
  border-radius: var(--hema-radius);
  margin-bottom: 20px;
  padding: 20px;
  text-align: center;
}

.score-row {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr auto 1fr;
}

.fighter strong {
  display: block;
  font-size: 16px;
  margin-bottom: 6px;
}

.fighter .score {
  font-family: var(--hema-font-display);
  font-size: 28px;
}

.versus {
  color: var(--hema-text-dim);
  font-family: var(--hema-font-display);
  font-size: 12px;
  text-transform: uppercase;
}

.winner {
  color: var(--hema-text-dim);
  font-size: 13px;
  margin: 16px 0 0;
}

.message {
  font-size: 14px;
  margin: 0 0 14px;
}

.message.is-error {
  color: var(--hema-danger);
}

.message[hidden] {
  display: none;
}

.actions {
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr 1fr;
}

.secondary-button {
  background: var(--hema-surface);
  border: 1px solid var(--hema-line);
  border-radius: var(--hema-radius);
  color: var(--hema-text);
  font-family: var(--hema-font-ui);
  font-size: 15px;
  font-weight: 600;
  padding: 14px 16px;
}

.secondary-button:hover,
.secondary-button:focus-visible {
  border-color: var(--hema-danger);
  outline: none;
}
`,Ei=`<div class="match-publish-view">
  <header>
    <p>Bout finished</p>
    <h1>Review the result</h1>
  </header>
  <main>
    <section class="summary">
      <div class="score-row">
        <div class="fighter">
          <strong id="fighter-a-name"></strong>
          <span id="score-a" class="score"></span>
        </div>
        <span class="versus">vs</span>
        <div class="fighter">
          <strong id="fighter-b-name"></strong>
          <span id="score-b" class="score"></span>
        </div>
      </div>
      <p id="winner" class="winner"></p>
    </section>
    <p id="error-message" class="message is-error" hidden></p>
    <div class="actions">
      <button id="decline-button" type="button" class="secondary-button">Decline</button>
      <confirm-button label="Publish" confirm-label="Tap again to publish"></confirm-button>
    </div>
  </main>
</div>
`,Di=class extends n{#e={fighterAName:``,fighterBName:``,scoreA:0,scoreB:0,winnerName:null};#t=!1;#n=null;#r;#i;#a;connectedCallback(){this.#s()}disconnectedCallback(){super.disconnectedCallback()}configure(e){this.#e=e,this.#t=!1,this.#n=null,this.#s()}setPublishing(e){this.#t=e,this.#o()}setError(e){this.#n=e,this.#o()}#o(){this.#r?.toggleAttribute(`disabled`,this.#t),this.#i&&(this.#i.disabled=this.#t),this.#a&&(this.#a.textContent=this.#n??``,this.#a.hidden=!this.#n)}#s(){this.render(Ti,Ei);let e=this.#e;this.queryRoot(`#fighter-a-name`).textContent=e.fighterAName,this.queryRoot(`#fighter-b-name`).textContent=e.fighterBName,this.queryRoot(`#score-a`).textContent=String(e.scoreA),this.queryRoot(`#score-b`).textContent=String(e.scoreB),this.queryRoot(`#winner`).textContent=e.winnerName?`Winner: ${e.winnerName}`:`Draw`,this.#r=this.queryRoot(`confirm-button`),this.#i=this.queryRoot(`#decline-button`),this.#a=this.queryRoot(`#error-message`),this.#o(),this.registerEvent(this.#i,`click`,()=>{this.dispatchEvent(new CustomEvent(`decline-requested`,{bubbles:!0}))}),this.registerEvent(this.#r,`confirmed`,()=>{this.dispatchEvent(new CustomEvent(`publish-requested`,{bubbles:!0}))})}};customElements.get(`match-publish-view`)||customElements.define(`match-publish-view`,Di);function Oi(){return ki({fighterAScore:0,fighterBScore:0,elapsedTimeSeconds:0,warnings:{A:0,B:0}})}function ki(e){return Object.freeze({...e,warnings:Object.freeze({...e.warnings})})}function Ai(e,t,n){if(e.disqualifiedFighter)throw Error(`No match events can be applied after disqualification.`);if(t.type===`score-adjustment`){let n=Fi(t.score,`Adjusted score`);return ki({...e,fighterAScore:t.fighter===`A`?n:e.fighterAScore,fighterBScore:t.fighter===`B`?n:e.fighterBScore,elapsedTimeSeconds:Ii(t.elapsedTimeSeconds)})}if(t.type===`warning`){let n=Pi(t.pointsDeducted,`Warning points deducted`);return ki({...e,fighterAScore:t.fighter===`A`?e.fighterAScore-n:e.fighterAScore,fighterBScore:t.fighter===`B`?e.fighterBScore-n:e.fighterBScore,elapsedTimeSeconds:Ii(t.elapsedTimeSeconds),warnings:{...e.warnings,[t.fighter]:e.warnings[t.fighter]+1}})}if(t.type===`disqualification`)return ki({...e,elapsedTimeSeconds:Ii(t.elapsedTimeSeconds),disqualifiedFighter:t.fighter});let r=Mi(t,n);return ki({...e,fighterAScore:e.fighterAScore+r.fighterA,fighterBScore:e.fighterBScore+r.fighterB,elapsedTimeSeconds:Ii(t.elapsedTimeSeconds)})}function ji(e,t,n=Oi()){return e.reduce((e,n)=>Ai(e,n,t),n)}function Mi(e,t){if(e.type===`no-score`)return{fighterA:0,fighterB:0};let n=Pi(e.fighterAScore,`Fighter A score`),r=Pi(e.fighterBScore,`Fighter B score`);if(e.type===`double`&&!t.countDoubles)return{fighterA:0,fighterB:0};if(e.type===`afterblow`&&!t.allowAfterBlow&&(e.firstFighter===`A`?r=0:n=0),t.useNetScore){let e=Ni(n,r);n=e.fighterA,r=e.fighterB}return{fighterA:n,fighterB:r}}function Ni(e,t){return e===t?{fighterA:0,fighterB:0}:e>t?{fighterA:e-t,fighterB:0}:{fighterA:0,fighterB:t-e}}function Pi(e,t){if(!Number.isFinite(e)||e<0)throw Error(`${t} must be a finite non-negative number.`);return e}function Fi(e,t){if(!Number.isFinite(e))throw Error(`${t} must be a finite number.`);return e}function Ii(e){return Pi(e,`Elapsed time`)}var Li=class{#e;#t;#n=[];#r=new Set;#i=new Set;#a;constructor(e,t=Oi()){this.#e=structuredClone(e),this.#t=ki(t),this.#a=this.#t}get state(){return this.#a}get events(){return this.#n.map(e=>structuredClone(e))}dispatch(e){let t=structuredClone(e),n=Ai(this.#a,t,this.#e);this.#n.push(t),this.#a=n;for(let e of this.#r)e(this.#a);for(let e of this.#i)e(structuredClone(t),this.#a)}subscribe(e){return this.#r.add(e),e(this.#a),()=>this.#r.delete(e)}subscribeToEvents(e){return this.#i.add(e),()=>this.#i.delete(e)}replay(e){let t=e.map(e=>structuredClone(e)),n=ji(t,this.#e,this.#t);this.#n.splice(0,this.#n.length,...t),this.#a=n;for(let e of this.#r)e(this.#a)}reset(){this.#n.splice(0),this.#a=this.#t;for(let e of this.#r)e(this.#a)}},Ri=1e3,zi=32;function Bi(e,t){let n=e.get(t.fighterAId)??1e3,r=e.get(t.fighterBId)??1e3,i=1/(1+10**((r-n)/400)),a=t.winnerParticipantId===null?.5:+(t.winnerParticipantId===t.fighterAId),o=new Map(e);return o.set(t.fighterAId,Math.round(n+zi*(a-i))),o.set(t.fighterBId,Math.round(r+zi*(1-a-(1-i)))),o}function Vi(e,t){return[...new Map(e.map(e=>[e.id,e])).values()].map(e=>({participantId:e.id,name:e.name,rating:t.get(e.id)??1e3,position:0})).sort((e,t)=>t.rating-e.rating).map((e,t)=>({...e,position:t+1}))}function Hi(e,t,n){return Vi(e,Bi(t,n))}var Ui=[{id:`competition-1`,name:`Autumn Longsword Open`,startDate:`2026-09-12`,endDate:`2026-09-13`},{id:`competition-2`,name:`Winter Sabre Cup`,startDate:`2026-12-05`,endDate:`2026-12-06`}],Wi=[{id:`participant-1`,competitionId:`competition-1`,name:`Alex Meyer`,linkedUserEmail:null},{id:`participant-2`,competitionId:`competition-1`,name:`Blake Novak`,linkedUserEmail:null},{id:`participant-3`,competitionId:`competition-1`,name:`Casey Silva`,linkedUserEmail:null},{id:`participant-4`,competitionId:`competition-1`,name:`Drew Fischer`,linkedUserEmail:null},{id:`participant-5`,competitionId:`competition-2`,name:`Emery Janssen`,linkedUserEmail:null},{id:`participant-6`,competitionId:`competition-2`,name:`Frankie Ruiz`,linkedUserEmail:null}],Gi=[{id:`bout-1`,competitionId:`competition-1`,fighterAId:`participant-1`,fighterBId:`participant-2`,scoreA:5,scoreB:3,winnerParticipantId:`participant-1`,date:`2026-09-12`,published:!0},{id:`bout-2`,competitionId:`competition-1`,fighterAId:`participant-3`,fighterBId:`participant-4`,scoreA:2,scoreB:2,winnerParticipantId:null,date:`2026-09-12`,published:!0}],Ki={id:`mock-ruleset`,name:`Mock competition ruleset`,version:`1.0`,weaponClass:`Longsword`,matchParameters:{maxDurationSeconds:180,stopOnTimeOut:!0,maxPointsCap:10,pointSpreadVictory:5,scores:[1,2,3,4],maxDoubles:3,allowAfterBlow:!0,countDoubles:!0,useNetScore:!0,penalties:[{description:`Late in ring`,penalties:[0],disqualify:!0},{description:`Unsportsmanlike conduct`,penalties:[0,1,2,3],disqualify:!0},{description:`Illegal target`,penalties:[0,1,2,3],disqualify:!1},{description:`Bull rushing`,penalties:[0,1],disqualify:!1},{description:`Illegal technique`,penalties:[],disqualify:!0},{description:`Influence jury`,penalties:[0,3],disqualify:!0},{description:`Ring out`,penalties:[1],disqualify:!1},{description:`Other`,penalties:[1,2,3,4,5],disqualify:!0}]}};function qi(){return!1}var Ji=qi()?{email:`you@example.com`,displayName:`You`}:null,Yi=null;function Xi(){return Ji}function Zi(){if(!Ji)throw Error(`No signed-in user.`);return Ji}function Qi(){return Yi}function $i(e,t){Yi=e,Ji=t}var ea=class{#e=structuredClone(Ui);#t=structuredClone(Wi);#n=structuredClone(Gi);#r=1e3;async listCompetitions(){return structuredClone(this.#e)}async getCompetition(e){return structuredClone(this.#i(e))}async getRuleSet(e){return this.#i(e),structuredClone(Ki)}async getRanking(e,t={}){let n=new Map;for(let t of this.#t)t.competitionId===e&&n.set(t.id,Ri);let r=this.#n.filter(t=>t.competitionId===e&&t.published).sort((e,t)=>e.date.localeCompare(t.date));for(let e of r)n=Bi(n,{fighterAId:e.fighterAId,fighterBId:e.fighterBId,winnerParticipantId:e.winnerParticipantId});return[...n.entries()].map(([t,n])=>({participantId:t,name:this.#a(e,t).name,rating:n,position:0})).sort((e,t)=>t.rating-e.rating).map((e,t)=>({...e,position:t+1}))}async getParticipants(e,t={}){return structuredClone(this.#t.filter(t=>t.competitionId===e))}async getParticipant(e,t){return structuredClone(this.#a(e,t))}async addParticipant(e,t){this.#i(e);let n={id:`participant-${this.#r++}`,competitionId:e,name:t,linkedUserEmail:null};return this.#t.push(n),structuredClone(n)}async registerSelf(e,t){this.#i(e);let n={id:`participant-${this.#r++}`,competitionId:e,name:t,linkedUserEmail:Zi().email};return this.#t.push(n),structuredClone(n)}async getBoutsForParticipant(e,t){return structuredClone(this.#n.filter(n=>n.competitionId===e&&n.published&&(n.fighterAId===t||n.fighterBId===t)))}async getBout(e,t){return structuredClone(this.#o(e,t))}async publishBout(e,t){this.#a(e,t.fighterAId),this.#a(e,t.fighterBId);let n={id:`bout-${this.#r++}`,competitionId:e,fighterAId:t.fighterAId,fighterBId:t.fighterBId,scoreA:t.scoreA,scoreB:t.scoreB,winnerParticipantId:t.winnerParticipantId,date:t.date,published:!0};return this.#n.push(n),structuredClone(n)}#i(e){let t=this.#e.find(t=>t.id===e);if(!t)throw Error(`Mock competition "${e}" does not exist.`);return t}#a(e,t){let n=this.#t.find(n=>n.competitionId===e&&n.id===t);if(!n)throw Error(`Mock participant "${t}" does not exist in competition "${e}".`);return n}#o(e,t){let n=this.#n.find(n=>n.competitionId===e&&n.id===t);if(!n)throw Error(`Mock bout "${t}" does not exist in competition "${e}".`);return n}},ta=3e4,na=class{#e;#t;#n;#r=new Map;constructor(e){this.#e=e.baseUrl.replace(/\/$/,``),this.#t=e.getIdToken??(()=>null),this.#n=e.cacheTtlMs??ta}async get(e,t={},n={}){let r=ra(e,t);if(!n.bypassCache){let e=this.#r.get(r);if(e&&e.expiresAt>Date.now())return e.value}let i=new URL(this.#e);i.searchParams.set(`action`,e);for(let[e,n]of Object.entries(t))i.searchParams.set(e,n);let a=await fetch(i.toString(),{method:`GET`}),o=await this.#i(a,e);return this.#n>0&&this.#r.set(r,{value:o,expiresAt:Date.now()+this.#n}),o}async post(e,t={}){let n=this.#t();if(!n)throw Error(`Action "${e}" requires a signed-in user.`);let r=await fetch(this.#e,{method:`POST`,headers:{"Content-Type":`text/plain;charset=utf-8`},body:JSON.stringify({action:e,idToken:n,...t})}),i=await this.#i(r,e);return this.#r.clear(),i}async#i(e,t){let n;try{n=await e.json()}catch{throw Error(`Action "${t}" returned an unreadable response (status ${e.status}).`)}if(!e.ok||!n.ok)throw Error(n.error??`Action "${t}" failed (status ${e.status}).`);return n.data}};function ra(e,t){let n=Object.entries(t).sort(([e],[t])=>e.localeCompare(t));return`${e}?${new URLSearchParams(n).toString()}`}var ia=class{#e;constructor(e){this.#e=e}async listCompetitions(){return this.#e.get(`listCompetitions`)}},aa=class{#e;constructor(e){this.#e=e}async getSettings(e){return this.#e.get(`getCompetition`,{spreadsheetId:e})}async getRanking(e,t={}){return this.#e.get(`getRanking`,{spreadsheetId:e},t.forceRefresh?{bypassCache:!0}:{})}async getParticipants(e,t={}){return this.#e.get(`getParticipants`,{spreadsheetId:e},t.forceRefresh?{bypassCache:!0}:{})}async getBouts(e){return this.#e.get(`getBouts`,{spreadsheetId:e})}async addParticipant(e,t){return this.#e.post(`addParticipant`,{spreadsheetId:e,name:t})}async registerSelf(e,t){return this.#e.post(`registerSelf`,{spreadsheetId:e,name:t})}async publishBout(e,t,n){await this.#e.post(`publishBout`,{spreadsheetId:e,bout:t,ranking:n})}};function oa(e,t){if(typeof t!=`object`||!t)throw Error(`The competition's ruleset is missing or malformed.`);let n=t;if(typeof n.weaponClass!=`string`)throw Error(`The competition's ruleset is missing a "weaponClass" field.`);return{id:typeof n.id==`string`?n.id:e.id,name:typeof n.name==`string`?n.name:`${e.name} ruleset`,version:typeof n.version==`string`?n.version:`1.0`,weaponClass:n.weaponClass,matchParameters:sa(n.matchParameters)}}function sa(e){if(typeof e!=`object`||!e)throw Error(`The competition's ruleset is missing "matchParameters".`);let t=e;return la(t,`maxDurationSeconds`),ua(t,`stopOnTimeOut`),la(t,`maxPointsCap`),la(t,`pointSpreadVictory`),fa(t,`scores`),la(t,`maxDoubles`),ua(t,`allowAfterBlow`),ua(t,`countDoubles`),ua(t,`useNetScore`),{maxDurationSeconds:t.maxDurationSeconds,stopOnTimeOut:t.stopOnTimeOut,maxPointsCap:t.maxPointsCap,pointSpreadVictory:t.pointSpreadVictory,scores:t.scores,maxDoubles:t.maxDoubles,allowAfterBlow:t.allowAfterBlow,countDoubles:t.countDoubles,useNetScore:t.useNetScore,penalties:ca(t.penalties)}}function ca(e){if(!Array.isArray(e))throw Error(`The competition's ruleset "matchParameters.penalties" must be an array.`);return e.map((e,t)=>{if(typeof e!=`object`||!e)throw Error(`The competition's ruleset penalty at index ${t} is malformed.`);let n=e;return da(n,`description`,`penalties[${t}]`),fa(n,`penalties`,`penalties[${t}]`),ua(n,`disqualify`,`penalties[${t}]`),{description:n.description,penalties:n.penalties,disqualify:n.disqualify}})}function la(e,t,n=`matchParameters`){if(typeof e[t]!=`number`)throw Error(`The competition's ruleset "${n}.${t}" must be a number.`)}function ua(e,t,n=`matchParameters`){if(typeof e[t]!=`boolean`)throw Error(`The competition's ruleset "${n}.${t}" must be a boolean.`)}function da(e,t,n=`matchParameters`){if(typeof e[t]!=`string`)throw Error(`The competition's ruleset "${n}.${t}" must be a string.`)}function fa(e,t,n=`matchParameters`){let r=e[t];if(!Array.isArray(r)||!r.every(e=>typeof e==`number`))throw Error(`The competition's ruleset "${n}.${t}" must be an array of numbers.`)}var pa=class{#e;#t;constructor(){let e=new na({baseUrl:ha(),getIdToken:Qi});this.#e=new ia(e),this.#t=new aa(e)}async listCompetitions(){return(await this.#e.listCompetitions()).map(e=>({id:e.spreadsheetId,name:e.name,startDate:e.startDate,endDate:e.endDate}))}async getCompetition(e){let t=await this.#t.getSettings(e);return{id:e,name:t.name,startDate:t.startDate,endDate:t.endDate}}async getRuleSet(e){let t=await this.#t.getSettings(e);return oa({id:e,name:t.name},t.rulesetJson)}async getRanking(e,t={}){return this.#t.getRanking(e,t.forceRefresh?{forceRefresh:!0}:{})}async getParticipants(e,t={}){return(await this.#t.getParticipants(e,t.forceRefresh?{forceRefresh:!0}:{})).map(t=>({id:t.id,competitionId:e,name:t.name,linkedUserEmail:t.linkedUserEmail}))}async getParticipant(e,t){let n=(await this.getParticipants(e)).find(e=>e.id===t);if(!n)throw Error(`Participant "${t}" was not found in competition "${e}".`);return n}async addParticipant(e,t){let n=await this.#t.addParticipant(e,t);return{id:n.id,competitionId:e,name:n.name,linkedUserEmail:n.linkedUserEmail}}async registerSelf(e,t){let n=await this.#t.registerSelf(e,t);return{id:n.id,competitionId:e,name:n.name,linkedUserEmail:n.linkedUserEmail}}async getBoutsForParticipant(e,t){return(await this.#t.getBouts(e)).filter(e=>e.fighterAId===t||e.fighterBId===t).map(t=>ma(e,t))}async getBout(e,t){let n=(await this.#t.getBouts(e)).find(e=>e.id===t);if(!n)throw Error(`Bout "${t}" was not found in competition "${e}".`);return ma(e,n)}async publishBout(e,t){let[n,r]=await Promise.all([this.#t.getParticipants(e),this.#t.getRanking(e)]),i={id:`bout-${crypto.randomUUID()}`,fighterAId:t.fighterAId,fighterBId:t.fighterBId,scoreA:t.scoreA,scoreB:t.scoreB,winnerParticipantId:t.winnerParticipantId,date:t.date,details:t.details},a=Hi(n,new Map(r.map(e=>[e.participantId,e.rating])),{fighterAId:t.fighterAId,fighterBId:t.fighterBId,winnerParticipantId:t.winnerParticipantId});return await this.#t.publishBout(e,i,a),ma(e,i)}};function ma(e,t){return{id:t.id,competitionId:e,fighterAId:t.fighterAId,fighterBId:t.fighterBId,scoreA:t.scoreA,scoreB:t.scoreB,winnerParticipantId:t.winnerParticipantId,date:t.date,published:!0}}function ha(){return`https://script.google.com/macros/s/AKfycbyL8Z1sKvbHQt3N9lYMw-9O4rr1egLXpu4QIjl1n5lkSa-oG29F5Q6LSzqoPdeozXP0/exec`}function ga(){return qi()?new ea:new pa}async function _a(e,t){await ba(),window.google.accounts.id.initialize({client_id:`93697684424-oekia9f8f74sf6oetmk50gv2mc30v0hi.apps.googleusercontent.com`,callback:e=>t(e.credential),auto_select:!0}),window.google.accounts.id.renderButton(e,{theme:`outline`,size:`large`}),window.google.accounts.id.prompt()}function va(e){let t=e.split(`.`)[1];if(!t)throw Error(`Malformed Google ID token.`);let n=t.replace(/-/g,`+`).replace(/_/g,`/`),r=n+`=`.repeat((4-n.length%4)%4),i=JSON.parse(atob(r));return{email:i.email,name:i.name??i.email}}var ya;function ba(){return window.google?.accounts.id?Promise.resolve():ya||(ya=new Promise((e,t)=>{let n=document.createElement(`script`);n.src=`https://accounts.google.com/gsi/client`,n.async=!0,n.onload=()=>e(),n.onerror=()=>t(Error(`Unable to load Google Sign-In.`)),document.head.append(n)}),ya)}var xa={backgroundColor:`#21c15b`,textColor:`#071a0d`},Sa={backgroundColor:`#2f7dfa`,textColor:`#ffffff`};function B(e){let t=document.querySelector(e);if(!t)throw Error(`Required element not found: "${e}".`);return t}var Ca=B(`#competition-selector-view`),V=B(`#ranking-view`),H=B(`#participants-view`),U=B(`#bouts-view`),wa=B(`#bout-details-view`),Ta=B(`#new-bout-view`),W=B(`#fight-view`),G=B(`#match-publish-view`),Ea=B(`#score-view`),Da=B(`#warning-view`),Oa=B(`#forfeit-dialog`),ka=B(`#sign-in-screen`),Aa=B(`#sign-in-error`),ja=B(`#google-sign-in-button`),Ma=[Ca,V,H,U,wa,Ta,W,G],K,Na;try{K=ga()}catch(e){Na=e instanceof Error?e.message:`Unable to start the app.`}var q,J,Y,X,Z,Pa=!1,Fa=!1,Ia=!1;lo(),Ca.addEventListener(`competition-selected`,e=>{$({screen:`competition`,competitionId:e.detail.competitionId,tab:`ranking`})}),V.addEventListener(`back-requested`,()=>{$({screen:`selector`})}),V.addEventListener(`view-participants-requested`,()=>{q&&$({screen:`competition`,competitionId:q,tab:`participants`})}),V.addEventListener(`participant-selected`,e=>{q&&$({screen:`bouts`,competitionId:q,participantId:e.detail.participantId})}),V.addEventListener(`new-bout-requested`,()=>{q&&$({screen:`new-bout`,competitionId:q,participantId:J??null})}),V.addEventListener(`refresh-requested`,()=>{q&&Ja(q,{forceRefresh:!0})}),H.addEventListener(`back-requested`,()=>{$({screen:`selector`})}),H.addEventListener(`view-ranking-requested`,()=>{q&&$({screen:`competition`,competitionId:q,tab:`ranking`})}),H.addEventListener(`participant-selected`,e=>{q&&$({screen:`bouts`,competitionId:q,participantId:e.detail.participantId})}),H.addEventListener(`participant-add-requested`,e=>{Ba(e.detail.name)}),H.addEventListener(`self-register-requested`,e=>{Va(e.detail.name)}),H.addEventListener(`refresh-requested`,()=>{q&&Ya(q,{forceRefresh:!0})}),U.addEventListener(`back-requested`,()=>{q&&$({screen:`competition`,competitionId:q,tab:`participants`})}),U.addEventListener(`bout-selected`,e=>{!q||!J||$({screen:`bout-details`,competitionId:q,participantId:J,boutId:e.detail.boutId})}),U.addEventListener(`new-bout-requested`,()=>{q&&$({screen:`new-bout`,competitionId:q,participantId:J??null})}),wa.addEventListener(`back-requested`,()=>{!q||!J||$({screen:`bouts`,competitionId:q,participantId:J})}),Ta.addEventListener(`back-requested`,()=>{if(q){if(J){$({screen:`bouts`,competitionId:q,participantId:J});return}$({screen:`competition`,competitionId:q,tab:`participants`})}}),Ta.addEventListener(`bout-create-requested`,e=>{q&&$({screen:`fight`,competitionId:q,participantId:J??null,fighterAId:e.detail.fighterAId,fighterBId:e.detail.fighterBId})}),W.addEventListener(`hit-requested`,e=>{Ea.open(e.detail.elapsedTimeSeconds)}),W.addEventListener(`warning-requested`,e=>{Da.open(e.detail.elapsedTimeSeconds)}),W.addEventListener(`match-reset-requested`,()=>{Y?.matchStore.reset(),W.setMatchStarted(!1)}),W.addEventListener(`end-match-requested`,()=>{Ha()}),W.addEventListener(`forfeit-requested`,()=>Oa.open()),window.addEventListener(`match-event`,e=>{Y?.matchStore.dispatch(e.detail)}),G.addEventListener(`publish-requested`,()=>{Wa()}),G.addEventListener(`decline-requested`,()=>{Ga()}),window.addEventListener(`popstate`,()=>{Ka(so())}),document.addEventListener(`visibilitychange`,()=>{document.visibilityState===`visible`&&Pa&&io()}),La();async function La(){if(Na){Ra(),ja.hidden=!0,Aa.textContent=Na;return}if(Xi()){await Ka(so());return}Ra();try{await _a(ja,e=>{let t=va(e);$i(e,{email:t.email,displayName:t.name}),za(),Ka(so())})}catch(e){Aa.textContent=e instanceof Error?e.message:`Unable to start Google Sign-In.`}}function Ra(){for(let e of Ma)e.hidden=!0;ka.hidden=!1,document.body.dataset.mode=`sign-in`}function za(){ka.hidden=!0}async function Ba(e){if(!(!q||Ia)){Ia=!0,H.setSubmitting(!0),H.setSubmitError(null);try{await K.addParticipant(q,e),await Ya(q)}catch(e){H.setSubmitError(e instanceof Error?e.message:`Unable to add the participant. Please try again.`)}finally{Ia=!1,H.setSubmitting(!1)}}}async function Va(e){if(!(!q||Ia)){Ia=!0,H.setSubmitting(!0),H.setSubmitError(null);try{await K.registerSelf(q,e),await Ya(q)}catch(e){H.setSubmitError(e instanceof Error?e.message:`Unable to register. Please try again.`)}finally{Ia=!1,H.setSubmitting(!1)}}}async function Ha(){if(!Y)return;let e=Y.matchStore.state;X={fighterAId:Y.fighterAId,fighterBId:Y.fighterBId,scoreA:e.fighterAScore,scoreB:e.fighterBScore,winnerParticipantId:Ua(Y,e),details:Y.matchStore.events},await ro(),q&&$({screen:`publish`,competitionId:q,participantId:J??null})}function Ua(e,t){return t.disqualifiedFighter===`A`?e.fighterBId:t.disqualifiedFighter===`B`||t.fighterAScore>t.fighterBScore?e.fighterAId:t.fighterBScore>t.fighterAScore?e.fighterBId:null}async function Wa(){if(!q||!X||Fa)return;let e=q,t=X;Fa=!0,G.setPublishing(!0),G.setError(null);try{let n=await K.publishBout(e,{fighterAId:t.fighterAId,fighterBId:t.fighterBId,scoreA:t.scoreA,scoreB:t.scoreB,winnerParticipantId:t.winnerParticipantId,date:new Date().toISOString().slice(0,10),details:t.details});X=void 0,$({screen:`bouts`,competitionId:e,participantId:J??n.fighterAId},!0)}catch(e){G.setError(e instanceof Error?e.message:`Unable to publish the bout. Please try again.`)}finally{Fa=!1,G.setPublishing(!1)}}async function Ga(){if(q){if(X=void 0,J){$({screen:`bouts`,competitionId:q,participantId:J},!0);return}$({screen:`competition`,competitionId:q,tab:`participants`},!0)}}function Q(e,t){for(let t of Ma)t.hidden=t!==e;document.body.dataset.mode=t}async function Ka(e){switch(e.screen){case`selector`:q=void 0,J=void 0,await qa();return;case`competition`:if(q=e.competitionId,J=void 0,e.tab===`participants`){await Ya(e.competitionId);return}await Ja(e.competitionId);return;case`bouts`:q=e.competitionId,J=e.participantId,await Xa(e.competitionId,e.participantId);return;case`bout-details`:q=e.competitionId,J=e.participantId,await Qa(e.competitionId,e.boutId);return;case`new-bout`:q=e.competitionId,J=e.participantId??void 0,await $a(e.competitionId,e.participantId);return;case`fight`:q=e.competitionId,J=e.participantId??void 0,await eo(e.competitionId,e.fighterAId,e.fighterBId);return;case`publish`:q=e.competitionId,J=e.participantId??void 0,await to();return}}async function qa(){Q(Ca,`selector`),Ca.configure({loading:!0,error:null,competitions:[]});try{let e=await K.listCompetitions();Ca.configure({loading:!1,error:null,competitions:e})}catch(e){Ca.configure({loading:!1,error:e instanceof Error?e.message:`Unable to load competitions.`,competitions:[]})}}async function Ja(e,t={}){Q(V,`ranking`);let n=await K.getCompetition(e);V.configure({loading:!0,error:null,competitionName:n.name,entries:[]});try{let r=await K.getRanking(e,t);V.configure({loading:!1,error:null,competitionName:n.name,entries:r})}catch(e){V.configure({loading:!1,error:e instanceof Error?e.message:`Unable to load the ranking.`,competitionName:n.name,entries:[]})}}async function Ya(e,t={}){Q(H,`participants`);let n=await K.getCompetition(e);H.configure({loading:!0,error:null,competitionName:n.name,participants:[],canRegisterSelf:!1});try{let r=await K.getParticipants(e,t),i=Zi().email,a=r.find(e=>e.linkedUserEmail===i);H.configure({loading:!1,error:null,competitionName:n.name,participants:r.map(e=>({id:e.id,name:e.name,isMe:e.id===a?.id})),canRegisterSelf:!a})}catch(e){H.configure({loading:!1,error:e instanceof Error?e.message:`Unable to load participants.`,competitionName:n.name,participants:[],canRegisterSelf:!1})}}async function Xa(e,t){Q(U,`bouts`);let n=await K.getParticipant(e,t);U.configure({loading:!0,error:null,participantName:n.name,bouts:[]});try{let[r,i]=await Promise.all([K.getBoutsForParticipant(e,t),K.getParticipants(e)]),a=new Map(i.map(e=>[e.id,e.name]));U.configure({loading:!1,error:null,participantName:n.name,bouts:r.map(e=>Za(e,t,a))})}catch(e){U.configure({loading:!1,error:e instanceof Error?e.message:`Unable to load bouts.`,participantName:n.name,bouts:[]})}}function Za(e,t,n){let r=e.fighterAId===t,i=r?e.fighterBId:e.fighterAId,a=r?e.scoreA:e.scoreB,o=r?e.scoreB:e.scoreA,s=e.winnerParticipantId?e.winnerParticipantId===t?`win`:`loss`:`draw`;return{id:e.id,opponentName:n.get(i)??`Unknown`,scoreForParticipant:a,scoreForOpponent:o,result:s,date:e.date}}async function Qa(e,t){Q(wa,`bout-details`),wa.configure({loading:!0,error:null,bout:null});try{let[n,r]=await Promise.all([K.getBout(e,t),K.getParticipants(e)]),i=new Map(r.map(e=>[e.id,e.name]));wa.configure({loading:!1,error:null,bout:{id:n.id,fighterAName:i.get(n.fighterAId)??`Unknown`,fighterBName:i.get(n.fighterBId)??`Unknown`,scoreA:n.scoreA,scoreB:n.scoreB,winnerName:n.winnerParticipantId?i.get(n.winnerParticipantId)??null:null,date:n.date}})}catch(e){wa.configure({loading:!1,error:e instanceof Error?e.message:`Unable to load the bout.`,bout:null})}}async function $a(e,t){Q(Ta,`new-bout`);let n=await K.getParticipants(e),r=Zi().email,i=n.find(e=>e.linkedUserEmail===r);Ta.configure({participants:n.map(e=>({id:e.id,name:e.name})),preselectedParticipantId:t??i?.id??null})}async function eo(e,t,n){Q(W,`fight`);let[r,i,a]=await Promise.all([K.getParticipant(e,t),K.getParticipant(e,n),K.getRuleSet(e)]),o=new Li(a.matchParameters,Oi());Y={fighterAId:t,fighterBId:n,matchStore:o},o.subscribe(e=>{W.setScores(e),W.setMatchActive(!e.disqualifiedFighter),Ea.setScores(e.fighterAScore,e.fighterBScore)}),W.configureArena({name:`${r.name} vs ${i.name}`,fighterAName:r.name,fighterBName:i.name,leftFighterStyle:xa,rightFighterStyle:Sa}),W.setMatchDuration(a.matchParameters.maxDurationSeconds),W.setScores({fighterAScore:0,fighterBScore:0}),W.setMatchCompleted(!1),Ea.configure({scores:a.matchParameters.scores,fighterA:{name:r.name,score:0,...xa},fighterB:{name:i.name,score:0,...Sa}}),Da.configure({fighterA:{name:r.name,...xa},fighterB:{name:i.name,...Sa},penalties:a.matchParameters.penalties}),await no()}async function to(){if(!X||!q){$({screen:`selector`},!0);return}Q(G,`publish`);let e=await K.getParticipants(q),t=new Map(e.map(e=>[e.id,e.name]));G.configure({fighterAName:t.get(X.fighterAId)??`Unknown`,fighterBName:t.get(X.fighterBId)??`Unknown`,scoreA:X.scoreA,scoreB:X.scoreB,winnerName:X.winnerParticipantId?t.get(X.winnerParticipantId)??null:null})}async function no(){Pa=!0,io();try{await document.documentElement.requestFullscreen()}catch(e){console.warn(`Fullscreen mode is unavailable.`,e)}try{await screen.orientation.lock(`portrait`)}catch(e){console.warn(`Portrait orientation lock is unavailable.`,e)}}async function ro(){if(Pa=!1,Z&&!Z.released)try{await Z.release()}catch(e){console.warn(`Unable to release the screen wake lock.`,e)}if(Z=void 0,Y=void 0,W.setWakeLockActive(!1),document.fullscreenElement)try{await document.exitFullscreen()}catch(e){console.warn(`Unable to exit fullscreen mode.`,e)}W.setMatchStarted(!1),W.setMatchCompleted(!1),Ea.close(),Da.close(),Oa.close()}async function io(){if(Pa){if(!(`wakeLock`in navigator)){W.setWakeLockActive(!1);return}if(document.visibilityState===`visible`){if(Z?.released===!1){W.setWakeLockActive(!0);return}try{Z=await navigator.wakeLock.request(`screen`),W.setWakeLockActive(!0),Z.addEventListener(`release`,()=>{Z=void 0,W.setWakeLockActive(!1),Pa&&document.visibilityState===`visible`&&io()})}catch(e){W.setWakeLockActive(!1),console.warn(`Unable to acquire a screen wake lock.`,e)}}}}function ao(){let e=window.location.pathname;return oo(e.startsWith(`/hema-score-keeper/`)?`/${e.slice(19)}`:`/`)}function oo(e){return e.replace(/\/+$/,``)||`/`}function so(){let e=ao(),t=new URLSearchParams(window.location.search),n=t.get(`competitionId`)??void 0,r=t.get(`participantId`)??void 0,i=t.get(`boutId`)??void 0,a=t.get(`fighterAId`)??void 0,o=t.get(`fighterBId`)??void 0,s=t.get(`tab`)===`participants`?`participants`:`ranking`;return e===`/competition`&&n?{screen:`competition`,competitionId:n,tab:s}:e===`/bouts`&&n&&r?{screen:`bouts`,competitionId:n,participantId:r}:e===`/bout`&&n&&i?{screen:`bout-details`,competitionId:n,participantId:r??``,boutId:i}:e===`/new-bout`&&n?{screen:`new-bout`,competitionId:n,participantId:r??null}:e===`/fight`&&n&&a&&o?{screen:`fight`,competitionId:n,participantId:r??null,fighterAId:a,fighterBId:o}:e===`/publish`&&n?{screen:`publish`,competitionId:n,participantId:r??null}:{screen:`selector`}}function co(e){let t=`/hema-score-keeper/`.replace(/\/$/,``),n=new URLSearchParams,r=`/`;switch(e.screen){case`selector`:r=`/`;break;case`competition`:r=`/competition`,n.set(`competitionId`,e.competitionId),n.set(`tab`,e.tab);break;case`bouts`:r=`/bouts`,n.set(`competitionId`,e.competitionId),n.set(`participantId`,e.participantId);break;case`bout-details`:r=`/bout`,n.set(`competitionId`,e.competitionId),n.set(`participantId`,e.participantId),n.set(`boutId`,e.boutId);break;case`new-bout`:r=`/new-bout`,n.set(`competitionId`,e.competitionId),e.participantId&&n.set(`participantId`,e.participantId);break;case`fight`:r=`/fight`,n.set(`competitionId`,e.competitionId),e.participantId&&n.set(`participantId`,e.participantId),n.set(`fighterAId`,e.fighterAId),n.set(`fighterBId`,e.fighterBId);break;case`publish`:r=`/publish`,n.set(`competitionId`,e.competitionId),e.participantId&&n.set(`participantId`,e.participantId)}let i=n.toString();return`${t}${r}${i?`?${i}`:``}`}function $(e,t=!1){let n=co(e);t?window.history.replaceState({},``,n):window.history.pushState({},``,n),Ka(e)}function lo(){`serviceWorker`in navigator&&window.addEventListener(`load`,()=>{navigator.serviceWorker.register(`/hema-score-keeper/sw.js`,{scope:`/hema-score-keeper/`})})}