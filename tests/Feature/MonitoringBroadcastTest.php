<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Broadcasting\BroadcastManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RelayStack\Conduit\TransportInterface;
use RelayStack\LaravelConduit\Broadcasters\ConduitBroadcaster;
use Tests\TestCase;

class MonitoringBroadcastTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $transport = $this->createMock(TransportInterface::class);

        $manager = app(BroadcastManager::class);
        $manager->extend('conduit', fn () => new ConduitBroadcaster($transport));

        config(['broadcasting.default' => 'conduit']);

        require base_path('routes/channels.php');
    }

    public function test_monitoring_page_is_accessible_without_auth(): void
    {
        $response = $this->get('/monitoring');

        $response->assertOk();
    }

    public function test_monitoring_page_is_accessible_with_auth(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get('/monitoring');

        $response->assertOk();
    }

    public function test_authenticated_user_can_auth_presence_monitoring_channel(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/broadcasting/auth', [
            'socket_id' => 'test-socket-id',
            'channel_name' => 'presence-online',
        ]);

        $response->assertOk();

        $data = json_decode($response->getContent(), true);

        $this->assertArrayHasKey('channel_data', $data);
        $this->assertEquals($user->id, $data['channel_data']['user_id']);
        $this->assertEquals($user->name, $data['channel_data']['user_info']['name']);
    }

    public function test_guest_can_auth_presence_monitoring_channel(): void
    {
        $response = $this->post('/broadcasting/auth', [
            'socket_id' => 'test-socket-id',
            'channel_name' => 'presence-online',
        ]);

        $response->assertOk();

        $data = json_decode($response->getContent(), true);

        $this->assertArrayHasKey('channel_data', $data);
        $this->assertStringStartsWith('guest-', (string) $data['channel_data']['user_id']);
        $this->assertIsNumeric($data['channel_data']['user_info']['name']);
    }

    public function test_guest_cannot_auth_private_channel(): void
    {
        $response = $this->post('/broadcasting/auth', [
            'socket_id' => 'test-socket-id',
            'channel_name' => 'private-some-channel',
        ]);

        $response->assertForbidden();
    }
}
