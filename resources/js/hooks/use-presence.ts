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
        activityState = 'inactive';
        if (selfId != null) {
            memberActivityStates.set(selfId, 'inactive');
        }
        whisperActivityState();
        rebuildMembers(currentMembers.map(({ id, name }) => ({ id, name })));

        disconnectTimer = setTimeout(() => {
            activityState = 'active';
            leaveChannel();
            setConnectionStatus('disconnected');
        }, DISCONNECT_TIMEOUT);
    }, INACTIVITY_TIMEOUT);
}

function logPageVisit(url: string, durationSeconds: number): void {
    if (!isAuthenticated || !url) return;

    const data = JSON.stringify({ url, duration_seconds: durationSeconds });

    if (typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/activity-log', new Blob([data], { type: 'application/json' }));
    } else {
        fetch('/activity-log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '',
            },
            body: data,
            keepalive: true,
        });
    }
}

function trackPageChange(): void {
    if (!isAuthenticated) return;

    const now = Date.now();
    if (currentPageUrl && pageStartTime > 0) {
        const durationSeconds = Math.round((now - pageStartTime) / 1000);
        logPageVisit(currentPageUrl, durationSeconds);
    }

    currentPageUrl = window.location.pathname;
    pageStartTime = now;
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
        joinChannel();
        setConnectionStatus('connected');
    } else if (activityState === 'inactive') {
        activityState = 'active';
        if (selfId != null) {
            memberActivityStates.set(selfId, 'active');
        }
        whisperActivityState();
        rebuildMembers(currentMembers.map(({ id, name }) => ({ id, name })));
    }

    resetInactivityTimer();
}

export function initializePresence(userId?: number | string): void {
    if (typeof window === 'undefined') return;

    selfId = userId ?? null;
    isAuthenticated = userId != null;

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

    router.on('navigate', () => {
        trackPageChange();

        if (selfId != null) {
            memberUrls.set(selfId, window.location.pathname);
        }
        whisperLocation();
    });

    window.addEventListener('beforeunload', () => {
        if (isAuthenticated && currentPageUrl && pageStartTime > 0) {
            const durationSeconds = Math.round((Date.now() - pageStartTime) / 1000);
            logPageVisit(currentPageUrl, durationSeconds);
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
