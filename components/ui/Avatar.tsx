import Image from "next/image";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

const sizes = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-24 w-24 text-2xl",
};

export function Avatar({
  src,
  name,
  size = "md",
  className,
  ring,
}: {
  src?: string | null;
  name: string;
  size?: keyof typeof sizes;
  className?: string;
  ring?: boolean;
}) {
  const dimension = { xs: 24, sm: 32, md: 40, lg: 56, xl: 96 }[size];

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-flow-100 text-flow-700 dark:bg-flow-950 dark:text-flow-300",
        "flex items-center justify-center font-semibold",
        ring && "ring-2 ring-white dark:ring-ink-900",
        sizes[size],
        className,
      )}
    >
      {src ? (
        <Image src={src} alt={name} width={dimension} height={dimension} className="h-full w-full object-cover" unoptimized />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}
