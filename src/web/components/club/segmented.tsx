import { cn } from 'cn';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';

export interface SegmentedItem<Value extends string> {
  value: Value;
  label: string;
}

/**
 * One choice among a few, all visible (period, exercise, player): a shadcn toggle group that never empties,
 * the chosen item in white.
 */
export function Segmented<Value extends string>({
  label,
  items,
  value,
  onChange,
  disabled,
  className,
  size = 'default',
}: {
  label: string;
  items: readonly SegmentedItem<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  disabled?: boolean;
  className?: string;
  size?: 'default' | 'sm';
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
      className={cn('grid w-full auto-cols-fr grid-flow-col gap-1 rounded-[14px] bg-secondary p-1', className)}
    >
      {items.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          className={cn(
            'h-9 min-w-0 rounded-[10px] px-3 text-sm font-semibold text-soft hover:bg-accent hover:text-foreground aria-pressed:bg-inverse aria-pressed:text-inverse-foreground aria-pressed:hover:bg-inverse',
            size === 'sm' && 'h-[34px] rounded-[9px] px-1 text-[12px] lg:px-3 lg:text-[13px]',
          )}
        >
          <span className="truncate">{item.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
