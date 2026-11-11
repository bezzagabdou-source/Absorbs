import Link from "next/link";
import { cn, gradientFor, initialsOf } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const SIZES = {
  xs: "h-8 w-8 text-[11px]",
  sm: "h-10 w-10 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
  "2xl": "h-24 w-24 text-2xl",
} as const;

export function Avatar({
  profile,
  size = "md",
  ring = false,
  className,
}: {
  profile: Pick<Profile, "display_name" | "username" | "avatar_url"> | null | undefined;
  size?: keyof typeof SIZES;
  ring?: boolean;
  className?: string;
}) {
  const name = profile?.display_name ?? profile?.username ?? "؟";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-bold text-white",
        !profile?.avatar_url && `bg-gradient-to-br ${gradientFor(profile?.username ?? name)}`,
        ring && "ring-2 ring-white/25 ring-offset-2 ring-offset-[#070713]",
        SIZES[size],
        className,
      )}
    >
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt={name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

export function AvatarLink({
  profile,
  size = "md",
  ring = false,
}: {
  profile: Pick<Profile, "display_name" | "username" | "avatar_url"> | null | undefined;
  size?: keyof typeof SIZES;
  ring?: boolean;
}) {
  if (!profile) return <Avatar profile={profile} size={size} ring={ring} />;
  return (
    <Link href={`/u/${profile.username}`} aria-label={profile.display_name} className="shrink-0 transition active:scale-95">
      <Avatar profile={profile} size={size} ring={ring} />
    </Link>
  );
}
