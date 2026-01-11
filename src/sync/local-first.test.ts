/**
 * Local-First Mode Test
 *
 * Tests that games can run locally without a server connection.
 *
 * The local-first architecture supports three modes:
 * 1. start() alone - pure offline/single-player
 * 2. connect() alone - online-first, local play while connecting
 * 3. start() then connect() - local play, then server state replaces local state
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Game } from '../game';
import { Transform2D, Player } from '../components';

describe('Local-First Mode', () => {
    // Mock performance.now and requestAnimationFrame for Node.js
    let mockTime = 0;
    const originalPerformance = global.performance;
    let rafCallbacks: Function[] = [];

    beforeEach(() => {
        mockTime = 0;
        rafCallbacks = [];

        global.performance = {
            now: () => mockTime
        } as any;

        // Mock requestAnimationFrame
        (global as any).requestAnimationFrame = (cb: Function) => {
            rafCallbacks.push(cb);
            return rafCallbacks.length;
        };

        (global as any).cancelAnimationFrame = (id: number) => {
            // No-op for tests
        };
    });

    afterEach(() => {
        global.performance = originalPerformance;
        delete (global as any).requestAnimationFrame;
        delete (global as any).cancelAnimationFrame;
    });

    // Helper to run RAF callbacks (simulate browser frame)
    function runFrame() {
        const cbs = [...rafCallbacks];
        rafCallbacks = [];
        cbs.forEach(cb => cb());
    }

    test('game.start() begins local simulation without server', () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .with(Player)
            .register();

        let roomCreated = false;

        game.start({
            onRoomCreate: () => {
                roomCreated = true;
                game.spawn('player', { x: 100, y: 100 });
            }
        });

        // onRoomCreate should be called immediately
        expect(roomCreated).toBe(true);
        expect([...game.query('player')].length).toBe(1);

        // Frame should start at 0
        expect(game.frame).toBe(0);

        // No connection = local mode
        expect((game as any).connection).toBeNull();
    });

    test('game.start() calls onConnect with local clientId', () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .with(Player)
            .register();

        let connectedClientId: string | null = null;

        game.start({
            onRoomCreate: () => {
                // World entities created here
            },
            onConnect: (clientId) => {
                connectedClientId = clientId;
                // Player entity created here
                game.spawn('player', { clientId });
            }
        });

        // onConnect should be called with a local clientId
        expect(connectedClientId).not.toBeNull();
        expect(connectedClientId!.startsWith('local-')).toBe(true);

        // Player entity should exist
        expect([...game.query('player')].length).toBe(1);

        // localClientId should be set
        expect(game.localClientId).toBe(connectedClientId);
    });

    test('game.start() sets localRoomCreated flag', () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .register();

        game.start({
            onRoomCreate: () => {
                game.spawn('player', { x: 0, y: 0 });
            }
        });

        // localRoomCreated should be true after start()
        expect((game as any).localRoomCreated).toBe(true);
    });

    test('local ticks advance frame at tickRate', () => {
        const game = new Game({ tickRate: 20 }); // 20 fps = 50ms per tick

        game.defineEntity('player')
            .with(Transform2D);

        let tickCount = 0;

        game.start({
            onTick: () => {
                tickCount++;
            }
        });

        // Initially at frame 0
        expect(game.frame).toBe(0);
        expect(tickCount).toBe(0);

        // Simulate 100ms passing (should be 2 ticks at 20fps = 50ms/tick)
        mockTime = 100;
        runFrame();

        expect(tickCount).toBe(2);
        expect(game.frame).toBe(2);

        // Simulate another 100ms
        mockTime = 200;
        runFrame();

        expect(tickCount).toBe(4);
        expect(game.frame).toBe(4);
    });

    test('game.time returns deterministic time based on frame', () => {
        const game = new Game({ tickRate: 20 }); // 20 fps = 50ms per tick

        game.defineEntity('player')
            .with(Transform2D);

        game.start({});

        // At frame 0, time should be 0
        expect(game.frame).toBe(0);
        expect(game.time).toBe(0);

        // Simulate 100ms (2 ticks at 50ms/tick)
        mockTime = 100;
        runFrame();

        expect(game.frame).toBe(2);
        expect(game.time).toBe(100); // 2 frames * 50ms = 100ms
    });

    test('onTick callback is called each frame', () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .register();

        const frames: number[] = [];

        game.start({
            onTick: (frame) => {
                frames.push(frame);
            }
        });

        // Simulate 150ms (3 ticks at 50ms/tick = 20fps default)
        mockTime = 150;
        runFrame();

        expect(frames).toEqual([1, 2, 3]);
    });

    test('connect() without prior start() calls onRoomCreate but not onConnect (until server connects)', async () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .with(Player)
            .register();

        game.defineEntity('food')
            .with(Transform2D)
            .register();

        let roomCreated = false;
        let connectCalled = false;

        // connect() without moduNetwork will run in offline mode
        // It should call onRoomCreate but NOT onConnect (that waits for server)
        await game.connect('test-room', {
            onRoomCreate: () => {
                roomCreated = true;
                game.spawn('food', { x: 0, y: 0 });
            },
            onConnect: (clientId) => {
                connectCalled = true;
            }
        });

        // onRoomCreate should be called
        expect(roomCreated).toBe(true);

        // onConnect should NOT be called yet (no server connection)
        expect(connectCalled).toBe(false);

        // Food entity should exist from onRoomCreate
        expect([...game.query('food')].length).toBe(1);

        // localRoomCreated flag should be set
        expect((game as any).localRoomCreated).toBe(true);
    });

    test('start() then connect() - callbacks are merged correctly', async () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .with(Player)
            .register();

        game.defineEntity('food')
            .with(Transform2D)
            .register();

        let startOnTickCalled = 0;
        let connectOnTickCalled = 0;
        let roomCreateCount = 0;
        let connectCallCount = 0;

        // First call start() with some callbacks
        game.start({
            onRoomCreate: () => {
                roomCreateCount++;
                game.spawn('food', { x: 0, y: 0 });
            },
            onConnect: (clientId) => {
                connectCallCount++;
            },
            onTick: () => {
                startOnTickCalled++;
            }
        });

        // start() should call onRoomCreate and onConnect once
        expect(roomCreateCount).toBe(1);
        expect(connectCallCount).toBe(1);
        expect([...game.query('food')].length).toBe(1);

        // Then call connect() - should NOT call onRoomCreate again
        await game.connect('test-room', {
            onTick: () => {
                connectOnTickCalled++;
            }
        });

        // onRoomCreate should NOT be called again
        expect(roomCreateCount).toBe(1);

        // localRoomCreated should still be true
        expect((game as any).localRoomCreated).toBe(true);

        // Run a frame - the merged onTick callback should work
        mockTime = 100; // 2 ticks worth
        runFrame();

        // Only the connect() onTick should be called (it overwrites start()'s)
        // because connect() does: this.callbacks = { ...this.callbacks, ...callbacks }
        expect(connectOnTickCalled).toBe(2);
    });

    test('game.stop() stops the game loop', () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .register();

        let tickCount = 0;

        game.start({
            onTick: () => {
                tickCount++;
            }
        });

        // Run some frames
        mockTime = 100;
        runFrame();
        expect(tickCount).toBe(2);

        // Stop the game
        game.stop();

        // The game loop should be null after stop
        expect((game as any).gameLoop).toBeNull();
    });

    // ==========================================
    // New API Tests (init/start/connect)
    // ==========================================

    test('game.init() stores callbacks without starting', () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .with(Player)
            .register();

        let roomCreated = false;
        let connectCalled = false;

        // init() should store callbacks but NOT call them
        const result = game.init({
            onRoomCreate: () => {
                roomCreated = true;
            },
            onConnect: (clientId) => {
                connectCalled = true;
            }
        });

        // Should return game for chaining
        expect(result).toBe(game);

        // Callbacks should NOT be called
        expect(roomCreated).toBe(false);
        expect(connectCalled).toBe(false);

        // Game should NOT be started
        expect(game.isStarted()).toBe(false);
        expect((game as any).gameLoop).toBeNull();
    });

    test('game.init() followed by game.start() uses stored callbacks', () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .with(Player)
            .register();

        let roomCreated = false;
        let connectClientId: string | null = null;

        // First init() with callbacks
        game.init({
            onRoomCreate: () => {
                roomCreated = true;
            },
            onConnect: (clientId) => {
                connectClientId = clientId;
                game.spawn('player', { clientId });
            }
        });

        // Then start() - should use stored callbacks
        game.start();

        // Both callbacks should be called
        expect(roomCreated).toBe(true);
        expect(connectClientId).not.toBeNull();
        expect(connectClientId!.startsWith('local-')).toBe(true);

        // Player entity should exist
        expect([...game.query('player')].length).toBe(1);

        // Game should be started
        expect(game.isStarted()).toBe(true);
    });

    test('game.init() returns game instance for chaining', () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .register();

        let roomCreated = false;

        // Chain init() and start()
        game
            .init({
                onRoomCreate: () => {
                    roomCreated = true;
                    game.spawn('player', { x: 0, y: 0 });
                }
            })
            .start();

        expect(roomCreated).toBe(true);
        expect([...game.query('player')].length).toBe(1);
    });

    test('game.start() sets gameStarted flag', () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .register();

        // Before start
        expect(game.isStarted()).toBe(false);

        game.start({
            onRoomCreate: () => {
                game.spawn('player', { x: 0, y: 0 });
            }
        });

        // After start
        expect(game.isStarted()).toBe(true);
    });

    test('game.connect() without prior start() sets gameStarted flag', async () => {
        const game = new Game();

        game.defineEntity('food')
            .with(Transform2D)
            .register();

        // Before connect
        expect(game.isStarted()).toBe(false);

        await game.connect('test-room', {
            onRoomCreate: () => {
                game.spawn('food', { x: 0, y: 0 });
            }
        });

        // After connect
        expect(game.isStarted()).toBe(true);
    });

    test('game.connect() with only roomId uses stored callbacks from init()', async () => {
        const game = new Game();

        game.defineEntity('food')
            .with(Transform2D)
            .register();

        let roomCreated = false;

        // First set callbacks via init()
        game.init({
            onRoomCreate: () => {
                roomCreated = true;
                game.spawn('food', { x: 0, y: 0 });
            }
        });

        // Then connect without callbacks
        await game.connect('test-room');

        // onRoomCreate should be called from stored callbacks
        expect(roomCreated).toBe(true);
        expect([...game.query('food')].length).toBe(1);
    });

    test('game.connect() with only options uses stored callbacks from init()', async () => {
        const game = new Game();

        game.defineEntity('food')
            .with(Transform2D)
            .register();

        let roomCreated = false;

        // First set callbacks via init()
        game.init({
            onRoomCreate: () => {
                roomCreated = true;
                game.spawn('food', { x: 0, y: 0 });
            }
        });

        // Then connect with only options (no callbacks)
        await game.connect('test-room', { nodeUrl: 'ws://localhost:8080' });

        // onRoomCreate should be called from stored callbacks
        expect(roomCreated).toBe(true);
        expect([...game.query('food')].length).toBe(1);
    });

    test('game.init() then game.start() then game.connect() - full local-first flow', async () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .with(Player)
            .register();

        game.defineEntity('food')
            .with(Transform2D)
            .register();

        let roomCreateCount = 0;
        let connectCount = 0;

        // 1. Configure callbacks
        game.init({
            onRoomCreate: () => {
                roomCreateCount++;
                game.spawn('food', { x: 0, y: 0 });
            },
            onConnect: (clientId) => {
                connectCount++;
                game.spawn('player', { clientId });
            }
        });

        // Nothing should happen yet
        expect(roomCreateCount).toBe(0);
        expect(connectCount).toBe(0);
        expect(game.isStarted()).toBe(false);

        // 2. Start locally
        game.start();

        // Local callbacks should fire
        expect(roomCreateCount).toBe(1);
        expect(connectCount).toBe(1);
        expect([...game.query('food')].length).toBe(1);
        expect([...game.query('player')].length).toBe(1);
        expect(game.isStarted()).toBe(true);

        // 3. Connect to server (without moduNetwork, runs offline)
        await game.connect('test-room');

        // Callbacks should NOT fire again in local-first mode
        expect(roomCreateCount).toBe(1);
        expect(connectCount).toBe(1);
    });

    test('start() merges callbacks from init() and start()', () => {
        const game = new Game();

        game.defineEntity('player')
            .with(Transform2D)
            .register();

        let onTickFromInit = 0;
        let onTickFromStart = 0;
        let onRoomCreateCalled = false;

        // init() with onRoomCreate and onTick
        game.init({
            onRoomCreate: () => {
                onRoomCreateCalled = true;
            },
            onTick: () => {
                onTickFromInit++;
            }
        });

        // start() with different onTick (should override)
        game.start({
            onTick: () => {
                onTickFromStart++;
            }
        });

        // onRoomCreate from init() should still be called
        expect(onRoomCreateCalled).toBe(true);

        // Run a frame
        mockTime = 100;
        runFrame();

        // Only onTick from start() should be called (it overrides init()'s)
        expect(onTickFromInit).toBe(0);
        expect(onTickFromStart).toBe(2);
    });
});
