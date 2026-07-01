import { Head, Link, usePage } from '@inertiajs/react';
import { usePresence, type PresenceMember, type ActivityState } from '@/hooks/use-presence';

type TeamMemberProps = {
    id: number;
    name: string;
    email: string;
};

type Props = {
    teamMembers: TeamMemberProps[];
    teamName: string;
    teamSlug: string;
};

function ActivityDot({ state }: { state: ActivityState | 'offline' }) {
    if (state === 'active') {
        return <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-green-500" />;
    }

    if (state === 'inactive') {
        return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />;
    }

    return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gray-400 dark:bg-gray-600" />;
}

function TeamMemberRow({ member, onlineMember, teamSlug }: { member: TeamMemberProps; onlineMember?: PresenceMember; teamSlug: string }) {
    const state: ActivityState | 'offline' = onlineMember?.activityState ?? 'offline';

    return (
        <div className="flex items-center justify-between rounded-xl border border-sidebar-border/70 px-5 py-4 dark:border-sidebar-border">
            <div className="flex items-center gap-3">
                <ActivityDot state={state} />
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                    {member.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                        {member.name}
                    </span>
                    {onlineMember?.currentUrl ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {onlineMember.currentUrl}
                        </span>
                    ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                            Offline
                        </span>
                    )}
                </div>
            </div>
            <Link
                href={`/${teamSlug}/activity/${member.id}`}
                className="rounded-lg border border-sidebar-border/70 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-sidebar-border dark:text-gray-300 dark:hover:bg-gray-800"
            >
                Activity
            </Link>
        </div>
    );
}

export default function TeamMonitoring({ teamMembers, teamName, teamSlug }: Props) {
    const { members } = usePresence();

    const memberMap = new Map(members.map((m) => [m.id, m]));

    const sorted = [...teamMembers].sort((a, b) => {
        const aOnline = memberMap.has(a.id);
        const bOnline = memberMap.has(b.id);
        if (aOnline !== bOnline) return aOnline ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    return (
        <>
            <Head title={`${teamName} - Monitoring`} />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {teamName} — Team Monitoring
                    </h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {teamMembers.filter((m) => memberMap.has(m.id)).length} / {teamMembers.length} online
                    </span>
                </div>

                {sorted.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-sidebar-border/70 p-8 text-gray-500 dark:border-sidebar-border dark:text-gray-400">
                        No team members
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sorted.map((member) => (
                            <TeamMemberRow
                                key={member.id}
                                member={member}
                                onlineMember={memberMap.get(member.id)}
                                teamSlug={teamSlug}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
