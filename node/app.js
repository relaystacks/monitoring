'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const express = require('express');
const { Server } = require('@relaystacks/conduit-echo');

const app = express();
const httpServer = http.createServer(app);

const conduit = new Server(httpServer, {
    socketPath:   process.env.CONDUIT_SOCKET_PATH   || '/tmp/laravel.sock',
    authEndpoint: process.env.CONDUIT_AUTH_ENDPOINT || 'http://127.0.0.1/broadcasting/auth',
    ioPath:       process.env.CONDUIT_IO_PATH       || '/socket.io',
    corsOrigin:   (process.env.CONDUIT_CORS_ORIGIN || 'http://localhost').split(',').map(s => s.trim()),
    secret:       process.env.CONDUIT_SECRET        || null,
});

// ─── Diagnostic helpers ─────────────────────────────────────────────

function getConfigStatus() {
    const opts = conduit._options;
    return {
        socketPath: opts.socketPath,
        authEndpoint: opts.authEndpoint,
        ioPath: opts.ioPath,
        corsOrigin: opts.corsOrigin,
        secret: opts.secret ? '[SET]' : '[NOT SET]',
        authMaxSockets: opts.authMaxSockets,
        authKeepAliveMsecs: opts.authKeepAliveMsecs,
        authTimeoutMs: opts.authTimeoutMs,
        maxFrameBytes: opts.maxFrameBytes,
        port: process.env.PORT || 6001,
        env: {
            NODE_ENV:               process.env.NODE_ENV               || '[NOT SET]',
            CONDUIT_SOCKET_PATH:    process.env.CONDUIT_SOCKET_PATH    || '[NOT SET]',
            CONDUIT_AUTH_ENDPOINT:  process.env.CONDUIT_AUTH_ENDPOINT  || '[NOT SET]',
            CONDUIT_IO_PATH:        process.env.CONDUIT_IO_PATH        || '[NOT SET]',
            CONDUIT_CORS_ORIGIN:    process.env.CONDUIT_CORS_ORIGIN    || '[NOT SET]',
            CONDUIT_SECRET:         process.env.CONDUIT_SECRET ? '[SET]' : '[NOT SET]',
            PORT:                   process.env.PORT                   || '[NOT SET]',
        },
    };
}

function getIpcStatus() {
    const socketPath = conduit._options.socketPath;
    const result = {
        socketPath,
        socketExists: false,
        socketPermissions: null,
        socketIsSocket: null,
        socketError: null,
        serverListening: false,
    };

    try {
        const stat = fs.statSync(socketPath);
        result.socketExists = true;
        result.socketPermissions = '0' + (stat.mode & 0o777).toString(8);
        result.socketIsSocket = stat.isSocket();
    } catch (err) {
        result.socketError = err.code;
    }

    const ipcServer = conduit._ipcReceiver?._server;
    result.serverListening = ipcServer?.listening ?? false;

    return result;
}

function testAuthReachability() {
    const endpoint = conduit._authService._endpoint;
    const timeoutMs = conduit._authService._timeoutMs;
    const isHttps = endpoint.protocol === 'https:';

    const result = {
        endpoint: endpoint.href,
        hostname: endpoint.hostname,
        port: endpoint.port || (isHttps ? '443' : '80'),
        path: endpoint.pathname,
        reachable: false,
        test: null,
    };

    const body = 'socket_id=health-check&channel_name=health-check';
    const lib = isHttps ? https : http;

    const options = {
        hostname: endpoint.hostname,
        port: endpoint.port || (isHttps ? 443 : 80),
        path: endpoint.pathname,
        method: 'POST',
        headers: {
            'Content-Type':     'application/x-www-form-urlencoded',
            'Content-Length':   Buffer.byteLength(body),
            'Accept':           'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        rejectUnauthorized: false,
    };

    return new Promise((resolve) => {
        const start = Date.now();
        const req = lib.request(options, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                result.reachable = true;
                result.test = {
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage,
                    responseSnippet: Buffer.concat(chunks).toString('utf8').slice(0, 500),
                    latencyMs: Date.now() - start,
                    error: null,
                };
                resolve(result);
            });
        });

        req.setTimeout(timeoutMs, () =>
            req.destroy(new Error(`Timed out after ${timeoutMs}ms`))
        );

        req.on('error', (err) => {
            result.test = {
                error: err.message,
                code: err.code || null,
                latencyMs: Date.now() - start,
            };
            resolve(result);
        });

        req.write(body);
        req.end();
    });
}

function getSocketIoStatus() {
    const io = conduit._io;
    if (!io) return { connectedCount: 0, sockets: [], error: 'Socket.IO not initialized' };

    const sockets = [];
    for (const [, socket] of io.sockets.sockets) {
        sockets.push({
            id: socket.id,
            connected: socket.connected,
            rooms: [...socket.rooms],
            allowedChannels: [...(socket.allowedChannels || [])],
            user: socket.user ?? null,
            transport: socket.conn?.transport?.name ?? 'unknown',
            remoteAddress: socket.handshake?.address ?? 'unknown',
            handshakeHeaders: {
                cookie: socket.handshake?.headers?.cookie ? '[PRESENT]' : '[MISSING]',
                origin: socket.handshake?.headers?.origin ?? '[MISSING]',
            },
            handshakeTime: socket.handshake?.time ?? null,
        });
    }

    return { connectedCount: sockets.length, sockets };
}

function getPresenceStatus() {
    const pm = conduit._presenceManager;
    const channels = {};

    for (const [channel, socketMap] of pm._channels) {
        const sockets = {};
        for (const [socketId, data] of socketMap) {
            sockets[socketId] = { user_id: data.user_id };
        }

        channels[channel] = {
            uniqueMembers: pm.members(channel).length,
            totalSockets: socketMap.size,
            members: pm.members(channel),
            sockets,
        };
    }

    return { channelCount: pm._channels.size, channels };
}

function getWhisperStatus() {
    const io = conduit._io;
    if (!io) return { relayCapable: false, socketsWithAllowedChannels: 0, details: [] };

    const details = [];
    let count = 0;

    for (const [, socket] of io.sockets.sockets) {
        const allowed = [...(socket.allowedChannels || [])];
        const whisperChannels = allowed.filter(
            ch => ch.startsWith('private-') || ch.startsWith('presence-')
        );
        if (allowed.length > 0) count++;

        details.push({
            socketId: socket.id,
            allowedChannels: allowed,
            whisperableChannels: whisperChannels,
            canWhisper: whisperChannels.length > 0,
        });
    }

    return { relayCapable: count > 0, socketsWithAllowedChannels: count, details };
}

// ─── Routes ─────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
    if (!conduit._io) {
        return res.json({ status: 'starting', message: 'Server not yet initialized' });
    }

    const auth = await testAuthReachability();

    res.json({
        status: 'ok',
        app: 'conduit-demo',
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor(process.uptime()),
        config: getConfigStatus(),
        ipc: getIpcStatus(),
        auth,
        socketio: getSocketIoStatus(),
        presence: getPresenceStatus(),
        whisper: getWhisperStatus(),
    });
});

app.get('/health/test-auth', async (req, res) => {
    if (!conduit._authService) {
        return res.json({ success: false, error: 'Server not yet initialized' });
    }

    const channel = req.query.channel || 'presence-online';
    const fakeSocketId = 'health-check-' + Date.now();

    try {
        const result = await conduit._authService.authorize(fakeSocketId, channel, '');
        res.json({ success: true, channel, response: result });
    } catch (err) {
        res.json({
            success: false,
            channel,
            statusCode: err.statusCode ?? null,
            message: err.message,
            body: err.body ? err.body.slice(0, 500) : null,
        });
    }
});

// ─── Start ──────────────────────────────────────────────────────────

conduit.start().then(() => {
    const port = process.env.PORT || 6001;
    httpServer.listen(port, () => {
        console.log(`[conduit-demo] Node server listening on port ${port}`);
    });
}).catch((err) => {
    console.error('[conduit-demo] Fatal startup error:', err);
    process.exit(1);
});

process.on('SIGTERM', async () => {
    console.log('[conduit-demo] SIGTERM — shutting down gracefully.');
    await conduit.stop();
    httpServer.close(() => process.exit(0));
});
