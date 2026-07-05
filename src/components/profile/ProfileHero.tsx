/**
 * MOVVI — Profile hero: name, avatar preview, status badges row.
 * Purely presentational — receives all data via props.
 */
import { Avatar } from "@/components/Avatar";
import type { ReactNode } from "react";
import { DSCard, DSCardContent } from "@/design-system";

type Props = {
  name: string | null;
  email: string | null;
  photoUrl: string | null;
  badges?: ReactNode;
};

export function ProfileHero({ name, email, photoUrl, badges }: Props) {
  return (
    <DSCard>
      <DSCardContent className="flex flex-col items-center gap-3 p-5 text-center">
        <Avatar src={photoUrl} name={name ?? "Usuário"} size={96} />
        <div>
          <h2 className="text-lg font-bold leading-tight">{name || "Sem nome"}</h2>
          {email && <p className="text-xs text-muted-foreground">{email}</p>}
        </div>
        {badges && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {badges}
          </div>
        )}
      </DSCardContent>
    </DSCard>
  );
}
