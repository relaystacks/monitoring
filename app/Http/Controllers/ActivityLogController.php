<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'string', 'max:2048'],
            'duration_seconds' => ['nullable', 'integer', 'min:0'],
        ]);

        ActivityLog::create([
            'user_id' => $request->user()->id,
            'url' => $validated['url'],
            'duration_seconds' => $validated['duration_seconds'] ?? null,
        ]);

        return response()->json(['status' => 'ok'], 201);
    }
}
