/**
 * CSP InputHistory Unit Tests
 *
 * Tests for the prediction InputHistory class (src/prediction/input-history.ts),
 * which is separate from the ECS InputHistory (src/ecs/input-history.ts).
 */

import { InputHistory } from '../src/prediction/input-history';

console.log('=== CSP InputHistory Unit Tests ===\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
    try {
        if (fn()) {
            console.log(`  PASS: ${name}`);
            passed++;
        } else {
            console.log(`  FAIL: ${name}`);
            failed++;
        }
    } catch (e) {
        console.log(`  FAIL: ${name} - ${e}`);
        failed++;
    }
}

// ============================================
// storeLocalInput
// ============================================

console.log('Test 1: storeLocalInput');

test('stores input with confirmed: true', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { moveX: 100 });
    return h.isInputConfirmed(10, 1);
});

test('updates lastKnownInputs (used by getPredictedInput)', () => {
    const h = new InputHistory();
    h.setLocalClientId(1);
    h.storeLocalInput(10, 1, { moveX: 100 });
    const predicted = h.getPredictedInput(99, 1);
    return predicted.moveX === 100;
});

test('overwrites previous input for same frame/client', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { moveX: 100 });
    h.storeLocalInput(10, 1, { moveX: 999 });
    const predicted = h.getPredictedInput(10, 1);
    return predicted.moveX === 999;
});

// ============================================
// storePredictedInput
// ============================================

console.log('\nTest 2: storePredictedInput');

test('stores with confirmed: false', () => {
    const h = new InputHistory();
    h.storePredictedInput(10, 2, { moveX: 50 });
    return !h.isInputConfirmed(10, 2);
});

test('does not overwrite confirmed input', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { moveX: 100 });
    h.storePredictedInput(10, 1, { moveX: 999 });
    const data = h.getPredictedInput(10, 1);
    return data.moveX === 100;
});

test('overwrites previous unconfirmed input', () => {
    const h = new InputHistory();
    h.storePredictedInput(10, 2, { moveX: 50 });
    h.storePredictedInput(10, 2, { moveX: 75 });
    const data = h.getPredictedInput(10, 2);
    return data.moveX === 75;
});

// ============================================
// confirmInput
// ============================================

console.log('\nTest 3: confirmInput');

test('returns false when prediction matches', () => {
    const h = new InputHistory();
    h.storePredictedInput(10, 2, { moveX: 100 });
    return h.confirmInput(10, 2, { moveX: 100 }) === false;
});

test('returns true when prediction differs (misprediction)', () => {
    const h = new InputHistory();
    h.storePredictedInput(10, 2, { moveX: 100 });
    return h.confirmInput(10, 2, { moveX: 999 }) === true;
});

test('returns false when no prior prediction exists', () => {
    const h = new InputHistory();
    return h.confirmInput(10, 2, { moveX: 100 }) === false;
});

test('returns false when prior input was already confirmed (local)', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { moveX: 100 });
    return h.confirmInput(10, 1, { moveX: 999 }) === false;
});

test('overwrite-order bug check: existing is read from frameSet not lastKnownInputs', () => {
    // The reviewer asked if lastKnownInputs.set() before reading existing matters.
    // It doesn't because existing is read from frameSet.inputs.get(), not lastKnownInputs.
    const h = new InputHistory();
    h.setLocalClientId(1);
    h.addClient(2);

    // Store a prediction for client 2
    h.storePredictedInput(10, 2, { moveX: 50 });

    // Confirm with different value — should detect misprediction
    const mispredicted = h.confirmInput(10, 2, { moveX: 999 });

    // The existing was { moveX: 50 } (from frameSet), not whatever lastKnownInputs had
    return mispredicted === true;
});

test('detects misprediction with different keys', () => {
    const h = new InputHistory();
    h.storePredictedInput(10, 2, { moveX: 100 });
    return h.confirmInput(10, 2, { moveX: 100, fire: true }) === true;
});

test('marks input as confirmed after confirmInput', () => {
    const h = new InputHistory();
    h.storePredictedInput(10, 2, { moveX: 100 });
    h.confirmInput(10, 2, { moveX: 100 });
    return h.isInputConfirmed(10, 2);
});

// ============================================
// getFrameInputs
// ============================================

console.log('\nTest 4: getFrameInputs');

test('fills predictions for missing active clients', () => {
    const h = new InputHistory();
    h.setLocalClientId(1);
    h.addClient(2);
    h.addClient(3);

    h.storeLocalInput(10, 1, { moveX: 100 });
    // Clients 2 and 3 have no input for frame 10

    const inputs = h.getFrameInputs(10);
    return inputs.size === 3 && inputs.has(1) && inputs.has(2) && inputs.has(3);
});

test('uses repeat-last for predictions', () => {
    const h = new InputHistory();
    h.setLocalClientId(1);
    h.addClient(2);

    // Give client 2 a known input at an earlier frame
    h.storeLocalInput(5, 2, { moveX: 42 });

    const inputs = h.getFrameInputs(10);
    return inputs.get(2)?.moveX === 42;
});

test('stores predictions for later comparison', () => {
    const h = new InputHistory();
    h.setLocalClientId(1);
    h.addClient(2);

    h.storeLocalInput(5, 2, { moveX: 42 });
    h.getFrameInputs(10);

    // Now confirming with different data should detect misprediction
    return h.confirmInput(10, 2, { moveX: 999 }) === true;
});

test('returns empty input for client with no history', () => {
    const h = new InputHistory();
    h.setLocalClientId(1);
    h.addClient(2);

    const inputs = h.getFrameInputs(10);
    const client2Input = inputs.get(2);
    return client2Input !== undefined && Object.keys(client2Input).length === 0;
});

// ============================================
// getPredictedInput
// ============================================

console.log('\nTest 5: getPredictedInput');

test('returns existing input for frame if present', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { moveX: 100 });
    return h.getPredictedInput(10, 1).moveX === 100;
});

test('returns last known input (repeat-last strategy)', () => {
    const h = new InputHistory();
    h.storeLocalInput(5, 1, { moveX: 42 });
    return h.getPredictedInput(99, 1).moveX === 42;
});

test('returns empty object when no history', () => {
    const h = new InputHistory();
    const result = h.getPredictedInput(10, 99);
    return Object.keys(result).length === 0;
});

// ============================================
// markFrameConfirmed / isFrameConfirmed
// ============================================

console.log('\nTest 6: markFrameConfirmed / isFrameConfirmed');

test('markFrameConfirmed sets fullyConfirmed flag', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { moveX: 100 });
    h.markFrameConfirmed(10);
    return h.isFrameConfirmed(10);
});

test('isFrameConfirmed returns false for unconfirmed frame', () => {
    const h = new InputHistory();
    h.storePredictedInput(10, 2, { moveX: 100 });
    return !h.isFrameConfirmed(10);
});

test('isFrameConfirmed returns true when all inputs are confirmed (no fullyConfirmed flag)', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { moveX: 100 });
    // All inputs in frame are confirmed (local = confirmed), but fullyConfirmed not set
    return h.isFrameConfirmed(10);
});

test('isFrameConfirmed returns false for nonexistent frame', () => {
    const h = new InputHistory();
    return !h.isFrameConfirmed(999);
});

// ============================================
// clearOldFrames
// ============================================

console.log('\nTest 7: clearOldFrames');

test('clears frames before specified frame', () => {
    const h = new InputHistory();
    h.storeLocalInput(5, 1, { x: 5 });
    h.storeLocalInput(10, 1, { x: 10 });
    h.storeLocalInput(15, 1, { x: 15 });

    h.clearOldFrames(10);

    return !h.hasInput(5, 1) &&
           h.hasInput(10, 1) &&
           h.hasInput(15, 1);
});

test('updates oldestFrame', () => {
    const h = new InputHistory();
    h.storeLocalInput(5, 1, { x: 5 });
    h.storeLocalInput(10, 1, { x: 10 });

    h.clearOldFrames(10);
    return h.getOldestFrame() === 10;
});

// ============================================
// Circular buffer wrapping
// ============================================

console.log('\nTest 8: Circular Buffer');

test('handles frames wrapping around buffer size', () => {
    const h = new InputHistory(8);

    // Store at frame 3
    h.storeLocalInput(3, 1, { x: 3 });
    // Store at frame 11 (same index: 11 % 8 = 3)
    h.storeLocalInput(11, 1, { x: 11 });

    // Frame 3 should be overwritten
    return h.getPredictedInput(11, 1).x === 11 &&
           !h.hasInput(3, 1);
});

test('getFrameSet returns null for overwritten frame', () => {
    const h = new InputHistory(4);
    h.storeLocalInput(1, 1, { x: 1 });
    h.storeLocalInput(5, 1, { x: 5 }); // overwrites index 1
    return !h.hasInput(1, 1);
});

// ============================================
// reset
// ============================================

console.log('\nTest 9: reset');

test('clears all state', () => {
    const h = new InputHistory();
    h.setLocalClientId(1);
    h.addClient(2);
    h.storeLocalInput(10, 1, { x: 100 });

    h.reset();

    return !h.hasInput(10, 1) &&
           h.getNewestFrame() === -1;
});

test('re-adds localClientId to activeClients', () => {
    const h = new InputHistory();
    h.setLocalClientId(1);
    h.addClient(2);

    h.reset();

    const clients = h.getActiveClients();
    return clients.has(1) && !clients.has(2);
});

// ============================================
// inputsEqual (tested indirectly via confirmInput)
// ============================================

console.log('\nTest 10: inputsEqual (via confirmInput)');

test('shallow comparison: same values = equal', () => {
    const h = new InputHistory();
    h.storePredictedInput(10, 2, { a: 1, b: 'hello' });
    return h.confirmInput(10, 2, { a: 1, b: 'hello' }) === false;
});

test('shallow comparison: nested objects are reference-compared (not deep)', () => {
    const h = new InputHistory();
    const obj = { nested: true };
    h.storePredictedInput(10, 2, { data: obj });
    // Different object reference with same content → misprediction
    return h.confirmInput(10, 2, { data: { nested: true } }) === true;
});

test('different key count = not equal', () => {
    const h = new InputHistory();
    h.storePredictedInput(10, 2, { a: 1 });
    return h.confirmInput(10, 2, { a: 1, b: 2 }) === true;
});

// ============================================
// Client management
// ============================================

console.log('\nTest 11: Client Management');

test('addClient adds to active set', () => {
    const h = new InputHistory();
    h.addClient(5);
    return h.getActiveClients().has(5);
});

test('removeClient removes from active set and lastKnownInputs', () => {
    const h = new InputHistory();
    h.addClient(5);
    h.storeLocalInput(10, 5, { x: 1 });
    h.removeClient(5);

    const clients = h.getActiveClients();
    // After removal, getPredictedInput should return empty (no lastKnown)
    const predicted = h.getPredictedInput(99, 5);
    return !clients.has(5) && Object.keys(predicted).length === 0;
});

test('setLocalClientId adds to activeClients', () => {
    const h = new InputHistory();
    h.setLocalClientId(42);
    return h.getActiveClients().has(42);
});

// ============================================
// getOrCreateFrameSet (tested via public methods)
// ============================================

console.log('\nTest 12: getOrCreateFrameSet behavior');

test('creates new frame set on first access', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { x: 1 });
    return h.hasInput(10, 1) && h.getNewestFrame() === 10;
});

test('reuses existing frame set for same frame', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { x: 1 });
    h.storeLocalInput(10, 2, { x: 2 });
    // Both inputs should be in the same frame set
    return h.hasInput(10, 1) && h.hasInput(10, 2);
});

test('overwrites stale data in circular buffer slot', () => {
    const h = new InputHistory(8);
    h.storeLocalInput(2, 1, { x: 2 });
    // Frame 10 maps to same index (10 % 8 = 2)
    h.storeLocalInput(10, 1, { x: 10 });
    // Frame 2's data is gone, frame 10 exists
    return !h.hasInput(2, 1) && h.hasInput(10, 1);
});

test('updates newestFrame on new highest frame', () => {
    const h = new InputHistory();
    h.storeLocalInput(5, 1, { x: 5 });
    h.storeLocalInput(20, 1, { x: 20 });
    h.storeLocalInput(10, 1, { x: 10 });
    return h.getNewestFrame() === 20;
});

test('updates oldestFrame on new lowest frame', () => {
    const h = new InputHistory();
    h.storeLocalInput(20, 1, { x: 20 });
    h.storeLocalInput(5, 1, { x: 5 });
    return h.getOldestFrame() === 5;
});

test('oldestFrame set correctly for first frame stored', () => {
    const h = new InputHistory();
    h.storeLocalInput(42, 1, { x: 42 });
    return h.getOldestFrame() === 42;
});

// ============================================
// getOldestUnconfirmedFrame
// ============================================

console.log('\nTest 13: getOldestUnconfirmedFrame');

test('returns -1 when no unconfirmed frames', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { x: 1 }); // local = confirmed
    h.markFrameConfirmed(10);
    return h.getOldestUnconfirmedFrame() === -1;
});

test('returns frame with unconfirmed input', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { x: 1 });
    h.storePredictedInput(10, 2, { x: 2 }); // unconfirmed
    return h.getOldestUnconfirmedFrame() === 10;
});

test('returns oldest unconfirmed when multiple frames exist', () => {
    const h = new InputHistory();
    h.storePredictedInput(5, 2, { x: 5 });
    h.storePredictedInput(10, 2, { x: 10 });
    h.storePredictedInput(15, 2, { x: 15 });
    return h.getOldestUnconfirmedFrame() === 5;
});

test('skips confirmed frames to find oldest unconfirmed', () => {
    const h = new InputHistory();
    h.storeLocalInput(5, 1, { x: 5 });
    h.markFrameConfirmed(5);
    h.storePredictedInput(10, 2, { x: 10 });
    return h.getOldestUnconfirmedFrame() === 10;
});

test('returns -1 when all inputs are confirmed (no fullyConfirmed flag)', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { x: 1 }); // local = confirmed
    // fullyConfirmed not set but all inputs are confirmed
    return h.getOldestUnconfirmedFrame() === -1;
});

// ============================================
// getNewestFrame / getOldestFrame
// ============================================

console.log('\nTest 14: getNewestFrame / getOldestFrame');

test('getNewestFrame returns -1 when empty', () => {
    const h = new InputHistory();
    return h.getNewestFrame() === -1;
});

test('getOldestFrame returns 0 when empty', () => {
    const h = new InputHistory();
    return h.getOldestFrame() === 0;
});

test('track correctly across multiple frames', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { x: 10 });
    h.storeLocalInput(5, 1, { x: 5 });
    h.storeLocalInput(20, 1, { x: 20 });
    return h.getOldestFrame() === 5 && h.getNewestFrame() === 20;
});

// ============================================
// getDebugInfo
// ============================================

console.log('\nTest 15: getDebugInfo');

test('returns correct state', () => {
    const h = new InputHistory();
    h.setLocalClientId(1);
    h.addClient(2);
    h.storeLocalInput(10, 1, { x: 10 });
    h.storeLocalInput(20, 1, { x: 20 });

    const info = h.getDebugInfo();
    return info.oldestFrame === 10 &&
           info.newestFrame === 20 &&
           info.activeClients === 2 &&
           info.framesWithData === 2;
});

test('framesWithData counts non-null buffer slots', () => {
    const h = new InputHistory(8);
    h.storeLocalInput(1, 1, { x: 1 });
    h.storeLocalInput(2, 1, { x: 2 });
    h.storeLocalInput(3, 1, { x: 3 });
    return h.getDebugInfo().framesWithData === 3;
});

// ============================================
// hasInput / isInputConfirmed edge cases
// ============================================

console.log('\nTest 16: hasInput / isInputConfirmed edge cases');

test('hasInput returns false for nonexistent frame', () => {
    const h = new InputHistory();
    return !h.hasInput(99, 1);
});

test('hasInput returns false for wrong client', () => {
    const h = new InputHistory();
    h.storeLocalInput(10, 1, { x: 1 });
    return !h.hasInput(10, 99);
});

test('isInputConfirmed returns false for nonexistent frame', () => {
    const h = new InputHistory();
    return !h.isInputConfirmed(99, 1);
});

test('isInputConfirmed returns false for unconfirmed prediction', () => {
    const h = new InputHistory();
    h.storePredictedInput(10, 2, { x: 1 });
    return !h.isInputConfirmed(10, 2);
});

test('isInputConfirmed returns true after confirmInput', () => {
    const h = new InputHistory();
    h.storePredictedInput(10, 2, { x: 1 });
    h.confirmInput(10, 2, { x: 1 });
    return h.isInputConfirmed(10, 2);
});

// ============================================
// clearOldFrames + getOrCreateFrameSet regression
// ============================================

console.log('\nTest 12: clearOldFrames does not allow oldestFrame regression');

test('getOrCreateFrameSet after clearOldFrames does not regress oldestFrame', () => {
    const h = new InputHistory();
    h.storeLocalInput(5, 1, { x: 5 });
    h.storeLocalInput(10, 1, { x: 10 });
    h.storeLocalInput(15, 1, { x: 15 });

    h.clearOldFrames(10);
    // oldestFrame should be 10

    // Creating a frame below the clear boundary should not regress oldestFrame
    h.storePredictedInput(3, 2, { x: 3 });
    return h.getOldestFrame() === 10;
});

test('clearOldFrames boundary respected after multiple clears', () => {
    const h = new InputHistory();
    h.storeLocalInput(1, 1, { x: 1 });
    h.storeLocalInput(5, 1, { x: 5 });
    h.storeLocalInput(10, 1, { x: 10 });

    h.clearOldFrames(5);
    h.clearOldFrames(8);

    // Storing at frame 6 (above first clear but below second) should not regress
    h.storePredictedInput(6, 2, { x: 6 });
    return h.getOldestFrame() === 8;
});

// ============================================
// setLocalClientId with 0 — _hasLocalClient flag
// ============================================

console.log('\nTest 13: _hasLocalClient flag');

test('reset without setLocalClientId does not add client 0', () => {
    const h = new InputHistory();
    // Never call setLocalClientId
    h.addClient(5);
    h.reset();

    const clients = h.getActiveClients();
    return !clients.has(0) && !clients.has(5);
});

test('reset after setLocalClientId re-adds localClient', () => {
    const h = new InputHistory();
    h.setLocalClientId(7);
    h.addClient(5);
    h.reset();

    const clients = h.getActiveClients();
    return clients.has(7) && !clients.has(5);
});

// ============================================
// Summary
// ============================================

console.log('\n=== Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    console.log('\nCSP InputHistory tests FAILED!');
    process.exit(1);
} else {
    console.log('\nAll CSP InputHistory tests passed!');
    process.exit(0);
}
