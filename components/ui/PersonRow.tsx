import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

/**
 * Generic person/role list row — an avatar (or initials), a name, an
 * optional secondary line (email, username, whatever the caller wants), a
 * role/status slot, and a trailing actions slot. Purely presentational: no
 * data fetching, no knowledge of `OrganizationMember` or any other FLOW
 * domain type. The consuming page maps its own data into these props.
 *
 * Built for the employer multi-admin team UI (a person + their role +
 * "change role"/"remove" actions), but the shape is generic enough for any
 * "person in a list with a role and row actions" case (event staff,
 * connection requests, etc).
 *
 * Usage:
 *   <PersonRow
 *     name={member.full_name}
 *     imageUrl={member.avatar_url}
 *     meta={member.email}
 *     role={<Badge tone={roleTone(member.role)}>{roleLabel(member.role)}</Badge>}
 *     actions={
 *       <div className="flex items-center gap-1.5">
 *         <Button variant="outline" size="sm" onClick={() => openRoleMenu(member.id)}>Change role</Button>
 *         <Button variant="ghost" size="sm" onClick={() => removeMember(member.id)}>Remove</Button>
 *       </div>
 *     }
 *   />
 *
 * Role tone-mapping (which `Badge` tone a given role gets) is intentionally
 * left to the caller — `PersonRow` doesn't know what roles exist.
 */
export interface PersonRowProps {
  name: string;
  imageUrl?: string | null;
  /** Secondary line under the name — email, username, title, etc. */
  meta?: ReactNode;
  /** Role/status slot — pass a tone-mapped `<Badge>` or any other node. */
  role?: ReactNode;
  /** Row actions slot — wire up a menu, inline buttons, whatever the page needs. */
  actions?: ReactNode;
  className?: string;
}

export function PersonRow({ name, imageUrl, meta, role, actions, className }: PersonRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-ink-100 bg-white p-3 dark:border-ink-800 dark:bg-ink-900",
        className,
      )}
    >
      <Avatar src={imageUrl} name={name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">{name}</p>
        {meta && <p className="truncate text-xs text-ink-400">{meta}</p>}
      </div>
      {role && <div className="shrink-0">{role}</div>}
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}
