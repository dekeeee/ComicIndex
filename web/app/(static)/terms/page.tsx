import type { Metadata } from "next";
import { Prose } from "@/components/Prose";
import { renderMarkdownFile } from "@/lib/markdown";

export const metadata: Metadata = { title: "利用規約・投稿ガイドライン" };

export default async function Page() {
  const html = await renderMarkdownFile("terms");
  return <Prose html={html} />;
}
