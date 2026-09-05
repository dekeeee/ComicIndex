import type { Metadata } from "next";
import { Prose } from "@/components/Prose";
import { renderMarkdownFile } from "@/lib/markdown";

export const metadata: Metadata = { title: "サイトについて" };

export default async function Page() {
  const html = await renderMarkdownFile("about");
  return <Prose html={html} />;
}
