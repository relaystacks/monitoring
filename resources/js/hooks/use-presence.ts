import { router } from '@inertiajs/react';
import Echo from 'laravel-echo';
import { io } from 'socket.io-client';
import { useSyncExternalStore } from 'react';

export type PresenceMember = {
    id: number | string;
    name: string;
    currentUrl?: string;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

type WhisperLocationData = {
    url: string;
    _sender?: { user_id: number | string; user_info: { id: number | string; name: string } };
};

const listeners = new Set<() => void>();
let currentMembers: PresenceMember[] = [];
let currentConnectionStatus: ConnectionStatus = 'connecting';
const memberUrls = new Map<number | string, string>();

let echo: Echo | null = null;
let presenceChannel: ReturnType<Echo['join']> | null = null;
let isActive = true;
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let lastActivityTime = 0;

const INACTIVITY_TIMEOUT = 30_000;
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
    }));
    notify();
}

function whisperLocation(): void {
    presenceChannel?.whisper('location-update', { url: window.location.pathname });
}

function joinChannel(): void {
    if (!echo || presenceChannel) return;

    presenceChannel = echo
        .join('online')
        .here((ms: Array<{ id: number | string; name: string }>) => {
            rebuildMembers(ms);
            whisperLocation();
        })
        .joining((m: { id: number | string; name: string }) => {
            const raw = [...currentMembers.map(({ id, name }) => ({ id, name })), { id: m.id, name: m.name }];
            rebuildMembers(raw);
            whisperLocation();
        })
        .leaving((m: { id: number | string; name: string }) => {
            memberUrls.delete(m.id);
            const raw = currentMembers.filter((u) => u.id !== m.id).map(({ id, name }) => ({ id, name }));
            rebuildMembers(raw);
        })
        .listenForWhisper('location-update', (data: WhisperLocationData) => {
            const senderId = data._sender?.user_info?.id;
            if (senderId != null) {
                memberUrls.set(senderId, data.url);
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
    notify();
}

function resetInactivityTimer(): void {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        isActive = false;
        leaveChannel();
    }, INACTIVITY_TIMEOUT);
}

function handleActivity(): void {
    const now = Date.now();
    if (now - lastActivityTime < ACTIVITY_THROTTLE) return;
    lastActivityTime = now;

    if (!isActive) {
        isActive = true;
        joinChannel();
    }
    resetInactivityTimer();
}

export function initializePresence(): void {
    if (typeof window === 'undefined') return;

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

    joinChannel();

    document.addEventListener('mousemove', handleActivity, { passive: true });
    document.addEventListener('touchstart', handleActivity, { passive: true });
    document.addEventListener('keydown', handleActivity, { passive: true });
    resetInactivityTimer();

    router.on('navigate', () => {
        whisperLocation();
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
