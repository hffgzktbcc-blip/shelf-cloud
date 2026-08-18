import { Headphones } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A cover can be a 16:9 YouTube thumbnail or a 2:3 book jacket, and the shelf shows both
 * side by side. Cropping to fill decapitates the portrait ones, so the art is contained
 * and a blurred copy of itself fills the leftover space.
 */
export function Cover({
  src,
  className,
  imgClassName,
}: {
  src: string | null;
  className?: string;
  imgClassName?: string;
}) {
  if (!src) {
    return (
      <div className={cn("bg-muted text-muted-foreground/50 grid place-items-center", className)}>
        <Headphones className="size-8" />
      </div>
    );
  }

  return (
    <div className={cn("bg-muted relative overflow-hidden", className)}>
      <div
        aria-hidden
        className="absolute inset-0 scale-125 bg-cover bg-center blur-xl saturate-150"
        style={{ backgroundImage: `url(${src})` }}
      />
      <div aria-hidden className="absolute inset-0 bg-black/25" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={cn("relative size-full object-contain", imgClassName)}
      />
    </div>
  );
}
