import { describe, expect, it } from "vitest";
import { buildBuyLinks } from "@/lib/buy-links";
import type { AffiliateBannerDef } from "@/lib/types";

const banner: AffiliateBannerDef = {
  id: "ebj",
  store: "ebookjapan",
  url: "https://example.com/ebj",
  imageUrl: "https://example.com/ebj.png",
  alt: "ebookjapan",
  placements: ["work_bottom"],
  enabled: true,
};

describe("buildBuyLinks", () => {
  it("puts Rakuten first, then Amazon, then ebook stores", () => {
    const links = buildBuyLinks({ affiliateUrlRakuten: "r", affiliateUrlAmazon: "a" }, [banner], true);
    expect(links.map((l) => l.store)).toEqual(["rakuten", "amazon", "ebook"]);
  });
  it("skips Amazon when unknown", () => {
    const links = buildBuyLinks({ affiliateUrlRakuten: "r", affiliateUrlAmazon: null }, [], true);
    expect(links.map((l) => l.store)).toEqual(["rakuten"]);
  });
  it("hides ebook banners when the flag is off", () => {
    const links = buildBuyLinks({ affiliateUrlRakuten: "r", affiliateUrlAmazon: null }, [banner], false);
    expect(links).toHaveLength(1);
  });
  it("ignores banners that are disabled or not for the work page", () => {
    const links = buildBuyLinks(
      { affiliateUrlRakuten: "r", affiliateUrlAmazon: null },
      [{ ...banner, enabled: false }, { ...banner, id: "side", placements: ["sidebar"] }],
      true,
    );
    expect(links).toHaveLength(1);
  });
});
