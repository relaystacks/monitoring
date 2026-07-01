<?php

namespace Database\Factories;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ActivityLog>
 */
class ActivityLogFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'url' => fake()->randomElement(['/', '/dashboard', '/settings/profile', '/monitoring']),
            'duration_seconds' => fake()->numberBetween(1, 300),
            'status' => fake()->randomElement(['active', 'inactive', 'disconnected']),
        ];
    }

    /**
     * Indicate that the duration has not been recorded yet.
     */
    public function withoutDuration(): static
    {
        return $this->state(fn (array $attributes) => [
            'duration_seconds' => null,
        ]);
    }
}
