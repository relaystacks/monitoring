<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Broadcasting\BroadcastManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Inertia\Inertia;
use Inertia\Response;

class HealthController extends Controller
{
    public function __invoke(Request $request): Response
    {
        return Inertia::render('health', [
            'config' => $this->getConfig(),
            'ipc' => $this->getIpcStatus(),
            'authTest' => $this->testBroadcastAuth($request),
            'nodeHealth' => $this->fetchNodeHealth(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function getConfig(): array
    {
        return [
            'broadcast_driver' => config('broadcasting.default'),
            'conduit' => [
                'socket_path' => config('broadcasting.connections.conduit.socket_path'),
                'secret' => config('broadcasting.connections.conduit.secret') ? '[SET]' : '[NOT SET]',
                'timeout' => config('broadcasting.connections.conduit.timeout'),
                'url' => config('broadcasting.connections.conduit.url'),
            ],
            'app_url' => config('app.url'),
            'app_env' => config('app.env'),
            'session_driver' => config('session.driver'),
            'session_domain' => config('session.domain'),
            'session_same_site' => config('session.same_site'),
            'session_secure' => config('session.secure_cookie'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function getIpcStatus(): array
    {
        /** @var string $socketPath */
        $socketPath = config('broadcasting.connections.conduit.socket_path', '/tmp/laravel.sock');

        $result = [
            'socket_path' => $socketPath,
            'exists' => false,
            'is_socket' => null,
            'permissions' => null,
            'writable' => false,
            'error' => null,
        ];

        if (! file_exists($socketPath)) {
            $result['error'] = 'Socket file does not exist';

            return $result;
        }

        $result['exists'] = true;
        $result['is_socket'] = filetype($socketPath) === 'socket';
        $result['permissions'] = substr(sprintf('%o', fileperms($socketPath)), -4);
        $result['writable'] = is_writable($socketPath);

        if (! $result['writable']) {
            $result['error'] = 'Socket file exists but is not writable by PHP process';
        }

        return $result;
    }

    /**
     * @return array<string, mixed>
     */
    private function testBroadcastAuth(Request $request): array
    {
        $fakeRequest = Request::create('/broadcasting/auth', 'POST', [
            'socket_id' => 'health-test-'.time(),
            'channel_name' => 'presence-online',
        ]);

        $fakeRequest->setUserResolver($request->getUserResolver());

        try {
            /** @var BroadcastManager $manager */
            $manager = app(BroadcastManager::class);
            $broadcaster = $manager->connection('conduit');
            $response = $broadcaster->auth($fakeRequest);

            return [
                'success' => true,
                'response' => is_string($response) ? json_decode($response, true) : $response,
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
                'exception' => class_basename($e),
            ];
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function fetchNodeHealth(): ?array
    {
        $urls = [
            'http://127.0.0.1:6001/health',
        ];

        $conduitUrl = config('broadcasting.connections.conduit.url');
        if ($conduitUrl) {
            $urls[] = rtrim((string) $conduitUrl, '/').'/health';
        }

        foreach ($urls as $url) {
            try {
                $response = Http::timeout(3)
                    ->withoutVerifying()
                    ->get($url);

                if ($response->successful()) {
                    return [
                        'fetched_from' => $url,
                        ...$response->json(),
                    ];
                }
            } catch (\Throwable) {
                continue;
            }
        }

        return [
            'error' => 'Could not reach Node health endpoint',
            'urls_tried' => $urls,
        ];
    }
}
