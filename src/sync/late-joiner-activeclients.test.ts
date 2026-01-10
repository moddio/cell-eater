/**
 * Late Joiner activeClients Test
 *
 * Reproduces the bug: when late joiner loads snapshot, activeClients is not populated
 * from Player entities, causing different partition counts and massive delta uploads.
 */
import { describe, test, expect, vi } from 'vitest';
import { Game } from '../game';
import { Transform2D, Player } from '../components';
import { encode, decode } from '../codec';
import { computePartitionCount } from './partition';

// Mock connection
function createMockConnection(clientId: string) {
    return {
        clientId,
        send: vi.fn(),
        sendSnapshot: vi.fn(),
        sendStateHash: vi.fn(),
        sendPartitionData: vi.fn(),
        onMessage: vi.fn(),
        onInput: vi.fn(),
        close: vi.fn()
    };
}

describe('Late Joiner activeClients Bug', () => {
    test('REPRODUCES BUG: late joiner activeClients not populated from snapshot', () => {
        // === AUTHORITY CLIENT ===
        const authorityConn = createMockConnection('authority-client-id-1234');
        const authority = new Game({ tickRate: 60 });

        // Set internal connection for testing
        (authority as any).connection = authorityConn;
        (authority as any).localClientIdStr = 'authority-client-id-1234';

        // Define entity types
        authority.defineEntity('player')
            .with(Transform2D)
            .with(Player);

        // Set up onConnect callback - use Game's internClientId for proper mapping
        (authority as any).callbacks = {
            onConnect: (clientId: string) => {
                const cell = authority.spawn('player', { x: 500, y: 500 });
                // Use the Game's internal clientId mapping so it's included in snapshot
                cell.get(Player).clientId = (authority as any).internClientId(clientId);
            }
        };

        // Simulate first client join (authority)
        (authority as any).processInput({
            seq: 1,
            clientId: 'authority-client-id-1234',
            data: { type: 'join', clientId: 'authority-client-id-1234' }
        });

        // Simulate second client join
        (authority as any).processInput({
            seq: 2,
            clientId: 'second-client-id-5678',
            data: { type: 'join', clientId: 'second-client-id-5678' }
        });

        // Run a tick
        (authority as any).world.tick(0);

        // Check authority's activeClients
        const authorityActiveClients = (authority as any).activeClients;
        console.log('Authority activeClients:', authorityActiveClients);
        console.log('Authority activeClients.length:', authorityActiveClients.length);

        expect(authorityActiveClients.length).toBe(2);
        expect(authorityActiveClients).toContain('authority-client-id-1234');
        expect(authorityActiveClients).toContain('second-client-id-5678');

        // Take snapshot for late joiner using the actual network snapshot format
        const snapshot = (authority as any).getNetworkSnapshot();

        console.log('Snapshot entities:', snapshot.entities.length);
        console.log('Snapshot types:', snapshot.types);

        // Encode/decode to simulate network transfer
        const encodedSnapshot = encode({ snapshot, hash: 0 });
        const decoded = decode(encodedSnapshot) as any;
        const decodedSnapshot = decoded.snapshot;

        // === LATE JOINER CLIENT ===
        const lateJoinerConn = createMockConnection('late-joiner-id-9999');
        const lateJoiner = new Game({ tickRate: 60 });

        // Set internal connection
        (lateJoiner as any).connection = lateJoinerConn;
        (lateJoiner as any).localClientIdStr = 'late-joiner-id-9999';

        // Define same entity types
        lateJoiner.defineEntity('player')
            .with(Transform2D)
            .with(Player);

        // Load snapshot (this is what happens when late joiner receives snapshot)
        (lateJoiner as any).loadNetworkSnapshot(decodedSnapshot);

        // Check late joiner's activeClients
        const lateJoinerActiveClients = (lateJoiner as any).activeClients;
        console.log('Late joiner activeClients:', lateJoinerActiveClients);
        console.log('Late joiner activeClients.length:', lateJoinerActiveClients.length);

        // === BUG CHECK ===
        console.log('\n=== BUG CHECK ===');
        console.log('Authority activeClients.length:', authorityActiveClients.length);
        console.log('Late joiner activeClients.length:', lateJoinerActiveClients.length);

        if (lateJoinerActiveClients.length !== authorityActiveClients.length) {
            console.log('!!! BUG REPRODUCED !!!');
            console.log('Late joiner has different activeClients count than authority!');
            console.log('This causes different partition counts and massive delta uploads.');
        }

        // After fix: should be equal
        expect(lateJoinerActiveClients.length).toBe(authorityActiveClients.length);

        // Check partition counts would be the same
        const entityCount = (authority as any).world.entityCount;
        const authorityPartitions = computePartitionCount(entityCount, authorityActiveClients.length);
        const lateJoinerPartitions = computePartitionCount(entityCount, lateJoinerActiveClients.length);

        console.log('\n=== PARTITION CHECK ===');
        console.log('Entity count:', entityCount);
        console.log('Authority partition count:', authorityPartitions);
        console.log('Late joiner partition count:', lateJoinerPartitions);

        if (authorityPartitions !== lateJoinerPartitions) {
            console.log('!!! PARTITION MISMATCH !!!');
            console.log('Different partition counts cause wrong partition assignments!');
        }

        expect(lateJoinerPartitions).toBe(authorityPartitions);
    });

    test('activeClients should include all clients from Player entities in snapshot', () => {
        const conn1 = createMockConnection('client-a');
        const game1 = new Game({ tickRate: 60 });
        (game1 as any).connection = conn1;
        (game1 as any).localClientIdStr = 'client-a';

        game1.defineEntity('player')
            .with(Transform2D)
            .with(Player);

        (game1 as any).callbacks = {
            onConnect: (clientId: string) => {
                const p = game1.spawn('player', { x: 0, y: 0 });
                p.get(Player).clientId = (game1 as any).internClientId(clientId);
            }
        };

        // Two clients join
        (game1 as any).processInput({ seq: 1, clientId: 'client-a', data: { type: 'join', clientId: 'client-a' } });
        (game1 as any).processInput({ seq: 2, clientId: 'client-b', data: { type: 'join', clientId: 'client-b' } });

        (game1 as any).world.tick(0);

        // Verify game1 state
        expect((game1 as any).activeClients.length).toBe(2);

        // Take snapshot using network format
        const snapshot = (game1 as any).getNetworkSnapshot();

        // Create second game and load snapshot
        const conn2 = createMockConnection('client-c');
        const game2 = new Game({ tickRate: 60 });
        (game2 as any).connection = conn2;
        (game2 as any).localClientIdStr = 'client-c';

        game2.defineEntity('player')
            .with(Transform2D)
            .with(Player);

        // Load snapshot
        (game2 as any).loadNetworkSnapshot(snapshot);

        // After fix: game2 should have same activeClients
        console.log('game1 activeClients:', (game1 as any).activeClients);
        console.log('game2 activeClients:', (game2 as any).activeClients);

        expect((game2 as any).activeClients.length).toBe(2);
        expect((game2 as any).activeClients).toContain('client-a');
        expect((game2 as any).activeClients).toContain('client-b');
    });
});
