/**
 * Cell Eater - Agar.io style multiplayer game
 *
 * Build auto-transforms: Math.sqrt() -> dSqrt(), Math.random() -> dRandom()
 */

import * as modu from 'modu-engine';
import { WORLD_WIDTH, WORLD_HEIGHT, FOOD_COUNT } from './constants';
import { defineEntities } from './entities';
import {
    setupSystems,
    setupCollisions,
    spawnFood,
    spawnCell,
    getPlayerCells,
} from './systems';
import { createRenderer } from './render';

// Game state
let game: modu.Game;
let renderer: modu.Simple2DRenderer;
let physics: modu.Physics2DSystem;
let input: modu.InputPlugin;
let cameraSystem: modu.CameraSystem;
let cameraEntity: modu.Entity;

let canvas: HTMLCanvasElement;
let minimapCanvas: HTMLCanvasElement;
let sizeDisplay: HTMLElement;
let WIDTH: number;
let HEIGHT: number;

let mouseX: number;
let mouseY: number;

// Debug state
export let cameraChaseEnabled = true;
let prevToggleCameraState = false;

function getLocalClientId(): number | null {
    const clientId = game.localClientId;
    if (!clientId || typeof clientId !== 'string') return null;
    return game.internClientId(clientId);
}

function setupInput(getCameraEntity: () => modu.Entity): void {
    mouseX = WIDTH / 2;
    mouseY = HEIGHT / 2;

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    });

    input.action('target', {
        type: 'vector',
        bindings: [() => {
            // Convert screen to world coordinates
            const cam = getCameraEntity().get(modu.Camera2D);
            const worldX = (mouseX - WIDTH / 2) / cam.zoom + cam.x;
            const worldY = (mouseY - HEIGHT / 2) / cam.zoom + cam.y;
            return { x: worldX, y: worldY };
        }]
    });

    input.action('split', {
        type: 'button',
        bindings: ['key: ']  // Use string binding like toggleCamera
    });

    // Debug: test if space is being tracked
    window.addEventListener('keydown', (e) => {
        if (e.key === ' ') {
            console.log('[INPUT] Space keydown detected!');
            console.log('[INPUT] isKeyDown(" ") result:', input.isKeyDown(' '));
            console.log('[INPUT] input.get("split") result:', input.get('split'));
            console.log('[INPUT] All actions:', input.getAll());
        }
    });

    // Debug: toggle camera chase with C key
    input.action('toggleCamera', {
        type: 'button',
        bindings: ['key:c']
    });
}

export function initGame(): void {
    canvas = document.getElementById('game') as HTMLCanvasElement;
    minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
    sizeDisplay = document.getElementById('size-display')!;
    // Set canvas to fullscreen
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    WIDTH = canvas.width;
    HEIGHT = canvas.height;
    // Handle window resize
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        WIDTH = canvas.width;
        HEIGHT = canvas.height;
    });

    game = modu.createGame();
    renderer = game.addPlugin(modu.Simple2DRenderer, canvas);
    physics = game.addPlugin(modu.Physics2DSystem, { gravity: { x: 0, y: 0 } });
    input = game.addPlugin(modu.InputPlugin, canvas);
    cameraSystem = game.addPlugin(modu.CameraSystem);

    // Expose for debugging
    (window as any).game = game;

    defineEntities(game);
    setupCollisions(game, physics);
    setupSystems(game);

    // Create camera entity and set it on renderer
    cameraEntity = game.spawn('camera');
    const cam = cameraEntity.get(modu.Camera2D);
    cam.x = WORLD_WIDTH / 2;
    cam.y = WORLD_HEIGHT / 2;
    renderer.camera = cameraEntity;

    // Helper to ensure camera entity exists (survives snapshot loads)
    function ensureCameraEntity(): modu.Entity {
        if (!cameraEntity || cameraEntity.destroyed || !cameraEntity.has(modu.Camera2D)) {
            cameraEntity = game.spawn('camera');
            const cam = cameraEntity.get(modu.Camera2D);
            cam.x = WORLD_WIDTH / 2;
            cam.y = WORLD_HEIGHT / 2;
            renderer.camera = cameraEntity;
        }
        return cameraEntity;
    }

    setupInput(ensureCameraEntity);

    // System to detect camera toggle key press (rising edge)
    game.addSystem(() => {
        const localId = getLocalClientId();
        if (localId === null) return;

        const playerInput = game.world.getInput(localId);
        const togglePressed = playerInput?.toggleCamera === true;

        if (togglePressed && !prevToggleCameraState) {
            cameraChaseEnabled = !cameraChaseEnabled;
            console.log('[DEBUG] Camera chase:', cameraChaseEnabled ? 'ON' : 'OFF');
        }
        prevToggleCameraState = togglePressed;
    }, { phase: 'update' });

    renderer.render = createRenderer(
        game,
        renderer,
        ensureCameraEntity,  // Pass getter function
        canvas,
        minimapCanvas,
        sizeDisplay,
        getLocalClientId
    );

    // Allow room ID override via URL param (for testing)
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room') || 'cell-eater-ecs';

    game.connect(roomId, {
        onRoomCreate() {
            console.log('[cell-eater] onRoomCreate');
            for (let i = 0; i < FOOD_COUNT; i++) spawnFood(game);
        },
        onConnect(clientId: string) {
            console.log('[cell-eater] onConnect:', clientId);
            spawnCell(game, clientId);

            if (clientId === game.localClientId) {
                const player = game.getEntityByClientId(clientId);
                if (player) {
                    const t = player.get(modu.Transform2D);
                    const cam = ensureCameraEntity().get(modu.Camera2D);
                    cam.x = t.x;
                    cam.y = t.y;
                }
            }
        },
        onDisconnect(clientId: string) {
            console.log('[cell-eater] onDisconnect:', clientId);
            const internedId = game.internClientId(clientId);
            for (const cell of getPlayerCells(game, internedId)) {
                cell.destroy();
            }
        }
    });

    modu.enableDebugUI(game);

    // Enable client-side prediction with rollback
    game.enablePrediction();
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
