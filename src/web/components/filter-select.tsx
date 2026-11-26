import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

/**
 * A filter of a page, as a glass pill that opens its list: for a choice among many, or one that grows (the seasons),
 * where a segmented control would run out of room.
 */
export function FilterSelect<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** What it filters, for a screen reader: « Saison ». */
  label: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <Select items={options} value={value} onValueChange={(next) => next !== null && onChange(next as Value)}>
      <SelectTrigger
        aria-label={label}
        className="h-[38px] gap-1.5 rounded-[19px] border-0 bg-white/7 pr-2.5 pl-3.5 font-semibold text-[14px] text-t1 shadow-[inset_0_0_0_.5px_rgba(255,255,255,.1)] hover:bg-white/11 dark:bg-white/7 dark:hover:bg-white/11 [&_svg]:text-t2"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        align="start"
        className="min-w-44 rounded-[16px] bg-[rgba(28,28,30,.94)] p-1 text-t1 ring-white/10 backdrop-blur-[30px]"
      >
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="rounded-[10px] py-2 pl-2.5 text-[15px]">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
