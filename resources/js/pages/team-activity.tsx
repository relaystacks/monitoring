import { Head, Link, usePage } from '@inertiajs/react';

type Activity = {
    id: number;
    url: string;
    duration_seconds: number | null;
    status: 'active' | 'inactive' | 'disconnected';
    created_at: string;
};

type PaginatedActivities = {
    data: Activity[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    next_page_url: string | null;
    prev_page_url: string | null;
};

type Props = {
    targetUser: {
        id: number;
        name: string;
    };
    activities: PaginatedActivities;
    teamName: string;
    teamSlug: string;
};

function formatDuration(seconds: number | null): string {
    if (seconds === null) return '—';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

const statusConfig = {
    active: { label: 'Active', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    inactive: { label: 'Inactive', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    disconnected: { label: 'Disconnected', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
} as const;

export default function TeamActivity({ targetUser, activities, teamName, teamSlug }: Props) {
    return (
        <>
            <Head title={`${targetUser.name} - Activity`} />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {targetUser.name}'s Activity
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {activities.total} {activities.total === 1 ? 'visit' : 'visits'} recorded
                        </p>
                    </div>
                    <Link
                        href={`/${teamSlug}/monitoring`}
                        className="rounded-lg border border-sidebar-border/70 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-sidebar-border dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                        Back to Monitoring
                    </Link>
                </div>

                {activities.data.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-sidebar-border/70 p-8 text-gray-500 dark:border-sidebar-border dark:text-gray-400">
                        No activity recorded yet
                    </div>
                ) : (
                    <>
                        <div className="overflow-hidden rounded-xl border border-sidebar-border/70 dark:border-sidebar-border">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-sidebar-border/70 bg-gray-50 dark:border-sidebar-border dark:bg-gray-900">
                                    <tr>
                                        <th className="px-5 py-3 font-medium text-gray-600 dark:text-gray-400">URL</th>
                                        <th className="px-5 py-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                                        <th className="px-5 py-3 font-medium text-gray-600 dark:text-gray-400">Duration</th>
                                        <th className="px-5 py-3 font-medium text-gray-600 dark:text-gray-400">Visited At</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-sidebar-border/70 dark:divide-sidebar-border">
                                    {activities.data.map((activity) => (
                                        <tr key={activity.id}>
                                            <td className="px-5 py-3 font-mono text-gray-900 dark:text-gray-100">
                                                {activity.url}
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig[activity.status]?.className ?? statusConfig.active.className}`}>
                                                    {statusConfig[activity.status]?.label ?? 'Active'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                                                {formatDuration(activity.duration_seconds)}
                                            </td>
                                            <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                                                {formatTimestamp(activity.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {activities.last_page > 1 && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    Page {activities.current_page} of {activities.last_page}
                                </span>
                                <div className="flex gap-2">
                                    {activities.prev_page_url && (
                                        <Link
                                            href={activities.prev_page_url}
                                            className="rounded-lg border border-sidebar-border/70 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-sidebar-border dark:text-gray-300 dark:hover:bg-gray-800"
                                        >
                                            Previous
                                        </Link>
                                    )}
                                    {activities.next_page_url && (
                                        <Link
                                            href={activities.next_page_url}
                                            className="rounded-lg border border-sidebar-border/70 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-sidebar-border dark:text-gray-300 dark:hover:bg-gray-800"
                                        >
                                            Next
                                        </Link>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}
