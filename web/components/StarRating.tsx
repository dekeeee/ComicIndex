export function StarRating({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span aria-label={`評価 ${value} / ${max}`} className="text-accent tracking-tight">
      {"★".repeat(value)}
      <span className="text-border">{"★".repeat(Math.max(0, max - value))}</span>
    </span>
  );
}
