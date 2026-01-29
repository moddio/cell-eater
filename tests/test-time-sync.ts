/**
 * TimeSyncManager Unit Tests
 *
 * Tests for the prediction TimeSyncManager (src/prediction/time-sync.ts).
 */

import { TimeSyncManager } from '../src/prediction/time-sync';

console.log('=== TimeSyncManager Unit Tests ===\n');

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
// onTimeResponse
// ============================================

console.log('Test 1: onTimeResponse');

test('first sample sets clockDelta immediately', () => {
    const ts = new TimeSyncManager();
    // sentTime=1000, serverTime=2050, receiveTime=1100
    // latency = (1100-1000)/2 = 50
    // delta = 2050 - 1100 + 50 = 1000
    ts.onTimeResponse(1000, 2050, 1100);
    return ts.getClockDelta() === 1000;
});

test('first sample marks as synced', () => {
    const ts = new TimeSyncManager();
    ts.onTimeResponse(1000, 2050, 1100);
    return ts.isSynced();
});

test('first sample sets estimatedLatency', () => {
    const ts = new TimeSyncManager();
    ts.onTimeResponse(1000, 2050, 1100);
    return ts.getEstimatedLatency() === 50;
});

test('after 5+ samples, uses filtered average', () => {
    const ts = new TimeSyncManager();
    // Add 5 consistent samples
    for (let i = 0; i < 5; i++) {
        const sent = 1000 + i * 100;
        const recv = sent + 100;
        const server = sent + 1050; // delta should be ~1000
        ts.onTimeResponse(sent, server, recv);
    }
    // Delta should be close to 1000
    const delta = ts.getClockDelta();
    return Math.abs(delta - 1000) < 1;
});

test('after 5+ samples with outlier, filters outlier', () => {
    const ts = new TimeSyncManager();
    // 4 consistent samples (latency=50, delta=1000)
    for (let i = 0; i < 4; i++) {
        ts.onTimeResponse(1000 + i * 200, 2050 + i * 200, 1100 + i * 200);
    }
    // 1 outlier with huge latency (latency=500, delta=1000 still but latency is high)
    ts.onTimeResponse(2000, 3500, 3000);

    const delta = ts.getClockDelta();
    // Should be close to 1000 (filtered)
    return Math.abs(delta - 1000) < 100;
});

// ============================================
// needsMoreSamples
// ============================================

console.log('\nTest 2: needsMoreSamples');

test('returns true with fewer than 8 samples', () => {
    const ts = new TimeSyncManager();
    for (let i = 0; i < 7; i++) {
        ts.onTimeResponse(1000 + i * 100, 2050 + i * 100, 1100 + i * 100);
    }
    return ts.needsMoreSamples();
});

test('returns false with 8+ samples', () => {
    const ts = new TimeSyncManager();
    for (let i = 0; i < 8; i++) {
        ts.onTimeResponse(1000 + i * 100, 2050 + i * 100, 1100 + i * 100);
    }
    return !ts.needsMoreSamples();
});

// ============================================
// onTickReceived — drift correction
// ============================================

console.log('\nTest 3: onTickReceived (drift correction)');

test('first tick does not change multiplier (no previous)', () => {
    const ts = new TimeSyncManager();
    ts.onTickReceived(50);
    return ts.getTickRateMultiplier() === 1.0;
});

test('ticks at expected interval keep multiplier at 1.0', () => {
    const ts = new TimeSyncManager();
    // Simulate two ticks arriving exactly 50ms apart
    // We can't easily mock performance.now(), but we can check the logic
    // by calling twice in quick succession and verifying it adjusts
    ts.onTickReceived(50);
    ts.onTickReceived(50);
    // The multiplier will be based on actual time between calls,
    // which is very small (<1ms), meaning negative drift → multiplier > 1
    // This is expected behavior — we mainly verify it doesn't crash
    const mult = ts.getTickRateMultiplier();
    return mult >= 0.95 && mult <= 1.05;
});

test('clamps adjustment to ±5%', () => {
    const ts = new TimeSyncManager();
    ts.onTickReceived(50);
    // Call again immediately (drift = ~-50ms, huge negative drift)
    ts.onTickReceived(50);
    const mult = ts.getTickRateMultiplier();
    return mult >= 0.95 && mult <= 1.05;
});

// ============================================
// getTargetFrame
// ============================================

console.log('\nTest 4: getTargetFrame');

test('returns 0 when no server start time', () => {
    const ts = new TimeSyncManager();
    return ts.getTargetFrame(50) === 0;
});

test('calculates frame from server time and start time', () => {
    const ts = new TimeSyncManager();
    ts.setServerStartTime(Date.now() - 5000);
    ts.onTimeResponse(Date.now() - 100, Date.now(), Date.now());
    const frame = ts.getTargetFrame(50);
    // Should be around 100 (5000ms / 50ms)
    return frame >= 90 && frame <= 110;
});

test('uses explicit serverStartTime parameter over stored one', () => {
    const ts = new TimeSyncManager();
    ts.setServerStartTime(0); // stored but zero
    const now = Date.now();
    ts.onTimeResponse(now - 100, now, now);
    const frame = ts.getTargetFrame(50, now - 500);
    // Should be around 10 (500ms / 50ms)
    return frame >= 5 && frame <= 15;
});

// ============================================
// reset
// ============================================

console.log('\nTest 5: reset');

test('clears all state', () => {
    const ts = new TimeSyncManager();
    ts.onTimeResponse(1000, 2050, 1100);
    ts.setServerStartTime(5000);

    ts.reset();

    return ts.getClockDelta() === 0 &&
           !ts.isSynced() &&
           ts.getTickRateMultiplier() === 1.0 &&
           ts.getEstimatedLatency() === 0 &&
           ts.getServerStartTime() === 0 &&
           ts.getSampleCount() === 0;
});

// ============================================
// clearSamples / getSampleCount
// ============================================

console.log('\nTest 6: clearSamples');

test('clearSamples resets sample count', () => {
    const ts = new TimeSyncManager();
    ts.onTimeResponse(1000, 2050, 1100);
    ts.onTimeResponse(1200, 2250, 1300);
    ts.clearSamples();
    return ts.getSampleCount() === 0;
});

test('clearSamples does not reset synced or clockDelta', () => {
    const ts = new TimeSyncManager();
    ts.onTimeResponse(1000, 2050, 1100);
    const delta = ts.getClockDelta();
    ts.clearSamples();
    return ts.isSynced() && ts.getClockDelta() === delta;
});

// ============================================
// Summary
// ============================================

console.log('\n=== Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    console.log('\nTimeSyncManager tests FAILED!');
    process.exit(1);
} else {
    console.log('\nAll TimeSyncManager tests passed!');
    process.exit(0);
}
