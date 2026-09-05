import { readFile } from "node:fs/promises";
import path from "node:path";
import { remark } from "remark";
import html from "remark-html";

const CONTENT_DIR = path.join(process.cwd(), "content");

/** Converts a Markdown file under web/content to HTML at build time. */
export async function renderMarkdownFile(name: string): Promise<string> {
  const file = path.join(CONTENT_DIR, `${name}.md`);
  const source = await readFile(file, "utf8");
  return renderMarkdown(source);
}

export async function renderMarkdown(source: string): Promise<string> {
  const result = await remark().use(html).process(source);
  return String(result);
}
