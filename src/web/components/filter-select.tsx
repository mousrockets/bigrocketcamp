import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from './ui/select';

/** The line that picks every option, or none when they all are. */
const everyOption = '*';

/**
 * A filter of a page, as a glass pill that opens its list: several options at once, or all of them with its first
 * line, for a choice among many, or one that grows (the seasons), where a segmented control would run out of room.
 */
export function FilterSelect<Value extends string>({
  label,
  allLabel,
  noneLabel,
  several,
  options,
  value,
  onChange,
}: {
  /** What it filters, for a screen reader: « Saison ». */
  label: string;
  /** The first line, which picks every option: « Toutes les saisons ». */
  allLabel: string;
  /** What the pill reads with no option picked: « Aucune saison ». */
  noneLabel: string;
  /** What it reads with three options or more picked, but not all: « 3 saisons ». */
  several: (count: number) => string;
  options: readonly { value: Value; label: string }[];
  /** The options picked, in the order of the list. */
  value: readonly Value[];
  onChange: (value: Value[]) => void;
}) {
  const all = value.length === options.length;
  const picked = options.filter((option) => value.includes(option.value));
  const summary = all
    ? allLabel
    : picked.length === 0
      ? noneLabel
      : picked.length <= 2
        ? picked.map((option) => option.label).join(' + ')
        : several(picked.length);
  const choose = (next: string[]) => {
    if (!all && next.includes(everyOption)) return onChange(options.map((option) => option.value));
    if (all && !next.includes(everyOption)) return onChange([]);
    onChange(options.filter((option) => next.includes(option.value)).map((option) => option.value));
  };
  return (
    <Select multiple value={all ? [everyOption, ...value] : [...value]} onValueChange={choose}>
      <SelectTrigger
        aria-label={label}
        className="h-[38px] gap-1.5 rounded-[19px] border-0 bg-white/7 pr-2.5 pl-3.5 font-semibold text-[14px] text-t1 shadow-[inset_0_0_0_.5px_rgba(255,255,255,.1)] hover:bg-white/11 dark:bg-white/7 dark:hover:bg-white/11 [&_svg]:text-t2"
      >
        <SelectValue>{() => summary}</SelectValue>
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        align="start"
        className="min-w-44 rounded-[16px] bg-[rgba(28,28,30,.94)] p-1 text-t1 ring-white/10 backdrop-blur-[30px]"
      >
        <SelectItem value={everyOption} className="rounded-[10px] py-2 pl-2.5 text-[15px]">
          {allLabel}
        </SelectItem>
        <SelectSeparator className="bg-white/10" />
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="rounded-[10px] py-2 pl-2.5 text-[15px]">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
