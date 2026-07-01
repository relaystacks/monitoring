<?php

return [

    'default' => env('BROADCAST_CONNECTION', 'null'),

    'connections' => [

        'conduit' => [
            'driver'      => 'conduit',
            'socket_path' => env('CONDUIT_SOCKET_PATH', '/tmp/laravel.sock'),
            'secret'      => env('CONDUIT_SECRET', null),
            'timeout'     => env('CONDUIT_TIMEOUT', 2),
        ],

        'log' => [
            'driver' => 'log',
        ],

        'null' => [
            'driver' => 'null',
        ],

    ],

];
