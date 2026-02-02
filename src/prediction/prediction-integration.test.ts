import { describe, test, expect, vi } from 'vitest';
import { PredictionManager } from './prediction-manager';

function createTrackingWorld() {
    let state = 0;
    const snapshots = new Map<number, any>();
    return {
        tick: vi.fn((frame: number, inputs: any[]) => {
            for (const input of inputs) {
                state += input.data?.value ?? 0;
            }
        }),
        getSparseSnapshot: vi.fn(() => ({ frame: 0, seq: 0, state })),
        loadSparseSnapshot: vi.fn((snapshot: any) => { state = snapshot.state; }),
        getStateHash: vi.fn(() => state),
        getState: () => state,
    } as any;
}

describe('PredictionManager integration', () => {
    test('rollback updates stateHashHistory', () => {
        const world = createTrackingWorld();
        const pm = new PredictionManager(world, { inputDelayFrames: 0 });
        pm.enable();
        pm.initialize(0);
        pm.setLocalClientId(1);
        pm.setClientIdResolver((id) => Number(id));
        pm.addClient(1);

        const resimulatedFrames: number[] = [];
        pm.onFrameResimulated = (frame) => resimulatedFrames.push(frame);

        pm.queueLocalInput({ value: 5 });
        pm.advanceFrame();
        pm.advanceFrame();

        pm.receiveServerTick(1, [
            { seq: 0, clientId: '1', data: { value: 99 } },
        ]);

        expect(resimulatedFrames.length).toBeGreaterThan(0);
        expect(resimulatedFrames).toContain(1);
        expect(resimulatedFrames).toContain(2);
    });

    test('local entities survive rollback (loadSparseSnapshot called)', () => {
        const world = createTrackingWorld();
        const pm = new PredictionManager(world, { inputDelayFrames: 0 });
        pm.enable();
        pm.initialize(0);
        pm.setLocalClientId(1);
        pm.setClientIdResolver((id) => Number(id));
        pm.addClient(1);

        pm.queueLocalInput({ value: 5 });
        pm.advanceFrame();
        pm.advanceFrame();

        pm.receiveServerTick(1, [
            { seq: 0, clientId: '1', data: { value: 10 } },
        ]);

        expect(world.loadSparseSnapshot).toHaveBeenCalled();
    });

    test('end-to-end: queue → advance → server tick with different input → rollback → correct state', () => {
        const world = createTrackingWorld();
        const pm = new PredictionManager(world, { inputDelayFrames: 0 });
        pm.enable();
        pm.initialize(0);
        pm.setLocalClientId(1);
        pm.setClientIdResolver((id) => Number(id));
        pm.addClient(1);

        pm.queueLocalInput({ value: 10 });
        pm.advanceFrame();
        pm.advanceFrame();
        pm.advanceFrame();

        const rolledBack = pm.receiveServerTick(1, [
            { seq: 0, clientId: '1', data: { value: 50 } },
        ]);

        expect(rolledBack).toBe(true);
        expect(world.loadSparseSnapshot).toHaveBeenCalled();

        const tickCalls = world.tick.mock.calls;
        const resimCalls = tickCalls.filter(
            (call: any[]) => call[0] === 1 && call[1].some((i: any) => i.data?.value === 50)
        );
        expect(resimCalls.length).toBeGreaterThan(0);
    });
});
