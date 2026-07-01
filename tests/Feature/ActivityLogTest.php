<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ActivityLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_store_activity_log(): void
    {
        $response = $this->postJson('/activity-log', [
            'url' => '/dashboard',
            'duration_seconds' => 30,
        ]);

        $response->assertUnauthorized();
    }

    public function test_authenticated_user_can_store_activity_log(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/activity-log', [
            'url' => '/dashboard',
            'duration_seconds' => 45,
        ]);

        $response->assertCreated();
        $response->assertJson(['status' => 'ok']);

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $user->id,
            'url' => '/dashboard',
            'duration_seconds' => 45,
        ]);
    }

    public function test_activity_log_can_be_stored_without_duration(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/activity-log', [
            'url' => '/settings/profile',
        ]);

        $response->assertCreated();

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $user->id,
            'url' => '/settings/profile',
            'duration_seconds' => null,
        ]);
    }

    public function test_activity_log_requires_url(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/activity-log', [
            'duration_seconds' => 10,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['url']);
    }

    public function test_activity_log_url_max_length(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/activity-log', [
            'url' => str_repeat('a', 2049),
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['url']);
    }

    public function test_activity_log_duration_must_be_non_negative(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/activity-log', [
            'url' => '/dashboard',
            'duration_seconds' => -1,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['duration_seconds']);
    }

    public function test_activity_log_belongs_to_user(): void
    {
        $user = User::factory()->create();
        $log = ActivityLog::factory()->for($user)->create();

        $this->assertEquals($user->id, $log->user_id);
        $this->assertTrue($log->user->is($user));
    }

    public function test_deleting_user_cascades_activity_logs(): void
    {
        $user = User::factory()->create();
        ActivityLog::factory()->for($user)->count(3)->create();

        $this->assertDatabaseCount('activity_logs', 3);

        $user->forceDelete();

        $this->assertDatabaseCount('activity_logs', 0);
    }

    public function test_activity_log_can_store_status(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/activity-log', [
            'url' => '/dashboard',
            'duration_seconds' => 30,
            'status' => 'inactive',
        ]);

        $response->assertCreated();

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $user->id,
            'url' => '/dashboard',
            'status' => 'inactive',
        ]);
    }

    public function test_activity_log_defaults_status_to_active(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/activity-log', [
            'url' => '/dashboard',
        ]);

        $response->assertCreated();

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $user->id,
            'url' => '/dashboard',
            'status' => 'active',
        ]);
    }

    public function test_activity_log_rejects_invalid_status(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/activity-log', [
            'url' => '/dashboard',
            'status' => 'invalid',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['status']);
    }
}
