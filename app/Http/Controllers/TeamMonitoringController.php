<?php

namespace App\Http\Controllers;

use App\Models\Team;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TeamMonitoringController extends Controller
{
    public function __invoke(Request $request, Team $current_team): Response
    {
        $teamMembers = $current_team->members()->get()->map(fn (User $member) => [
            'id' => $member->id,
            'name' => $member->name,
            'email' => $member->email,
        ]);

        return Inertia::render('team-monitoring', [
            'teamMembers' => $teamMembers,
            'teamName' => $current_team->name,
            'teamSlug' => $current_team->slug,
        ]);
    }
}
