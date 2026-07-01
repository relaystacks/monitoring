<?php

declare(strict_types=1);

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Queue\SerializesModels;

class UserSessionChanged implements ShouldBroadcastNow
{
    use SerializesModels;

    public function __construct(
        public readonly array  $user,
        public readonly string $status,
        public readonly string $connectedAt,
    ) {}

    /** @return array<int, PrivateChannel> */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('monitoring')];
    }

    public function broadcastAs(): string
    {
        return 'user.session.changed';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'user'        => $this->user,
            'status'      => $this->status,
            'connectedAt' => $this->connectedAt,
        ];
    }
}
