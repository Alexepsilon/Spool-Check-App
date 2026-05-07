// One progress widget reused across Home / StatusBoard / Scanner so the
// status indication looks the same everywhere.
//
// Variants:
//   - "wide": full header treatment (StatusBoard top)
//   - "compact": single line (Scanner top, Home tile)

interface Props {
  total: number;
  verified: number;
  missing?: number;
  variant?: 'wide' | 'compact';
  /** Background style. 'dark' for over-camera or primary backgrounds. */
  theme?: 'dark' | 'light';
}

export default function ProgressStrip({
  total,
  verified,
  missing = 0,
  variant = 'compact',
  theme = 'light',
}: Props) {
  const pct = total === 0 ? 0 : Math.round((verified * 100) / total);
  const remaining = Math.max(total - verified - missing, 0);

  const textMain = theme === 'dark' ? 'text-white' : 'text-gray-900';
  const textSub = theme === 'dark' ? 'text-white/70' : 'text-gray-500';
  const trackBg = theme === 'dark' ? 'bg-white/15' : 'bg-gray-200';

  if (variant === 'wide') {
    return (
      <div className="px-4 pb-3">
        <div className="flex items-baseline gap-3">
          <div className={`text-3xl font-semibold ${textMain}`}>
            {verified}
            <span className={`text-base font-normal ${textSub}`}> / {total}</span>
          </div>
          <div className={`text-xl font-medium ml-auto ${textMain}`}>{pct}%</div>
        </div>
        <div className={`flex gap-3 mt-1 text-xs ${textSub}`}>
          <span>{remaining} remaining</span>
          {missing > 0 && <span className="text-red-300">{missing} missing</span>}
        </div>
        <div className={`h-1.5 mt-2 rounded-full overflow-hidden ${trackBg}`}>
          <div
            className="bg-accent h-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  // compact
  return (
    <div className="px-3 py-2">
      <div className={`flex items-center gap-2 text-sm ${textMain}`}>
        <span className="font-semibold">{verified}</span>
        <span className={textSub}>/ {total}</span>
        <span className={`ml-auto font-medium`}>{pct}%</span>
      </div>
      <div className={`h-1 mt-1 rounded-full overflow-hidden ${trackBg}`}>
        <div
          className="bg-accent h-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
