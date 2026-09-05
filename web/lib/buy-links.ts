import type { AffiliateBannerDef, BuyLink } from "@/lib/types";

export interface BuyLinkSource {
  affiliateUrlRakuten: string;
  affiliateUrlAmazon: string | null;
}

/**
 * Orders purchase links: Rakuten first (always present), Amazon when known,
 * then any enabled ebook-store banner that opts into the work page.
 */
export function buildBuyLinks(
  source: BuyLinkSource,
  banners: AffiliateBannerDef[],
  bannersEnabled: boolean,
): BuyLink[] {
  const links: BuyLink[] = [];
  if (source.affiliateUrlRakuten) {
    links.push({ store: "rakuten", label: "楽天ブックスで見る", url: source.affiliateUrlRakuten });
  }
  if (source.affiliateUrlAmazon) {
    links.push({ store: "amazon", label: "Amazonで見る", url: source.affiliateUrlAmazon });
  }
  if (bannersEnabled) {
    for (const banner of banners) {
      if (!banner.enabled || !banner.placements.includes("work_bottom")) continue;
      links.push({ store: "ebook", label: `${banner.store}で読む`, url: banner.url, imageUrl: banner.imageUrl });
    }
  }
  return links;
}
