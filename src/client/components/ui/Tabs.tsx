import type { ComponentProps } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

// A wrapper, not an alias (see Dialog.tsx).
export function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root {...props} />;
}

export interface TabsListProps extends ComponentProps<typeof TabsPrimitive.List> {
  variant?: "segmented" | "underline";
}

export function TabsList({ variant = "segmented", className, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      data-variant={variant}
      className={cn(
        "group/tabs flex",
        variant === "segmented" && "w-fit gap-0.5 rounded-[10px] border border-border bg-surface-2 p-1",
        variant === "underline" && "gap-5 border-b border-border",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative inline-flex select-none items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-fg-muted",
        "transition-colors duration-150 hover:text-fg data-[state=active]:text-fg disabled:opacity-50 disabled:pointer-events-none",
        // segmented
        "group-data-[variant=segmented]/tabs:h-8 group-data-[variant=segmented]/tabs:flex-1 group-data-[variant=segmented]/tabs:justify-center",
        "group-data-[variant=segmented]/tabs:rounded-[7px] group-data-[variant=segmented]/tabs:px-3",
        "group-data-[variant=segmented]/tabs:data-[state=active]:bg-surface-3",
        // underline
        "group-data-[variant=underline]/tabs:h-9 group-data-[variant=underline]/tabs:px-0.5",
        "group-data-[variant=underline]/tabs:after:absolute group-data-[variant=underline]/tabs:after:inset-x-0",
        "group-data-[variant=underline]/tabs:after:-bottom-px group-data-[variant=underline]/tabs:after:h-0.5",
        "group-data-[variant=underline]/tabs:after:rounded-full group-data-[variant=underline]/tabs:after:bg-accent",
        "group-data-[variant=underline]/tabs:after:opacity-0 group-data-[variant=underline]/tabs:after:transition-opacity",
        "group-data-[variant=underline]/tabs:data-[state=active]:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />;
}
