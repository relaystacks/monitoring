<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('monitoring', fn ($user) => [
    'id'   => $user->id,
    'name' => $user->name,
]);
