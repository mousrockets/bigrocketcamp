import { cn } from "cn"

// A light sweeping across the block while it loads, as on the old board's cards.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md bg-muted bg-[linear-gradient(90deg,var(--muted)_0%,var(--accent)_40%,var(--muted)_80%)] bg-size-[200%_100%] [animation:brc-shimmer_1.4s_linear_infinite]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
