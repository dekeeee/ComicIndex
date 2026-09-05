export function BookCover({ title, src }: { title: string; authors: string[]; src: string | null }) {
  return (
    <div className="book-cover">
      {src ? (
        // API-provided covers stay on their original host.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={title} width={320} height={480} loading="lazy" className="h-full w-full object-cover" />
      ) : <span className="cover-missing" aria-hidden="true">表紙なし</span>}
    </div>
  );
}
