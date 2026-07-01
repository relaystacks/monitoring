<?php

namespace Tests\Feature;

use App\Enums\TeamRole;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class TeamMonitoringTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_access_team_monitoring(): void
    {
        $team = Team::factory()->create();

        $response = $this->get("/{$team->slug}/monitoring");

        $response->assertRedirect('/login');
    }

    public function test_non_member_cannot_access_team_monitoring(): void
    {
        $user = User::factory()->create();
        $team = Team::factory()->create();

        $response = $this->actingAs($user)->get("/{$team->slug}/monitoring");

        $response->assertForbidden();
    }

    public function test_team_member_can_access_team_monitoring(): void
    {
        $user = User::factory()->create();
        $team = Team::factory()->create();
        $team->members()->attach($user, ['role' => TeamRole::Member->value]);

        $response = $this->actingAs($user)->get("/{$team->slug}/monitoring");

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('team-monitoring')
        );
    }

    public function test_team_monitoring_passes_team_members(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $team = Team::factory()->create();
        $team->members()->attach($owner, ['role' => TeamRole::Owner->value]);
        $team->members()->attach($member, ['role' => TeamRole::Member->value]);

        $response = $this->actingAs($owner)->get("/{$team->slug}/monitoring");

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('team-monitoring')
            ->has('teamMembers', 2)
            ->where('teamName', $team->name)
            ->where('teamSlug', $team->slug)
        );
    }

    public function test_team_monitoring_does_not_include_non_members(): void
    {
        $member = User::factory()->create();
        $nonMember = User::factory()->create();
        $team = Team::factory()->create();
        $team->members()->attach($member, ['role' => TeamRole::Member->value]);

        $response = $this->actingAs($member)->get("/{$team->slug}/monitoring");

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('team-monitoring')
            ->has('teamMembers', 1)
        );
    }
}
