import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

/**
 * The iOS segmented control: one choice among a few, the chosen one lifted by a sliding pad. Choosing again the one
 * already chosen changes nothing.
 */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** What it chooses, for a screen reader: « Exercice ». */
  label: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(chosen: string[]) => {
        const [next] = chosen;
        if (next) onChange(next as Value);
      }}
      spacing={0}
      className="relative grid h-9 w-full auto-cols-fr grid-flow-col rounded-[11px] bg-[rgba(118,118,128,.22)] p-0.5"
    >
      <i
        aria-hidden="true"
        className="absolute top-0.5 left-0.5 h-8 rounded-[9px] bg-[rgba(120,120,128,.55)] shadow-[inset_0_.5px_0_rgba(255,255,255,.18),0_3px_8px_rgba(0,0,0,.25)] transition-transform duration-[450ms] ease-(--ease)"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="relative z-1 h-8 rounded-[9px] bg-transparent font-semibold text-[14px] text-t2 hover:bg-transparent hover:text-t1 aria-pressed:bg-transparent aria-pressed:text-t1"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
