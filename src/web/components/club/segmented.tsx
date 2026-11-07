import { cn } from 'cn';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';

export interface SegmentedItem<Value extends string> {
  value: Value;
  label: string;
}

/**
 * One choice among a few, all visible (period, exercise, player): a shadcn toggle group that never empties,
 * the chosen item in white. The design's .seg and .sb: a full-width grid of 36 px items; `header` makes it, on a
 * wide screen, the compact strip of a page header (34 px items, 13 px text).
 */
export function Segmented<Value extends string>({
  label,
  items,
  value,
  onChange,
  disabled,
  className,
  layout = 'fill',
}: {
  label: string;
  items: readonly SegmentedItem<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  disabled?: boolean;
  className?: string;
  layout?: 'fill' | 'header';
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      disabled={disabled}
      onValueChange={(next: unknown[]) => {
        const chosen = next.find((item) => item !== value) ?? next[0];
        if (typeof chosen === 'string' && chosen !== value) onChange(chosen as Value);
      }}
      spacing={1}
      className={cn(
        'grid w-full auto-cols-fr grid-flow-col gap-1 rounded-[14px] bg-secondary p-1',
        layout === 'header' && 'lg:flex lg:w-auto lg:rounded-[12px]',
        className,
      )}
    >
      {items.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          className={cn(
            'h-9 min-w-0 rounded-[10px] px-3 text-sm font-semibold text-soft hover:bg-accent hover:text-foreground aria-pressed:bg-inverse aria-pressed:text-inverse-foreground aria-pressed:hover:bg-inverse',
            layout === 'header' && 'lg:h-[34px] lg:rounded-[9px] lg:px-3.5 lg:text-[13px]',
          )}
        >
          <span className="truncate">{item.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
