import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Hash, MessageSquare, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CountBadge,
  openCreateGroupModal,
  openSocialView,
  useUnreadBadges,
} from "@/components/social/SocialOverlay";
import { initials } from "@/lib/utils-room";

interface DmContact {
  _id: string;
  name: string;
  statusMessage?: string;
  avatarUrl?: string;
  lastAt: number;
}

const EMPTY_DM: DmContact[] = [];

/**
 * "Mesajlar" tab of the top navigation bar: DM contact list + group chats
 * with live unread badges. Picking a contact opens the same social slide-over
 * window used everywhere else (ringtone/call wiring untouched).
 */
export function MessagesPanel() {
  const dmContacts = (useQuery(api.social.listDmContacts, {}) ?? EMPTY_DM) as DmContact[];
  const groups = useQuery(api.dms.listMyGroups, {}) ?? [];
  const badges = useUnreadBadges();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:thin]">
        {/* Active conversations */}
        <p className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ordex-muted)]">
          <MessageSquare className="size-3" /> Direkt Mesajlar ({dmContacts.length})
        </p>
        {dmContacts.length === 0 && (
          <p className="px-2 py-1 text-xs text-[var(--ordex-muted)]">
            Henüz mesajın yok. Arkadaşlar sekmesinden biriyle DM başlat.
          </p>
        )}
        {dmContacts.map((u) => (
          <button
            key={u._id}
            onClick={() => openSocialView({ kind: "dm", peer: u })}
            className="ordex-inset mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--ordex-panel-3)]"
          >
            {u.avatarUrl ? (
              <img
                src={u.avatarUrl}
                alt={u.name}
                className="size-8 shrink-0 rounded-full border border-white/15 object-cover"
              />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ordex-panel-3)] text-[10px] font-bold text-[var(--ordex-accent)]">
                {initials(u.name)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-zinc-100">{u.name}</span>
              {u.statusMessage && (
                <span className="block truncate text-[10px] text-[var(--ordex-muted)]">
                  {u.statusMessage}
                </span>
              )}
            </span>
            <CountBadge count={badges.dmByPeer.get(String(u._id)) ?? 0} />
          </button>
        ))}

        {/* Group chats */}
        <div className="flex items-center justify-between px-2 pb-1 pt-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ordex-muted)]">
            <Users className="size-3" /> Gruplar ({groups.length})
          </p>
          <Button
            size="icon"
            variant="ghost"
            className="size-5 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-zinc-100"
            title="Grup oluştur"
            onClick={openCreateGroupModal}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        {groups.map((g) => (
          <button
            key={g._id}
            onClick={() => openSocialView({ kind: "group", groupId: g._id })}
            className="ordex-inset mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--ordex-panel-3)]"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ordex-accent-soft)] text-[var(--ordex-accent)]">
              <Hash className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-100">{g.name}</span>
            <CountBadge count={badges.groupByGroup.get(String(g._id)) ?? 0} />
          </button>
        ))}
        {groups.length === 0 && (
          <p className="px-2 py-1 text-xs text-[var(--ordex-muted)]">
            Henüz grubun yok. "+" ile arkadaşlarından grup kur.
          </p>
        )}
      </div>
    </div>
  );
}
