/** Renders HTML produced by lib/markdown from our own content files (trusted input). */
export function Prose({ html }: { html: string }) {
  return <article className="prose max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />;
}
