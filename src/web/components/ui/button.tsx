import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        gate: "bg-gate-text font-display font-extrabold text-[17px] text-gate [font-stretch:85%] hover:bg-white",
        "gate-outline":
          "border-white/14 bg-transparent font-display font-extrabold text-[17px] text-gate-text [font-stretch:85%] hover:bg-gate-field hover:text-white",
        "gate-link": "font-semibold text-[14px] text-gate-link hover:text-[#a9d1ff]",
        cta: "bg-t1 font-semibold text-[16px] text-black tracking-[-.01em] duration-300 ease-(--ease) hover:opacity-92 active:not-aria-[haspopup]:translate-y-0 active:scale-98",
        line: "border-line bg-transparent text-t2 duration-300 hover:border-white/18 hover:text-t1",
        tab: "h-full flex-col gap-0.5 rounded-[26px] px-0 text-[10px] font-semibold tracking-[.01em] text-t2 duration-300 hover:text-t1 active:not-aria-[haspopup]:translate-y-0 aria-[current=page]:bg-white/13 aria-[current=page]:text-t1 aria-[current=page]:shadow-[inset_0_.5px_0_rgba(255,255,255,.28),0_2px_8px_rgba(0,0,0,.25)] [&_svg:not([class*='size-'])]:size-[22px]",
        soft: "bg-white/8 text-t2 duration-300 hover:bg-white/12 hover:text-t1",
        step: "bg-white/7 text-t1 shadow-[inset_0_0_0_.5px_rgba(255,255,255,.1)] duration-300 ease-(--ease) hover:bg-white/11 active:not-aria-[haspopup]:translate-y-0 active:scale-92",
        chip: "bg-white/6 font-semibold text-[14px] text-t1 tabular-nums shadow-[inset_0_0_0_.5px_rgba(255,255,255,.08)] duration-300 ease-(--ease) hover:bg-white/10 active:not-aria-[haspopup]:translate-y-0 active:scale-96",
        quiet: "bg-transparent font-medium text-[15px] text-t3 duration-300 hover:text-t1",
        pill: "border-0 bg-white/10 font-semibold [line-height:normal] text-[14px] text-t1 duration-200 hover:bg-white/15 aria-pressed:bg-t1 aria-pressed:text-black",
        "pill-danger": "border-0 bg-white/10 font-semibold [line-height:normal] text-[14px] text-destructive duration-200 hover:bg-white/15",
        glass: "glass rounded-full text-t1 duration-300 ease-(--ease) active:not-aria-[haspopup]:translate-y-0 active:scale-94 [&_svg:not([class*='size-'])]:size-[22px]",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
        gate: "h-[54px] gap-2 rounded-[14px] px-7 [&_svg:not([class*='size-'])]:size-[18px]",
        "gate-link": "min-h-11 px-2",
        cta: "h-[50px] gap-2 rounded-[25px] px-6 [&_svg:not([class*='size-'])]:size-3",
        step: "size-14 rounded-full [&_svg:not([class*='size-'])]:size-5",
        chip: "h-[38px] min-w-[62px] shrink-0 rounded-[19px] px-3",
        "cta-tall": "h-[52px] gap-2 rounded-[26px] px-6 [&_svg:not([class*='size-'])]:size-4",
        "cta-xl": "h-[54px] gap-2 rounded-[27px] px-6 text-[17px]",
        quiet: "h-11 gap-2 px-3 [&_svg:not([class*='size-'])]:size-3.5",
        pill: "h-9 gap-1.5 rounded-[18px] px-3.5 [&_svg:not([class*='size-'])]:size-3.5",
        round: "size-9 rounded-full [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
