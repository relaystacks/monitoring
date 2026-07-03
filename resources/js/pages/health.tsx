import { Head, usePage } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { useState, useCallback } from 'react';

type NodeHealthData = {
    fetched_from?: string;
    status?: string;
    uptime_seconds?: number;
    config?: Record<string, unknown>;
    ipc?: Record<string, unknown>;
    auth?: {
        endpoint?: string;
        protocolWarning?: string | null;
        reachable?: boolean;
        test?: {
            statusCode?: number;
            statusMessage?: string;
            responseSnippet?: string;
            latencyMs?: number;
            error?: string | null;
            code?: string | null;
        };
    };
    socketio?: { connectedCount?: number; sockets?: Array<Record<string, unknown>> };
    presence?: { channelCount?: number; channels?: Record<string, unknown> };
    whisper?: { relayCapable?: boolean; details?: Array<Record<string, unknown>> };
    error?: string;
    urls_tried?: string[];
};

type Props = {
    config: {
        broadcast_driver: string;
        conduit: {
            socket_path: string;
            secret: string;
            timeout: number;
            url: string | null;
        };
        app_url: string;
        app_env: string;
        session_driver: string;
        session_domain: string | null;
        session_same_site: string;
        session_secure: boolean;
    };
    ipc: {
        socket_path: string;
        exists: boolean;
        is_socket: boolean | null;
        permissions: string | null;
        writable: boolean;
        error: string | null;
    };
    authTest: {
        success: boolean;
        response?: Record<string, unknown>;
        error?: string;
        exception?: string;
    };
    nodeHealth: NodeHealthData | null;
};

type TestResult = {
    status: 'idle' | 'running' | 'pass' | 'warn' | 'fail';
    title: string;
    detail?: string;
    data?: unknown;
    latencyMs?: number;
};

function StatusDot({ status }: { status: 'pass' | 'warn' | 'fail' | 'idle' | 'running' }) {
    const colors = {
        pass: 'bg-green-500',
        warn: 'bg-yellow-500',
        fail: 'bg-red-500',
        idle: 'bg-gray-400',
        running: 'bg-blue-500 animate-pulse',
    };
    return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${colors[status]}`} />;
}

function Badge({ status }: { status: 'pass' | 'warn' | 'fail' }) {
    const styles = {
        pass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        warn: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
        fail: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    const labels = { pass: 'Pass', warn: 'Warning', fail: 'Fail' };
    return (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
            {labels[status]}
        </span>
    );
}

function Card({ title, status, children }: { title: string; status?: 'pass' | 'warn' | 'fail'; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-sidebar-border/70 dark:border-sidebar-border">
            <div className="flex items-center justify-between border-b border-sidebar-border/70 px-5 py-3 dark:border-sidebar-border">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
                {status && <Badge status={status} />}
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}

function KV({ label, value, warn }: { label: string; value: string | number | boolean | null | undefined; warn?: boolean }) {
    const display = value === null || value === undefined ? '—' : String(value);
    return (
        <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
            <span className={`text-right text-sm font-mono ${warn ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : 'text-gray-900 dark:text-gray-100'}`}>
                {display}
            </span>
        </div>
    );
}

function JsonBlock({ data }: { data: unknown }) {
    return (
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-300">
            {JSON.stringify(data, null, 2)}
        </pre>
    );
}

function ClientTestCard({ result, onRun, buttonLabel }: { result: TestResult; onRun: () => void; buttonLabel: string }) {
    return (
        <div className="rounded-xl border border-sidebar-border/70 dark:border-sidebar-border">
            <div className="flex items-center justify-between border-b border-sidebar-border/70 px-5 py-3 dark:border-sidebar-border">
                <div className="flex items-center gap-2">
                    <StatusDot status={result.status} />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{result.title}</h3>
                </div>
                <button
                    onClick={onRun}
                    disabled={result.status === 'running'}
                    className="rounded-lg border border-sidebar-border/70 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-sidebar-border dark:text-gray-300 dark:hover:bg-gray-800"
                >
                    {result.status === 'running' ? 'Testing...' : buttonLabel}
                </button>
            </div>
            {result.status !== 'idle' && (
                <div className="p-5">
                    {result.detail && (
                        <p className={`text-sm ${result.status === 'fail' ? 'text-red-600 dark:text-red-400' : result.status === 'warn' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                            {result.detail}
                        </p>
                    )}
                    {result.latencyMs !== undefined && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Latency: {result.latencyMs}ms</p>
                    )}
                    {result.data && <JsonBlock data={result.data} />}
                </div>
            )}
        </div>
    );
}

export default function Health({ config, ipc, authTest, nodeHealth }: Props) {
    const { conduitUrl } = usePage<{ conduitUrl: string | null }>().props;

    const configStatus: 'pass' | 'warn' | 'fail' =
        config.broadcast_driver !== 'conduit' ? 'fail' :
        !config.conduit.url ? 'warn' :
        config.conduit.secret === '[NOT SET]' ? 'warn' : 'pass';

    const ipcStatus: 'pass' | 'warn' | 'fail' =
        !ipc.exists ? 'fail' :
        !ipc.writable ? 'fail' :
        !ipc.is_socket ? 'warn' : 'pass';

    const authStatus: 'pass' | 'fail' = authTest.success ? 'pass' : 'fail';

    const nodeAuthWarning = nodeHealth?.auth?.protocolWarning;
    const nodeReachable = !nodeHealth?.error;
    const nodeStatus: 'pass' | 'warn' | 'fail' =
        !nodeReachable ? 'fail' :
        nodeAuthWarning ? 'warn' : 'pass';

    const [browserAuthResult, setBrowserAuthResult] = useState<TestResult>({ status: 'idle', title: 'Browser Auth Test' });
    const [socketResult, setSocketResult] = useState<TestResult>({ status: 'idle', title: 'Socket.IO Connection' });
    const [presenceResult, setPresenceResult] = useState<TestResult>({ status: 'idle', title: 'Presence Subscribe' });

    const testBrowserAuth = useCallback(async () => {
        setBrowserAuthResult({ status: 'running', title: 'Browser Auth Test' });
        const start = performance.now();
        try {
            const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
            const response = await fetch('/broadcasting/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: 'socket_id=browser-health-test&channel_name=presence-online',
                credentials: 'include',
            });
            const latencyMs = Math.round(performance.now() - start);
            const text = await response.text();
            let data: unknown;
            try { data = JSON.parse(text); } catch { data = text; }

            if (response.ok) {
                setBrowserAuthResult({
                    status: 'pass',
                    title: 'Browser Auth Test',
                    detail: `HTTP ${response.status} — Auth succeeded with cookies`,
                    data,
                    latencyMs,
                });
            } else {
                setBrowserAuthResult({
                    status: 'fail',
                    title: 'Browser Auth Test',
                    detail: `HTTP ${response.status} ${response.statusText} — Auth failed`,
                    data,
                    latencyMs,
                });
            }
        } catch (err) {
            setBrowserAuthResult({
                status: 'fail',
                title: 'Browser Auth Test',
                detail: `Network error: ${err instanceof Error ? err.message : String(err)}`,
                latencyMs: Math.round(performance.now() - start),
            });
        }
    }, []);

    const testSocketConnection = useCallback(async () => {
        setSocketResult({ status: 'running', title: 'Socket.IO Connection' });
        const host = conduitUrl || `${window.location.protocol}//${window.location.hostname}:6001`;

        try {
            const { io } = await import('socket.io-client');
            const start = performance.now();
            let resolved = false;

            const socket = io(host, {
                withCredentials: true,
                transports: ['websocket', 'polling'],
                timeout: 5000,
            });

            const cleanup = () => {
                socket.off('connect');
                socket.off('connect_error');
                socket.disconnect();
            };

            socket.on('connect', () => {
                if (resolved) return;
                resolved = true;
                const latencyMs = Math.round(performance.now() - start);
                setSocketResult({
                    status: 'pass',
                    title: 'Socket.IO Connection',
                    detail: `Connected to ${host}`,
                    data: {
                        socketId: socket.id,
                        transport: (socket.io?.engine as { transport?: { name?: string } })?.transport?.name ?? 'unknown',
                        host,
                    },
                    latencyMs,
                });
                cleanup();
            });

            socket.on('connect_error', (err) => {
                if (resolved) return;
                resolved = true;
                const latencyMs = Math.round(performance.now() - start);
                setSocketResult({
                    status: 'fail',
                    title: 'Socket.IO Connection',
                    detail: `Failed to connect to ${host}: ${err.message}`,
                    data: { host, error: err.message },
                    latencyMs,
                });
                cleanup();
            });

            setTimeout(() => {
                if (resolved) return;
                resolved = true;
                setSocketResult({
                    status: 'fail',
                    title: 'Socket.IO Connection',
                    detail: `Timeout connecting to ${host} (5s)`,
                    data: { host },
                    latencyMs: 5000,
                });
                cleanup();
            }, 5500);
        } catch (err) {
            setSocketResult({
                status: 'fail',
                title: 'Socket.IO Connection',
                detail: `Import error: ${err instanceof Error ? err.message : String(err)}`,
            });
        }
    }, [conduitUrl]);

    const testPresenceSubscribe = useCallback(async () => {
        setPresenceResult({ status: 'running', title: 'Presence Subscribe' });
        const host = conduitUrl || `${window.location.protocol}//${window.location.hostname}:6001`;

        try {
            const [{ default: Echo }, { io }] = await Promise.all([
                import('laravel-echo'),
                import('socket.io-client'),
            ]);

            const start = performance.now();
            const echo = new Echo({
                broadcaster: 'socket.io',
                client: io,
                host,
                withCredentials: true,
            });

            let resolved = false;
            const cleanup = () => {
                if (resolved) return;
                resolved = true;
                try { echo.leave('online'); } catch { /* ignore */ }
                try { echo.disconnect(); } catch { /* ignore */ }
            };

            const rawSocket = (echo.connector as { socket?: { on?: (event: string, cb: (err: Error) => void) => void } })?.socket;
            rawSocket?.on?.('connect_error', (err: Error) => {
                if (resolved) return;
                cleanup();
                setPresenceResult({
                    status: 'fail',
                    title: 'Presence Subscribe',
                    detail: `Socket connection failed: ${err.message}`,
                    data: { host, error: err.message },
                    latencyMs: Math.round(performance.now() - start),
                });
            });

            rawSocket?.on?.('subscription_error', (data: unknown) => {
                if (resolved) return;
                cleanup();
                setPresenceResult({
                    status: 'fail',
                    title: 'Presence Subscribe',
                    detail: 'Subscription rejected by server',
                    data,
                    latencyMs: Math.round(performance.now() - start),
                });
            });

            echo.join('online')
                .here((members: Array<{ id: number | string; name: string }>) => {
                    if (resolved) return;
                    const latencyMs = Math.round(performance.now() - start);
                    cleanup();
                    setPresenceResult({
                        status: 'pass',
                        title: 'Presence Subscribe',
                        detail: `Joined presence-online with ${members.length} member(s)`,
                        data: { members, host },
                        latencyMs,
                    });
                });

            setTimeout(() => {
                if (resolved) return;
                cleanup();
                setPresenceResult({
                    status: 'fail',
                    title: 'Presence Subscribe',
                    detail: `Timeout: no presence:subscribed event within 8s. Check Node server logs.`,
                    data: { host },
                    latencyMs: 8000,
                });
            }, 8000);
        } catch (err) {
            setPresenceResult({
                status: 'fail',
                title: 'Presence Subscribe',
                detail: `Import error: ${err instanceof Error ? err.message : String(err)}`,
            });
        }
    }, [conduitUrl]);

    return (
        <AppLayout breadcrumbs={[{ title: 'System Health', href: '/health' }]}>
            <Head title="System Health" />
            <div className="flex h-full flex-1 flex-col gap-6 overflow-x-auto p-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">System Health Dashboard</h2>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        conduitUrl: <code className="font-mono">{conduitUrl || '[NOT SET]'}</code>
                    </span>
                </div>

                {/* Server-Side Diagnostics */}
                <section>
                    <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Server-Side Diagnostics
                    </h3>
                    <div className="grid gap-4 lg:grid-cols-2">
                        {/* Config */}
                        <Card title="Laravel Config" status={configStatus}>
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                <KV label="Broadcast Driver" value={config.broadcast_driver} warn={config.broadcast_driver !== 'conduit'} />
                                <KV label="Socket Path" value={config.conduit.socket_path} />
                                <KV label="Conduit URL (CONDUIT_IO_URL)" value={config.conduit.url} warn={!config.conduit.url} />
                                <KV label="Secret" value={config.conduit.secret} warn={config.conduit.secret === '[NOT SET]'} />
                                <KV label="Timeout" value={config.conduit.timeout} />
                                <KV label="App URL" value={config.app_url} />
                                <KV label="App Env" value={config.app_env} />
                                <KV label="Session Driver" value={config.session_driver} />
                                <KV label="Session Domain" value={config.session_domain} />
                                <KV label="Session SameSite" value={config.session_same_site} />
                                <KV label="Session Secure" value={String(config.session_secure)} />
                            </div>
                        </Card>

                        {/* IPC */}
                        <Card title="IPC (PHP → Node Unix Socket)" status={ipcStatus}>
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                <KV label="Socket Path" value={ipc.socket_path} />
                                <KV label="File Exists" value={String(ipc.exists)} warn={!ipc.exists} />
                                <KV label="Is Socket" value={ipc.is_socket === null ? '—' : String(ipc.is_socket)} warn={ipc.is_socket === false} />
                                <KV label="Permissions" value={ipc.permissions} />
                                <KV label="Writable by PHP" value={String(ipc.writable)} warn={!ipc.writable} />
                            </div>
                            {ipc.error && (
                                <p className="mt-3 text-sm text-red-600 dark:text-red-400">{ipc.error}</p>
                            )}
                        </Card>

                        {/* Server Auth Test */}
                        <Card title="Server-Side Auth Test (presence-online)" status={authStatus}>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Calls <code className="font-mono text-xs">ConduitBroadcaster::auth()</code> internally with your session.
                                {authTest.success
                                    ? ' This bypasses Node — proves Laravel auth logic works.'
                                    : ' Auth failed even with your session.'}
                            </p>
                            {authTest.success ? (
                                <JsonBlock data={authTest.response} />
                            ) : (
                                <div className="mt-2">
                                    <p className="text-sm font-medium text-red-600 dark:text-red-400">{authTest.exception}: {authTest.error}</p>
                                </div>
                            )}
                        </Card>

                        {/* Node Health */}
                        <Card title="Node.js Socket Server" status={nodeStatus}>
                            {nodeHealth?.error ? (
                                <div>
                                    <p className="text-sm text-red-600 dark:text-red-400">{nodeHealth.error}</p>
                                    {nodeHealth.urls_tried && (
                                        <div className="mt-2">
                                            <p className="text-xs text-gray-500 dark:text-gray-400">URLs tried:</p>
                                            {nodeHealth.urls_tried.map((url) => (
                                                <p key={url} className="font-mono text-xs text-gray-600 dark:text-gray-400">{url}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                    <KV label="Fetched From" value={nodeHealth?.fetched_from} />
                                    <KV label="Status" value={nodeHealth?.status} />
                                    <KV label="Uptime" value={nodeHealth?.uptime_seconds ? `${nodeHealth.uptime_seconds}s` : '—'} />
                                    <KV label="Connected Sockets" value={nodeHealth?.socketio?.connectedCount} />
                                    <KV label="Presence Channels" value={nodeHealth?.presence?.channelCount} />
                                    <KV label="Auth Endpoint" value={nodeHealth?.auth?.endpoint} />
                                    <KV label="Auth Reachable" value={String(nodeHealth?.auth?.reachable)} warn={!nodeHealth?.auth?.reachable} />
                                    {nodeHealth?.auth?.test && (
                                        <KV label="Auth Test Status" value={`${nodeHealth.auth.test.statusCode} (${nodeHealth.auth.test.latencyMs}ms)`} />
                                    )}
                                    {nodeAuthWarning && (
                                        <div className="py-2">
                                            <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">{nodeAuthWarning}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            {nodeHealth && !nodeHealth.error && (
                                <details className="mt-3">
                                    <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                                        Full Node Health JSON
                                    </summary>
                                    <JsonBlock data={nodeHealth} />
                                </details>
                            )}
                        </Card>
                    </div>
                </section>

                {/* Client-Side Tests */}
                <section>
                    <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Client-Side Tests (from your browser)
                    </h3>
                    <div className="grid gap-4 lg:grid-cols-3">
                        <ClientTestCard
                            result={browserAuthResult}
                            onRun={testBrowserAuth}
                            buttonLabel="Test Auth with Cookies"
                        />
                        <ClientTestCard
                            result={socketResult}
                            onRun={testSocketConnection}
                            buttonLabel="Test Socket.IO"
                        />
                        <ClientTestCard
                            result={presenceResult}
                            onRun={testPresenceSubscribe}
                            buttonLabel="Test Presence Subscribe"
                        />
                    </div>
                </section>

                {/* Interpretation Guide */}
                <section>
                    <details>
                        <summary className="cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                            How to interpret these results
                        </summary>
                        <div className="mt-3 rounded-xl border border-sidebar-border/70 p-5 text-sm text-gray-600 dark:border-sidebar-border dark:text-gray-400">
                            <div className="space-y-3">
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-gray-100">Server Auth Pass + Browser Auth Fail</p>
                                    <p>Cookie/session issue. Check session domain, SameSite, and secure cookie settings.</p>
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-gray-100">Socket.IO Connect + Presence Fail</p>
                                    <p>Node can't reach Laravel's /broadcasting/auth. Check the auth endpoint URL and HTTPS support.</p>
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-gray-100">Auth Protocol Warning (HTTPS)</p>
                                    <p>AuthService uses http module but endpoint is https. Browser subscriptions will fail at the Node→Laravel auth step. Fix: use http:// auth endpoint (via internal network) or patch AuthService for HTTPS.</p>
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-gray-100">IPC Socket Not Writable</p>
                                    <p>PHP can't write to the Unix socket. Check file ownership and permissions. PHP and Node must run as the same user or have group permissions.</p>
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-gray-100">conduitUrl is [NOT SET]</p>
                                    <p>Set CONDUIT_IO_URL in .env to the public Socket.IO URL (e.g., https://socket.example.com).</p>
                                </div>
                            </div>
                        </div>
                    </details>
                </section>
            </div>
        </AppLayout>
    );
}
