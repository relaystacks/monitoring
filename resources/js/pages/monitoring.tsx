import { Head, Link, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import Echo from 'laravel-echo';
import { io } from 'socket.io-client';
import AppLayout from '@/layouts/app-layout';

type PresenceMember = {
    id: number | string;
    name: string;
};

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

function StatusBadge({ status }: { status: ConnectionStatus }) {
    const color =
        status === 'connected'
            ? 'bg-green-500'
            : status === 'connecting'
              ? 'bg-yellow-500'
              : 'bg-red-500';

    const label = status.charAt(0).toUpperCase() + status.slice(1);

    return (
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-white ${color}`}>
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            {label}
        </span>
    );
}

function UserList({ users }: { users: PresenceMember[] }) {
    return (
        <div className="space-y-3">
            {users.map((user) => (
                <div
                    key={user.id}
                    className="flex items-center justify-between rounded-xl border border-sidebar-border/70 px-5 py-4 dark:border-sidebar-border"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                            {user.name}
                        </span>
                    </div>
                    {typeof user.id === 'string' && user.id.startsWith('guest-') && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            Guest
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

function MonitoringContent() {
    const { auth } = usePage().props;
    const isAuthenticated = !!auth.user;
    const [users, setUsers] = useState<PresenceMember[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

    useEffect(() => {
        const echo = new Echo({
            broadcaster: 'socket.io',
            client: io,
            host: import.meta.env.VITE_CONDUIT_IO_URL || `${window.location.protocol}//${window.location.hostname}:6001`,
            withCredentials: true,
        });

        const socket = (echo.connector as any).socket;

        socket.on('connect', () => setConnectionStatus('connected'));
        socket.on('disconnect', () => setConnectionStatus('disconnected'));
        socket.on('connect_error', () => setConnectionStatus('disconnected'));

        echo.join('monitoring')
            .here((members: PresenceMember[]) => {
                setUsers(members);
            })
            .joining((member: PresenceMember) => {
                setUsers((prev) => [...prev.filter((u) => u.id !== member.id), member]);
            })
            .leaving((member: PresenceMember) => {
                setUsers((prev) => prev.filter((u) => u.id !== member.id));
            });

        return () => {
            echo.leave('monitoring');
            echo.disconnect();
        };
    }, []);

    return (
        <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Online Users</h2>
                <StatusBadge status={connectionStatus} />
            </div>

            {connectionStatus !== 'connected' ? (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-sidebar-border/70 p-8 text-gray-500 dark:border-sidebar-border dark:text-gray-400">
                    Connecting...
                </div>
            ) : isAuthenticated ? (
                users.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-sidebar-border/70 p-8 text-gray-500 dark:border-sidebar-border dark:text-gray-400">
                        No users online
                    </div>
                ) : (
                    <UserList users={users} />
                )
            ) : (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-sidebar-border/70 p-12 dark:border-sidebar-border">
                    <div className="text-center">
                        <p className="text-5xl font-bold text-gray-900 dark:text-gray-100">{users.length}</p>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            {users.length === 1 ? 'user' : 'users'} online
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Monitoring() {
    const { auth } = usePage().props;

    if (auth.user) {
        return (
            <AppLayout breadcrumbs={[{ title: 'Live Monitoring', href: '/monitoring' }]}>
                <Head title="Live Monitoring" />
                <MonitoringContent />
            </AppLayout>
        );
    }

    return (
        <>
            <Head title="Live Monitoring" />
            <div className="flex min-h-screen flex-col items-center bg-[#FDFDFC] p-6 dark:bg-[#0a0a0a]">
                <header className="mb-6 w-full max-w-2xl text-sm">
                    <nav className="flex items-center justify-end gap-4">
                        <Link
                            href="/login"
                            className="inline-block rounded-sm border border-transparent px-5 py-1.5 text-sm leading-normal text-[#1b1b18] hover:border-[#19140035] dark:text-[#EDEDEC] dark:hover:border-[#3E3E3A]"
                        >
                            Log in
                        </Link>
                        <Link
                            href="/register"
                            className="inline-block rounded-sm border border-[#19140035] px-5 py-1.5 text-sm leading-normal text-[#1b1b18] hover:border-[#1915014a] dark:border-[#3E3E3A] dark:text-[#EDEDEC] dark:hover:border-[#62605b]"
                        >
                            Register
                        </Link>
                    </nav>
                </header>
                <div className="w-full max-w-2xl">
                    <MonitoringContent />
                </div>
            </div>
        </>
    );
}
