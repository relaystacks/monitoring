<?php

namespace Tests\Feature;

use App\Enums\TeamRole;
use App\Models\ActivityLog;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class TeamActivityTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_access_team_activity(): void
    {
        $team = Team::factory()->create();
        $user = User::factory()->create();

        $response = $this->get("/{$team->slug}/activity/{$user->id}");

        $response->assertRedirect('/login');
    }

    public function test_non_member_cannot_access_team_activity(): void
    {
        $viewer = User::factory()->create();
        $targetUser = User::factory()->create();
        $team = Team::factory()->create();

        $response = $this->actingAs($viewer)->get("/{$team->slug}/activity/{$targetUser->id}");

        $response->assertForbidden();
    }

    public function test_member_cannot_view_activity_of_non_member(): void
    {
        $viewer = User::factory()->create();
        $nonMember = User::factory()->create();
        $team = Team::factory()->create();
        $team->members()->attach($viewer, ['role' => TeamRole::Member->value]);

        $response = $this->actingAs($viewer)->get("/{$team->slug}/activity/{$nonMember->id}");

        $response->assertForbidden();
    }

    public function test_member_can_view_activity_of_fellow_member(): void
    {
        $viewer = User::factory()->create();
        $targetUser = User::factory()->create();
        $team = Team::factory()->create();
        $team->members()->attach($viewer, ['role' => TeamRole::Member->value]);
        $team->members()->attach($targetUser, ['role' => TeamRole::Member->value]);

        ActivityLog::factory()->for($targetUser)->count(3)->create();

        $response = $this->actingAs($viewer)->get("/{$team->slug}/activity/{$targetUser->id}");

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('team-activity')
        );
    }

    public function test_activity_page_passes_target_user_info(): void
    {
        $viewer = User::factory()->create();
        $targetUser = User::factory()->create(['name' => 'Jane Doe']);
        $team = Team::factory()->create();
        $team->members()->attach($viewer, ['role' => TeamRole::Member->value]);
        $team->members()->attach($targetUser, ['role' => TeamRole::Member->value]);

        $response = $this->actingAs($viewer)->get("/{$team->slug}/activity/{$targetUser->id}");

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('team-activity')
            ->where('targetUser.id', $targetUser->id)
            ->where('targetUser.name', 'Jane Doe')
            ->where('teamName', $team->name)
            ->where('teamSlug', $team->slug)
        );
    }

    public function test_activity_page_returns_paginated_activities(): void
    {
        $viewer = User::factory()->create();
        $targetUser = User::factory()->create();
        $team = Team::factory()->create();
        $team->members()->attach($viewer, ['role' => TeamRole::Member->value]);
        $team->members()->attach($targetUser, ['role' => TeamRole::Member->value]);

        ActivityLog::factory()->for($targetUser)->count(30)->create();

        $response = $this->actingAs($viewer)->get("/{$team->slug}/activity/{$targetUser->id}");

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('team-activity')
            ->has('activities.data', 25)
            ->where('activities.total', 30)
            ->where('activities.last_page', 2)
        );
    }

    public function test_activity_page_shows_newest_first(): void
    {
        $viewer = User::factory()->create();
        $targetUser = User::factory()->create();
        $team = Team::factory()->create();
        $team->members()->attach($viewer, ['role' => TeamRole::Member->value]);
        $team->members()->attach($targetUser, ['role' => TeamRole::Member->value]);

        ActivityLog::factory()->for($targetUser)->create([
            'url' => '/old-page',
            'created_at' => now()->subHour(),
        ]);
        ActivityLog::factory()->for($targetUser)->create([
            'url' => '/new-page',
            'created_at' => now(),
        ]);

        $response = $this->actingAs($viewer)->get("/{$team->slug}/activity/{$targetUser->id}");

        $response->assertInertia(fn (Assert $page) => $page
            ->where('activities.data.0.url', '/new-page')
            ->where('activities.data.1.url', '/old-page')
        );
    }

    public function test_activity_page_only_shows_target_user_logs(): void
    {
        $viewer = User::factory()->create();
        $targetUser = User::factory()->create();
        $otherUser = User::factory()->create();
        $team = Team::factory()->create();
        $team->members()->attach($viewer, ['role' => TeamRole::Member->value]);
        $team->members()->attach($targetUser, ['role' => TeamRole::Member->value]);
        $team->members()->attach($otherUser, ['role' => TeamRole::Member->value]);

        ActivityLog::factory()->for($targetUser)->count(2)->create();
        ActivityLog::factory()->for($otherUser)->count(3)->create();

        $response = $this->actingAs($viewer)->get("/{$team->slug}/activity/{$targetUser->id}");

        $response->assertInertia(fn (Assert $page) => $page
            ->where('activities.total', 2)
        );
    }
}
