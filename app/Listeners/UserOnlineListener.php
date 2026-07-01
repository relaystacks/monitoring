<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Events\UserSessionChanged;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;

class UserOnlineListener
{
    public function handleLogin(Login $event): void
    {
        $user = $event->user;

        event(new UserSessionChanged(
            user: [
                'id'       => $user->getAuthIdentifier(),
                'username' => $user->name ?? $user->email,
            ],
            status: 'online',
            connectedAt: now()->toISOString(),
        ));
    }

    public function handleLogout(Logout $event): void
    {
        $user = $event->user;

        if (! $user) {
            return;
        }

        event(new UserSessionChanged(
            user: [
                'id'       => $user->getAuthIdentifier(),
                'username' => $user->name ?? $user->email,
            ],
            status: 'offline',
            connectedAt: now()->toISOString(),
        ));
    }
}
