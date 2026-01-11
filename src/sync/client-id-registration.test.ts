/**
 * Unit test for clientId registration fix
 *
 * This tests the fix for the bug where late joiners couldn't decode
 * inputs from existing clients because the SDK's clientHash->clientId
 * map wasn't populated.
 *
 * The fix registers clientIds from Player entities in the snapshot.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game, Player, Transform2D } from '../index';

describe('ClientId Registration from Snapshot', () => {
    let game: Game;
    let mockNetwork: { registerClientId: ReturnType<typeof vi.fn> };

    const setupGame = () => {
        const g = new Game({
            tickRate: 20,
            onConnect: () => {},
            onDisconnect: () => {}
        });

        // Define entity type with Player component
        g.defineEntity('cell')
            .with(Transform2D)
            .with(Player);

        return g;
    };

    beforeEach(() => {
        // Mock the network SDK
        mockNetwork = {
            registerClientId: vi.fn()
        };

        // Set up global window.moduNetwork mock
        (global as any).window = {
            moduNetwork: mockNetwork
        };

        game = setupGame();
    });

    afterEach(() => {
        delete (global as any).window;
    });

    it('should register clientIds from Player entities when loading snapshot', () => {
        // Simulate a snapshot with existing players
        const existingClientId1 = 'client-alpha-123';
        const existingClientId2 = 'client-beta-456';

        // Intern the clientIds first (simulates what happens during game setup)
        const numId1 = game.internClientId(existingClientId1);
        const numId2 = game.internClientId(existingClientId2);

        // Create entities with Player component (simulates existing game state)
        const entity1 = game.spawn('cell', { clientId: existingClientId1, x: 100, y: 100 });
        const entity2 = game.spawn('cell', { clientId: existingClientId2, x: 200, y: 200 });

        // Get snapshot
        const snapshot = (game as any).getNetworkSnapshot();
        expect(snapshot.entities.length).toBe(2);

        // Create new game for simulating late joiner
        game = setupGame();
        mockNetwork.registerClientId.mockClear();

        // Load the snapshot (this should register clientIds)
        (game as any).loadNetworkSnapshot(snapshot);

        // Verify clientIds were registered
        expect(mockNetwork.registerClientId).toHaveBeenCalledWith(existingClientId1);
        expect(mockNetwork.registerClientId).toHaveBeenCalledWith(existingClientId2);
        expect(mockNetwork.registerClientId).toHaveBeenCalledTimes(2);
    });

    it('should not crash if network SDK is not available', () => {
        // Remove mock network
        delete (global as any).window.moduNetwork;

        // Create game and entities
        const clientId = 'test-client';
        game.internClientId(clientId);
        game.spawn('cell', { clientId, x: 100, y: 100 });

        // Get and load snapshot - should not throw
        const snapshot = (game as any).getNetworkSnapshot();

        // Create new game (simulates late joiner)
        game = setupGame();

        expect(() => {
            (game as any).loadNetworkSnapshot(snapshot);
        }).not.toThrow();
    });

    it('should populate activeClients from snapshot', () => {
        // Create entities
        const clientId1 = 'active-client-1';
        const clientId2 = 'active-client-2';

        game.internClientId(clientId1);
        game.internClientId(clientId2);

        game.spawn('cell', { clientId: clientId1, x: 100, y: 100 });
        game.spawn('cell', { clientId: clientId2, x: 200, y: 200 });

        // Get snapshot
        const snapshot = (game as any).getNetworkSnapshot();

        // Create new game (simulates late joiner)
        game = setupGame();
        (game as any).activeClients = [];

        (game as any).loadNetworkSnapshot(snapshot);

        // Check activeClients is populated
        const activeClients = game.getActiveClients();
        expect(activeClients).toContain(clientId1);
        expect(activeClients).toContain(clientId2);
        expect(activeClients.length).toBe(2);
    });
});
