import validationRules from "@/shared/validation-rules.json";

/**
 * Single home for environment values and tunables.
 * Only NEXT_PUBLIC_* variables are read here; everything else stays server-side.
 */
export interface AppConfig {
  siteName: string;
  siteUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** true when both Supabase values are present; data loaders return empty sets otherwise. */
  hasSupabase: boolean;
  functionsBaseUrl: string;
  turnstileSiteKey: string;
  rakutenAffiliateId: string;
  adsEnabled: boolean;
  adsenseClient: string;
  affiliateBannersEnabled: boolean;
  similarDisplayCount: number;
  featuredCount: number;
  latestReviewCount: number;
  tagPageSize: number;
  reviewMinLength: number;
  reviewMaxLength: number;
  nicknameMaxLength: number;
  defaultNickname: string;
  ratingMin: number;
  ratingMax: number;
  searchDebounceMs: number;
  /** Window used by the "featured" ranking, in days. */
  featuredWindowDays: number;
}

const env = (key: string): string => process.env[key] ?? "";
const flag = (key: string): boolean => env(key).toLowerCase() === "true";

const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const config: AppConfig = {
  siteName: "comicomi",
  siteUrl: env("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000",
  supabaseUrl,
  supabaseAnonKey,
  hasSupabase: supabaseUrl.length > 0 && supabaseAnonKey.length > 0,
  functionsBaseUrl: supabaseUrl ? `${supabaseUrl}/functions/v1` : "",
  turnstileSiteKey: env("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
  rakutenAffiliateId: env("NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID"),
  adsEnabled: process.env.NEXT_PUBLIC_DEMO_MODE !== "true" && flag("NEXT_PUBLIC_ADS_ENABLED"),
  adsenseClient: env("NEXT_PUBLIC_ADSENSE_CLIENT"),
  affiliateBannersEnabled: process.env.NEXT_PUBLIC_DEMO_MODE !== "true" && flag("NEXT_PUBLIC_AFFILIATE_BANNERS_ENABLED"),
  similarDisplayCount: 12,
  featuredCount: 12,
  latestReviewCount: 10,
  tagPageSize: 48,
  reviewMinLength: validationRules.review.bodyMin,
  reviewMaxLength: validationRules.review.bodyMax,
  nicknameMaxLength: validationRules.review.nicknameMax,
  defaultNickname: validationRules.review.defaultNickname,
  ratingMin: validationRules.review.ratingMin,
  ratingMax: validationRules.review.ratingMax,
  searchDebounceMs: 400,
  featuredWindowDays: 30,
};
