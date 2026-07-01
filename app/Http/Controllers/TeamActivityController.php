<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TeamActivityController extends Controller
{
    public function __invoke(Request $request, Team $current_team, User $user): Response
    {
        abort_unless($user->belongsToTeam($current_team), 403);

        $activities = ActivityLog::where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->paginate(25);

        return Inertia::render('team-activity', [
            'targetUser' => [
                'id' => $user->id,
                'name' => $user->name,
            ],
            'activities' => $activities,
            'teamName' => $current_team->name,
            'teamSlug' => $current_team->slug,
        ]);
    }
}
