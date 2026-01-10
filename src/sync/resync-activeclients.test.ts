/**
 * Resync activeClients Test
 * 
 * Tests that handleResyncSnapshot correctly updates activeClients.
 * Bug scenario: after resync, stale clients remain in activeClients.
 */
import { describe, test, expect, vi } from 'vitest';
import { Game } from '../game';
import { Transform2D, Player } from '../components';
import { encode, decode } from '../codec';
import { computePartitionCount } from './partition';

function createMockConnection(clientId: string) {
    return {
        clientId,
        send: vi.fn(),
        sendSnapshot: vi.fn(),
        sendStateHash: vi.fn(),
        sendPartitionData: vi.fn(),
        requestResync: vi.fn(),
        onMessage: vi.fn(),
        onInput: vi.fn(),
        close: vi.fn()
    };
}

describe('Resync activeClients Bug', () => {
    test('loadNetworkSnapshot should clear stale activeClients', () => {
        // === SETUP: Game with 3 clients ===
        const conn = createMockConnection('client-a');
        const game = new Game({ tickRate: 60 });
        (game as any).connection = conn;
        (game as any).localClientIdStr = 'client-a';

        game.defineEntity('player')
            .with(Transform2D)
            .with(Player);

        (game as any).callbacks = {
            onConnect: (clientId: string) => {
                const p = game.spawn('player', { x: 0, y: 0 });
                p.get(Player).clientId = (game as any).internClientId(clientId);
            },
            onDisconnect: (clientId: string) => {
                const numId = (game as any).internClientId(clientId);
                for (const entity of game.query('player')) {
                    if (entity.get(Player).clientId === numId) {
                        entity.destroy();
                    }
                }
            }
        };

        // Three clients join
        (game as any).processInput({ seq: 1, clientId: 'client-a', data: { type: 'join', clientId: 'client-a' } });
        (game as any).processInput({ seq: 2, clientId: 'client-b', data: { type: 'join', clientId: 'client-b' } });
        (game as any).processInput({ seq: 3, clientId: 'client-c', data: { type: 'join', clientId: 'client-c' } });
        (game as any).world.tick(0);

        console.log('After 3 joins:');
        console.log('  activeClients:', (game as any).activeClients);
        expect((game as any).activeClients.length).toBe(3);
        expect((game as any).activeClients).toContain('client-a');
        expect((game as any).activeClients).toContain('client-b');
        expect((game as any).activeClients).toContain('client-c');

        // === SIMULATE: Authority has client-b leave, takes snapshot ===
        // Create a "authority" game to generate the snapshot
        const authConn = createMockConnection('client-a');
        const authority = new Game({ tickRate: 60 });
        (authority as any).connection = authConn;
        (authority as any).localClientIdStr = 'client-a';

        authority.defineEntity('player')
            .with(Transform2D)
            .with(Player);

        (authority as any).callbacks = {
            onConnect: (clientId: string) => {
                const p = authority.spawn('player', { x: 0, y: 0 });
                p.get(Player).clientId = (authority as any).internClientId(clientId);
            },
            onDisconnect: (clientId: string) => {
                const numId = (authority as any).internClientId(clientId);
                for (const entity of authority.query('player')) {
                    if (entity.get(Player).clientId === numId) {
                        entity.destroy();
                    }
                }
            }
        };

        // Authority: 3 clients join, then client-b leaves
        (authority as any).processInput({ seq: 1, clientId: 'client-a', data: { type: 'join', clientId: 'client-a' } });
        (authority as any).processInput({ seq: 2, clientId: 'client-b', data: { type: 'join', clientId: 'client-b' } });
        (authority as any).processInput({ seq: 3, clientId: 'client-c', data: { type: 'join', clientId: 'client-c' } });
        (authority as any).world.tick(0);
        
        // client-b leaves on authority
        (authority as any).processInput({ seq: 4, clientId: 'client-b', data: { type: 'leave', clientId: 'client-b' } });
        (authority as any).world.tick(1);

        console.log('Authority after client-b leaves:');
        console.log('  activeClients:', (authority as any).activeClients);
        expect((authority as any).activeClients.length).toBe(2);

        // Take snapshot from authority
        const snapshot = (authority as any).getNetworkSnapshot();
        console.log('Snapshot entities:', snapshot.entities.length);

        // === SCENARIO: Game loads snapshot (simulating resync) ===
        // Game still thinks client-b is active, but authority says no
        console.log('\nBefore loadNetworkSnapshot:');
        console.log('  game activeClients:', (game as any).activeClients);

        // Encode/decode like real network
        const encoded = encode({ snapshot, hash: 0 });
        const decoded = decode(encoded) as any;
        
        // Load the snapshot (simulating handleResyncSnapshot calling loadNetworkSnapshot)
        (game as any).loadNetworkSnapshot(decoded.snapshot);

        console.log('After loadNetworkSnapshot:');
        console.log('  game activeClients:', (game as any).activeClients);

        // BUG CHECK: Does game still have client-b in activeClients?
        if ((game as any).activeClients.includes('client-b')) {
            console.log('!!! BUG: Stale client-b still in activeClients after resync!');
        }

        // After fix: game should match authority
        expect((game as any).activeClients.length).toBe(2);
        expect((game as any).activeClients).toContain('client-a');
        expect((game as any).activeClients).toContain('client-c');
        expect((game as any).activeClients).not.toContain('client-b');
    });
});
