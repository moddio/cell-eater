import { describe, test, expect } from 'vitest';
import { InputHistory } from './input-history';

describe('InputHistory', () => {
    describe('store/confirm inputs, misprediction detection', () => {
        test('store local input, confirm with same data returns false', () => {
            const history = new InputHistory();
            history.storeLocalInput(10, 1, { x: 1, y: 0 });
            const misprediction = history.confirmInput(10, 1, { x: 1, y: 0 });
            expect(misprediction).toBe(false);
        });

        test('store predicted input, confirm with different data returns true', () => {
            const history = new InputHistory();
            history.addClient(2);
            history.storePredictedInput(10, 2, { x: 0, y: 0 });
            const misprediction = history.confirmInput(10, 2, { x: 1, y: 1 });
            expect(misprediction).toBe(true);
        });

        test('confirm input with no prior prediction returns false', () => {
            const history = new InputHistory();
            history.addClient(2);
            const misprediction = history.confirmInput(10, 2, { x: 1 });
            expect(misprediction).toBe(false);
        });
    });

    describe('idle vs repeat-last prediction strategy', () => {
        test('default strategy is idle: getPredictedInput returns {} when no stored input', () => {
            const history = new InputHistory();
            history.addClient(1);
            expect(history.getPredictedInput(5, 1)).toEqual({});
        });

        test('repeat-last strategy returns last known input', () => {
            const history = new InputHistory();
            history.addClient(1);
            history.setPredictionStrategy('repeat-last');
            history.storeLocalInput(5, 1, { x: 3, jump: true });
            expect(history.getPredictedInput(10, 1)).toEqual({ x: 3, jump: true });
        });

        test('both strategies return stored input if one exists for that frame', () => {
            const history = new InputHistory();
            history.addClient(1);
            history.storePredictedInput(5, 1, { x: 7 });

            expect(history.getPredictedInput(5, 1)).toEqual({ x: 7 });

            history.setPredictionStrategy('repeat-last');
            expect(history.getPredictedInput(5, 1)).toEqual({ x: 7 });
        });
    });

    describe('frame boundary and circular buffer behavior', () => {
        test('old frames get overwritten when exceeding buffer size', () => {
            const history = new InputHistory(4);
            history.addClient(1);

            for (let i = 0; i < 6; i++) {
                history.storeLocalInput(i, 1, { frame: i });
            }

            expect(history.getFrameSet(0)).toBeNull();
            expect(history.getFrameSet(1)).toBeNull();
            expect(history.getFrameSet(5)).not.toBeNull();
        });

        test('clearOldFrames removes old entries and updates oldestFrame', () => {
            const history = new InputHistory();
            history.addClient(1);
            history.storeLocalInput(10, 1, { a: 1 });
            history.storeLocalInput(11, 1, { a: 2 });
            history.storeLocalInput(12, 1, { a: 3 });

            history.clearOldFrames(12);

            expect(history.getOldestFrame()).toBe(12);
            expect(history.getFrameSet(10)).toBeNull();
            expect(history.getFrameSet(11)).toBeNull();
            expect(history.getFrameSet(12)).not.toBeNull();
        });

        test('getFrameSet returns null for cleared frames', () => {
            const history = new InputHistory();
            history.addClient(1);
            history.storeLocalInput(5, 1, { v: 1 });
            history.clearOldFrames(6);
            expect(history.getFrameSet(5)).toBeNull();
        });
    });

    describe('getFrameInputs fills predictions', () => {
        test('both clients have inputs even when only one stored', () => {
            const history = new InputHistory();
            history.addClient(1);
            history.addClient(2);
            history.storeLocalInput(10, 1, { x: 5 });

            const inputs = history.getFrameInputs(10);
            expect(inputs.has(1)).toBe(true);
            expect(inputs.has(2)).toBe(true);
            expect(inputs.get(1)).toEqual({ x: 5 });
        });

        test('idle strategy fills missing client with {}', () => {
            const history = new InputHistory();
            history.addClient(1);
            history.addClient(2);
            history.storeLocalInput(10, 1, { x: 5 });

            const inputs = history.getFrameInputs(10);
            expect(inputs.get(2)).toEqual({});
        });

        test('repeat-last strategy fills missing client with last known input', () => {
            const history = new InputHistory();
            history.setPredictionStrategy('repeat-last');
            history.addClient(1);
            history.addClient(2);
            history.storeLocalInput(5, 2, { y: 9 });
            history.storeLocalInput(10, 1, { x: 5 });

            const inputs = history.getFrameInputs(10);
            expect(inputs.get(2)).toEqual({ y: 9 });
        });
    });
});
