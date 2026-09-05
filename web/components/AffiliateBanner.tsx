import banners from "@/content/affiliate-banners.json";
import { config } from "@/lib/config";
import type { AdPlacement, AffiliateBannerDef } from "@/lib/types";

const defs = banners as AffiliateBannerDef[];

export function bannersFor(placement: AdPlacement, enabled = config.affiliateBannersEnabled): AffiliateBannerDef[] {
  if (!enabled) return [];
  return defs.filter((b) => b.enabled && b.placements.includes(placement));
}

export function AffiliateBanner({ placement }: { placement: AdPlacement }) {
  const items = bannersFor(placement);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" data-placement={placement}>
      {items.map((b) => (
        <a key={b.id} href={b.url} target="_blank" rel="nofollow sponsored noopener" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.imageUrl} alt={b.alt} loading="lazy" className="w-full h-auto rounded border border-border" />
        </a>
      ))}
      <p className="text-[10px] text-muted">PR</p>
    </div>
  );
}
