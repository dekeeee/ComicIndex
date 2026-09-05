import type { Metadata } from "next";
import { Prose } from "@/components/Prose";
import { renderMarkdownFile } from "@/lib/markdown";

export const metadata: Metadata = { title: "お問い合わせ" };

export default async function Page() {
  const html = await renderMarkdownFile("contact");
  return <Prose html={html} />;
}
