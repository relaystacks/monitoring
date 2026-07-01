'use strict';

const http = require('http');
const express = require('express');
const { Server } = require('@relaystack/conduit-echo');

const app = express();
const httpServer = http.createServer(app);

app.get('/health', (_req, res) => res.json({
    status: 'ok',
    app: 'conduit-demo',
}));

const conduit = new Server(httpServer, {
    socketPath:   process.env.CONDUIT_SOCKET_PATH   || '/tmp/laravel.sock',
    authEndpoint: process.env.CONDUIT_AUTH_ENDPOINT || 'http://127.0.0.1/broadcasting/auth',
    ioPath:       process.env.CONDUIT_IO_PATH       || '/socket.io',
    corsOrigin:   (process.env.CONDUIT_CORS_ORIGIN || 'http://localhost').split(',').map(s => s.trim()),
    secret:       process.env.CONDUIT_SECRET        || null,
});

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
