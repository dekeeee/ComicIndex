import type { Metadata } from "next";
import { Prose } from "@/components/Prose";
import { renderMarkdownFile } from "@/lib/markdown";

export const metadata: Metadata = { title: "プライバシーポリシー" };

export default async function Page() {
  const html = await renderMarkdownFile("privacy");
  return <Prose html={html} />;
}
