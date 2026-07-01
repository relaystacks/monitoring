import { router } from '@inertiajs/react';
import Echo from 'laravel-echo';
import { io } from 'socket.io-client';
import { useSyncExternalStore } from 'react';

export type ActivityState = 'active' | 'inactive';

export type PresenceMember = {
    id: number | string;
    name: string;
    currentUrl?: string;
    activityState: ActivityState;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

type WhisperLocationData = {
    url: string;
    _sender?: { user_id: number | string; user_info: { id: number | string; name: string } };
};

type WhisperActivityData = {
    state: ActivityState;
    _sender?: { user_id: number | string; user_info: { id: number | string; name: string } };
};

const listeners = new Set<() => void>();
let currentMembers: PresenceMember[] = [];
let currentConnectionStatus: ConnectionStatus = 'connecting';
const memberUrls = new Map<number | string, string>();
const memberActivityStates = new Map<number | string, ActivityState>();

let echo: Echo | null = null;
let presenceChannel: ReturnType<Echo['join']> | null = null;
let selfId: number | string | null = null;
let activityState: ActivityState = 'active';
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastActivityTime = 0;
let isAuthenticated = false;
let pageStartTime = 0;
let currentPageUrl = '';
let accumulatedActiveSeconds = 0;

const INACTIVITY_TIMEOUT = 30_000;
const DISCONNECT_TIMEOUT = 150_000;
const ACTIVITY_THROTTLE = 5_000;

const subscribe = (callback: () => void) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
};

const notify = (): void => listeners.forEach((l) => l());

function setConnectionStatus(status: ConnectionStatus): void {
    if (currentConnectionStatus === status) return;
    currentConnectionStatus = status;
    notify();
}

function rebuildMembers(raw: Array<{ id: number | string; name: string }>): void {
    currentMembers = raw.map((m) => ({
        ...m,
        currentUrl: memberUrls.get(m.id),
        activityState: m.id === selfId ? activityState : (memberActivityStates.get(m.id) ?? 'active'),
    }));
    notify();
}

function whisperLocation(): void {
    presenceChannel?.whisper('location-update', { url: window.location.pathname });
}

function whisperActivityState(): void {
    presenceChannel?.whisper('activity-state', { state: activityState });
}

function createEchoInstance(): void {
    echo = new Echo({
        broadcaster: 'socket.io',
        client: io,
        host: import.meta.env.VITE_CONDUIT_IO_URL || `${window.location.protocol}//${window.location.hostname}:6001`,
        withCredentials: true,
    });

    const socket = (echo.connector as any).socket;
    socket.on('connect', () => setConnectionStatus('connected'));
    socket.on('disconnect', () => setConnectionStatus('disconnected'));
    socket.on('connect_error', () => setConnectionStatus('disconnected'));
}

function destroyEchoInstance(): void {
    if (!echo) return;
    echo.disconnect();
    echo = null;
}

function joinChannel(): void {
    if (!echo || presenceChannel) return;

    presenceChannel = echo
        .join('online')
        .here((ms: Array<{ id: number | string; name: string }>) => {
            if (selfId != null) {
                memberUrls.set(selfId, window.location.pathname);
                memberActivityStates.set(selfId, activityState);
            }
            rebuildMembers(ms);
            whisperLocation();
            whisperActivityState();
        })
        .joining((m: { id: number | string; name: string }) => {
            const raw = [...currentMembers.map(({ id, name }) => ({ id, name })), { id: m.id, name: m.name }];
            rebuildMembers(raw);
            whisperLocation();
            whisperActivityState();
        })
        .leaving((m: { id: number | string; name: string }) => {
            memberUrls.delete(m.id);
            memberActivityStates.delete(m.id);
            const raw = currentMembers.filter((u) => u.id !== m.id).map(({ id, name }) => ({ id, name }));
            rebuildMembers(raw);
        })
        .listenForWhisper('location-update', (data: WhisperLocationData) => {
            const senderId = data._sender?.user_info?.id;
            if (senderId != null) {
                memberUrls.set(senderId, data.url);
                rebuildMembers(currentMembers.map(({ id, name }) => ({ id, name })));
            }
        })
        .listenForWhisper('activity-state', (data: WhisperActivityData) => {
            const senderId = data._sender?.user_info?.id;
            if (senderId != null) {
                memberActivityStates.set(senderId, data.state);
                rebuildMembers(currentMembers.map(({ id, name }) => ({ id, name })));
            }
        });
}

function leaveChannel(): void {
    if (!echo || !presenceChannel) return;
    echo.leave('online');
    presenceChannel = null;
    currentMembers = [];
    memberUrls.clear();
    memberActivityStates.clear();
    notify();
}

function clearTimers(): void {
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }
    if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
    }
}

function resetInactivityTimer(): void {
    clearTimers();

    inactivityTimer = setTimeout(() => {
        if (pageStartTime > 0) {
            accumulatedActiveSeconds += Math.round((Date.now() - pageStartTime) / 1000);
        }

        activityState = 'inactive';
        if (selfId != null) {
            memberActivityStates.set(selfId, 'inactive');
        }
        whisperActivityState();
        rebuildMembers(currentMembers.map(({ id, name }) => ({ id, name })));

        if (isAuthenticated && currentPageUrl) {
            logPageVisit(currentPageUrl, accumulatedActiveSeconds, 'inactive');
        }

        accumulatedActiveSeconds = 0;
        pageStartTime = Date.now();

        disconnectTimer = setTimeout(() => {
            const inactiveSeconds = Math.round((Date.now() - pageStartTime) / 1000);
            if (isAuthenticated && currentPageUrl) {
                logPageVisit(currentPageUrl, inactiveSeconds, 'disconnected');
            }
            accumulatedActiveSeconds = 0;
            pageStartTime = 0;
            leaveChannel();
            setConnectionStatus('disconnected');
        }, DISCONNECT_TIMEOUT);
    }, INACTIVITY_TIMEOUT);
}

function logPageVisit(url: string, durationSeconds: number, status: string): void {
    if (!isAuthenticated || !url) return;

    fetch('/activity-log', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '',
        },
        body: JSON.stringify({ url, duration_seconds: durationSeconds, status }),
        keepalive: true,
    });
}

function trackPageChange(): void {
    if (!isAuthenticated) return;

    const now = Date.now();
    if (currentPageUrl && pageStartTime > 0) {
        if (activityState === 'active') {
            accumulatedActiveSeconds += Math.round((now - pageStartTime) / 1000);
            logPageVisit(currentPageUrl, accumulatedActiveSeconds, 'active');
        } else {
            const elapsedSeconds = Math.round((now - pageStartTime) / 1000);
            logPageVisit(currentPageUrl, elapsedSeconds, 'inactive');
        }
    }

    currentPageUrl = window.location.pathname;
    pageStartTime = now;
    accumulatedActiveSeconds = 0;
}

function handleActivity(): void {
    const now = Date.now();
    if (now - lastActivityTime < ACTIVITY_THROTTLE) return;
    lastActivityTime = now;

    if (!presenceChannel) {
        activityState = 'active';
        if (selfId != null) {
            memberActivityStates.set(selfId, 'active');
        }
        if (!echo) {
            createEchoInstance();
        }
        joinChannel();
        setConnectionStatus('connected');
        pageStartTime = now;
        accumulatedActiveSeconds = 0;
    } else if (activityState === 'inactive') {
        activityState = 'active';
        if (selfId != null) {
            memberActivityStates.set(selfId, 'active');
        }
        whisperActivityState();
        rebuildMembers(currentMembers.map(({ id, name }) => ({ id, name })));
        pageStartTime = now;
    }

    resetInactivityTimer();
}

export function initializePresence(userId?: number | string): void {
    if (typeof window === 'undefined') return;

    selfId = userId ?? null;
    isAuthenticated = userId != null;

    createEchoInstance();

    if (selfId != null) {
        memberUrls.set(selfId, window.location.pathname);
    }

    joinChannel();

    document.addEventListener('mousemove', handleActivity, { passive: true });
    document.addEventListener('touchstart', handleActivity, { passive: true });
    document.addEventListener('keydown', handleActivity, { passive: true });
    resetInactivityTimer();

    currentPageUrl = window.location.pathname;
    pageStartTime = Date.now();

    router.on('navigate', (event) => {
        const page = (event as CustomEvent<{ page: { props: { auth: { user?: { id: number | string } } } } }>).detail
            ?.page;
        const newUserId = page?.props?.auth?.user?.id ?? null;

        if (newUserId !== selfId) {
            if (isAuthenticated && currentPageUrl && pageStartTime > 0) {
                if (activityState === 'active') {
                    accumulatedActiveSeconds += Math.round((Date.now() - pageStartTime) / 1000);
                    logPageVisit(currentPageUrl, accumulatedActiveSeconds, 'active');
                } else {
                    const elapsedSeconds = Math.round((Date.now() - pageStartTime) / 1000);
                    logPageVisit(currentPageUrl, elapsedSeconds, activityState);
                }
            }

            leaveChannel();
            clearTimers();
            destroyEchoInstance();

            selfId = newUserId;
            isAuthenticated = newUserId != null;
            activityState = 'active';

            createEchoInstance();

            if (selfId != null) {
                memberUrls.set(selfId, window.location.pathname);
            }
            joinChannel();
            resetInactivityTimer();

            currentPageUrl = window.location.pathname;
            pageStartTime = Date.now();
            accumulatedActiveSeconds = 0;
        } else {
            trackPageChange();
        }

        if (selfId != null) {
            memberUrls.set(selfId, window.location.pathname);
        }
        whisperLocation();
    });

    window.addEventListener('beforeunload', () => {
        if (isAuthenticated && currentPageUrl && pageStartTime > 0) {
            if (activityState === 'active') {
                accumulatedActiveSeconds += Math.round((Date.now() - pageStartTime) / 1000);
                const status = presenceChannel ? 'active' : 'disconnected';
                logPageVisit(currentPageUrl, accumulatedActiveSeconds, status);
            } else {
                const elapsedSeconds = Math.round((Date.now() - pageStartTime) / 1000);
                const status = presenceChannel ? activityState : 'disconnected';
                logPageVisit(currentPageUrl, elapsedSeconds, status);
            }
        }
    });
}

export function usePresence(): { members: PresenceMember[]; connectionStatus: ConnectionStatus } {
    const members = useSyncExternalStore(subscribe, () => currentMembers, () => [] as PresenceMember[]);
    const connectionStatus = useSyncExternalStore(
        subscribe,
        () => currentConnectionStatus,
        () => 'connecting' as ConnectionStatus,
    );
    return { members, connectionStatus };
}
