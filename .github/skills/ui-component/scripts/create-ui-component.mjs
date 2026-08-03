#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const uiRoot = path.join(repoRoot, "packages", "ui");
const componentsRoot = path.join(uiRoot, "src", "components");
const indexPath = path.join(uiRoot, "src", "index.ts");

function printHelp() {
  console.log(`
create-ui-component.mjs - scaffold a UI web component in packages/ui

Options:
  --name <component-name>   Required. Kebab-case folder/file name, e.g. piq-button
  --tag <element-tag>       Custom element tag. Defaults to --name
  --class <class-name>      PascalCase class name. Defaults to derived name
  --force                   Overwrite existing component files
  --dry-run                 Print planned changes without writing files
  --help                    Show this help
`);
}

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--name") args.name = argv[++index];
    else if (arg === "--tag") args.tag = argv[++index];
    else if (arg === "--class") args.className = argv[++index];
    else args._.push(arg);
  }

  return args;
}

function toPascalCase(value) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function assertComponentName(value) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Invalid component name "${value}". Use kebab-case, e.g. piq-button.`);
  }
}

function assertTagName(value) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(value)) {
    throw new Error(`Invalid custom element tag "${value}". It must be lowercase and contain a hyphen.`);
  }
}

function assertClassName(value) {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Invalid class name "${value}". Use PascalCase, e.g. PiqButton.`);
  }
}

function ensureDirectory(dirPath, dryRun) {
  if (!dryRun) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(filePath, content, force, dryRun) {
  if (fs.existsSync(filePath) && !force) {
    throw new Error(`File already exists: ${path.relative(repoRoot, filePath)}. Re-run with --force to overwrite.`);
  }

  if (!dryRun) {
    fs.writeFileSync(filePath, content, "utf8");
  }
}

function updateIndex(exportLine, dryRun) {
  const existing = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
  const lines = existing.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.includes(exportLine)) {
    return false;
  }

  lines.push(exportLine);
  const next = lines.join("\n") + "\n";

  if (!dryRun) {
    fs.writeFileSync(indexPath, next, "utf8");
  }

  return true;
}

function templateTs(componentName, tagName, className) {
  return `import css from "./${componentName}.css?raw";
import html from "./${componentName}.html?raw";
import { BaseComponent } from "../base-component/base-component";

export class ${className} extends BaseComponent {
  connectedCallback(): void {
    this.render(css, html);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
  }
}

if (!customElements.get("${tagName}")) {
  customElements.define("${tagName}", ${className});
}
`;
}

function templateHtml(componentName) {
  return `<div class="${componentName}">
  <slot></slot>
</div>
`;
}

function templateCss(componentName) {
  return `:host {
  display: block;
}

.${componentName} {
  box-sizing: border-box;
}
`;
}

function templateTest(componentName, tagName) {
  return `import { describe, expect, it } from "vitest";
import "./${componentName}";

describe("${tagName}", () => {
  it("renders shadow DOM content", () => {
    const element = document.createElement("${tagName}");
    document.body.appendChild(element);

    expect(element.shadowRoot).not.toBeNull();
    expect(element.shadowRoot?.innerHTML).toContain("<");
  });
});
`;
}

function templateStory(componentName, tagName, className) {
  return `import "./${componentName}";

const meta = {
  title: "Components/${className}",
  render: () => "<${tagName}></${tagName}>",
};

export default meta;
export const Default = {};
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const componentName = args.name;
  if (!componentName) {
    throw new Error('Missing required argument "--name".');
  }

  const tagName = args.tag ?? componentName;
  const className = args.className ?? toPascalCase(componentName);

  assertComponentName(componentName);
  assertTagName(tagName);
  assertClassName(className);

  const componentDir = path.join(componentsRoot, componentName);
  const exportLine = `export * from "./components/${componentName}/${componentName}";`;
  const files = [
    {
      path: path.join(componentDir, `${componentName}.ts`),
      content: templateTs(componentName, tagName, className),
    },
    {
      path: path.join(componentDir, `${componentName}.html`),
      content: templateHtml(componentName),
    },
    {
      path: path.join(componentDir, `${componentName}.css`),
      content: templateCss(componentName),
    },
    {
      path: path.join(componentDir, `${componentName}.test.ts`),
      content: templateTest(componentName, tagName),
    },
    {
      path: path.join(componentDir, `${componentName}.stories.ts`),
      content: templateStory(componentName, tagName, className),
    },
  ];

  ensureDirectory(componentDir, args.dryRun);

  for (const file of files) {
    writeFile(file.path, file.content, args.force, args.dryRun);
  }

  const indexUpdated = updateIndex(exportLine, args.dryRun);
  const action = args.dryRun ? "Would create" : "Created";

  console.log(`${action} component scaffold for ${componentName}`);
  for (const file of files) {
    console.log(`- ${path.relative(repoRoot, file.path)}`);
  }

  if (indexUpdated) {
    console.log(`- ${path.relative(repoRoot, indexPath)} (export added)`);
  } else {
    console.log(`- ${path.relative(repoRoot, indexPath)} (export already present)`);
  }

  console.log("");
  console.log("Next steps:");
  console.log("- npm run test --workspace @hema/ui");
  console.log("- npm run storybook --workspace @hema/ui");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
