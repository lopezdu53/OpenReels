import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type DarkSelectOption = {
  value: string;
  label: string;
  hint?: string;
};

export function DarkSelect(props: {
  value: string;
  onValueChange: (value: string) => void;
  options: DarkSelectOption[];
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const current = props.options.find((option) => option.value === props.value);
  const hasHints = props.options.some((option) => option.hint);
  return (
    <Select
      value={props.value}
      onValueChange={(next) => {
        if (next) props.onValueChange(next);
      }}
      disabled={props.disabled}
    >
      <SelectTrigger
        aria-label={props["aria-label"]}
        className={cn(
          "h-8 min-w-[7.5rem] border border-input bg-card text-foreground shadow-none dark:hover:bg-accent",
          props.className,
        )}
      >
        <SelectValue>{current?.label ?? props.value}</SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className={cn(
          "w-max min-w-[var(--anchor-width)] border border-border bg-popover text-popover-foreground",
          hasHints ? "max-w-[24rem]" : "max-w-[18rem]",
        )}
      >
        {props.options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="items-start py-2 **:whitespace-normal"
          >
            <span className="flex max-w-[22rem] flex-col items-start gap-0.5 text-left">
              <span className="text-popover-foreground">{option.label}</span>
              {option.hint ? (
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {option.hint}
                </span>
              ) : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
