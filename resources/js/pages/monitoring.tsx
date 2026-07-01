import { Head } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import Echo from 'laravel-echo';
import { io } from 'socket.io-client';

type PresenceMember = {
    id: number;
    name: string;
};

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export default function Monitoring() {
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
                setUsers(prev => [...prev.filter(u => u.id !== member.id), member]);
            })
            .leaving((member: PresenceMember) => {
                setUsers(prev => prev.filter(u => u.id !== member.id));
            });

        return () => {
            echo.leave('monitoring');
            echo.disconnect();
        };
    }, []);

    const statusColor = connectionStatus === 'connected'
        ? 'bg-green-500'
        : connectionStatus === 'connecting'
            ? 'bg-yellow-500'
            : 'bg-red-500';

    const statusLabel = connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1);

    return (
        <>
            <Head title="Live Monitoring" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Online Users</h2>
                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium text-white ${statusColor}`}>
                        <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                        {statusLabel}
                    </span>
                </div>

                {users.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-sidebar-border/70 p-8 text-gray-500 dark:border-sidebar-border dark:text-gray-400">
                        {connectionStatus === 'connected' ? 'No users online' : 'Connecting...'}
                    </div>
                ) : (
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
                                    <span className="font-medium text-gray-900 dark:text-gray-100">{user.name}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

Monitoring.layout = () => ({
    breadcrumbs: [
        {
            title: 'Live Monitoring',
            href: '/monitoring',
        },
    ],
});
