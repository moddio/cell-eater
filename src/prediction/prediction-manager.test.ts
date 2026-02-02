import { describe, test, expect, vi } from 'vitest';
import { PredictionManager } from './prediction-manager';

function createMockWorld() {
    let snapshotCounter = 0;
    const snapshots: any[] = [];
    return {
        tick: vi.fn(),
        getSparseSnapshot: vi.fn(() => {
            const s = { frame: snapshotCounter, seq: 0, data: snapshotCounter++ };
            snapshots.push(s);
            return s;
        }),
        loadSparseSnapshot: vi.fn(),
        getStateHash: vi.fn(() => 0x12345678),
        _snapshots: snapshots
    } as any;
}

describe('PredictionManager', () => {
    test('advanceFrame increments and simulates', () => {
        const world = createMockWorld();
        const pm = new PredictionManager(world);
        pm.enable();
        pm.setLocalClientId(1);
        pm.initialize(0);

        pm.advanceFrame();

        expect(pm.localFrame).toBe(1);
        expect(world.tick).toHaveBeenCalledWith(1, expect.any(Array));
    });

    test('receiveServerTick with match returns false', () => {
        const world = createMockWorld();
        const pm = new PredictionManager(world);
        pm.enable();
        pm.setLocalClientId(1);
        pm.setClientIdResolver((id) => parseInt(id));
        pm.addClient(1);
        pm.initialize(0);

        pm.advanceFrame();
        pm.advanceFrame();
        pm.advanceFrame();

        const result = pm.receiveServerTick(1, [
            { seq: 0, clientId: '1', data: {} }
        ]);

        expect(result).toBe(false);
    });

    test('receiveServerTick with mismatch triggers rollback', () => {
        const world = createMockWorld();
        const pm = new PredictionManager(world);
        pm.enable();
        pm.setLocalClientId(1);
        pm.setClientIdResolver((id) => parseInt(id));
        pm.initialize(0);
        pm.addClient(1);
        pm.addClient(2);

        pm.advanceFrame();
        pm.advanceFrame();
        pm.advanceFrame();

        const result = pm.receiveServerTick(1, [
            { seq: 0, clientId: '1', data: {} },
            { seq: 0, clientId: '2', data: { x: 999, y: 999 } }
        ]);

        expect(result).toBe(true);
        expect(world.loadSparseSnapshot).toHaveBeenCalled();
    });

    test('onFrameResimulated fires for each resimulated frame', () => {
        const world = createMockWorld();
        const pm = new PredictionManager(world);
        pm.enable();
        pm.setLocalClientId(1);
        pm.setClientIdResolver((id) => parseInt(id));
        pm.initialize(0);
        pm.addClient(1);
        pm.addClient(2);

        const resimCb = vi.fn();
        pm.onFrameResimulated = resimCb;

        pm.advanceFrame();
        pm.advanceFrame();
        pm.advanceFrame();

        const result = pm.receiveServerTick(1, [
            { seq: 0, clientId: '1', data: {} },
            { seq: 0, clientId: '2', data: { x: 999 } }
        ]);

        expect(resimCb).toHaveBeenCalledTimes(3);
        expect(resimCb).toHaveBeenCalledWith(1);
        expect(resimCb).toHaveBeenCalledWith(2);
        expect(resimCb).toHaveBeenCalledWith(3);
    });

    test('lifecycle event undo/replay during rollback', () => {
        const world = createMockWorld();
        const pm = new PredictionManager(world);
        pm.enable();
        pm.setLocalClientId(1);
        pm.setClientIdResolver((id) => parseInt(id));
        pm.initialize(0);
        pm.addClient(1);

        const lifecycleCb = vi.fn();
        const undoCb = vi.fn();
        pm.onLifecycleEvent = lifecycleCb;
        pm.onUndoLifecycleEvent = undoCb;

        pm.advanceFrame();
        pm.advanceFrame();
        pm.advanceFrame();

        const joinEvent = { seq: 0, clientId: '2', data: { type: 'join' } };
        pm.receiveServerTick(2, [
            { seq: 0, clientId: '1', data: {} },
            joinEvent
        ]);

        expect(undoCb).toHaveBeenCalled();
        expect(lifecycleCb).toHaveBeenCalled();

        const undoCalls = undoCb.mock.calls.map((c: any) => c[0]);
        const replayCalls = lifecycleCb.mock.calls.map((c: any) => c[0]);

        expect(undoCalls.some((e: any) => e.data.type === 'join')).toBe(true);
        expect(replayCalls.some((e: any) => e.data.type === 'join')).toBe(true);
    });

    test('maxPredictionFrames throttling', () => {
        const world = createMockWorld();
        const pm = new PredictionManager(world, { maxPredictionFrames: 3 });
        pm.enable();
        pm.setLocalClientId(1);
        pm.initialize(0);

        pm.advanceFrame();
        pm.advanceFrame();
        pm.advanceFrame();
        pm.advanceFrame();
        pm.advanceFrame();

        expect(pm.localFrame).toBe(3);
    });
});
