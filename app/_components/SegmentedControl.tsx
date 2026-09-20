'use client';

interface Option<T extends string> {
  value: T;
  label: string;
  /** Spoken instead of the label where the short label alone is ambiguous. */
  srLabel?: string;
}

interface Props<T extends string> {
  legend: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Two rows instead of one, for option sets too long for 390px. */
  wrap?: boolean;
}

/**
 * iOS-style segmented control, built on real radios so it is keyboard and
 * screen-reader navigable for free.
 *
 * Feedback is on press, not release — the selected pill moves on pointer-down
 * because waiting for the click to register reads as lag.
 */
export function SegmentedControl<T extends string>({
  legend,
  options,
  value,
  onChange,
  wrap = false,
}: Props<T>) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div
        className={`flex gap-1 rounded-xl bg-segment-track p-1 ${
          wrap ? 'flex-wrap' : ''
        }`}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={[
                'relative flex min-h-11 flex-1 cursor-pointer items-center',
                'justify-center rounded-[0.625rem] px-3 text-center',
                'transition-[background-color,color] duration-150',
                wrap ? 'basis-[calc(50%-0.125rem)]' : 'basis-0',
                selected
                  ? 'bg-segment-pill font-medium text-fg'
                  : 'text-fg-secondary active:bg-black/5 dark:active:bg-white/5',
              ].join(' ')}
            >
              <input
                type="radio"
                name={legend}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="t-caption font-medium">{option.label}</span>
              {option.srLabel && <span className="sr-only">{option.srLabel}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
