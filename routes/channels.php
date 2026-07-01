<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('online', function (?User $user) {
    if ($user) {
        return ['id' => $user->id, 'name' => $user->name];
    }

    $guestId = random_int(100000, 999999);

    return ['id' => 'guest-'.$guestId, 'name' => (string) $guestId];
});
