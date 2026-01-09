/**
 * InputPlugin - Handles input collection and network sending
 *
 * Provides a key-agnostic input system where:
 * - Games define actions with callback bindings
 * - Raw input state is tracked (keys, mouse)
 * - Input is automatically sent to server at tick rate
 *
 * @example
 * const input = game.addPlugin(InputPlugin, canvas);
 *
 * // Movement with custom key mapping (game defines the keys)
 * input.action('move', {
 *     type: 'vector',
 *     bindings: [() => {
 *         let x = 0, y = 0;
 *         if (input.isKeyDown('w')) y -= 1;
 *         if (input.isKeyDown('s')) y += 1;
 *         if (input.isKeyDown('a')) x -= 1;
 *         if (input.isKeyDown('d')) x += 1;
 *         return { x, y };
 *     }]
 * });
 *
 * // Button action
 * input.action('shoot', {
 *     type: 'button',
 *     bindings: [() => input.isMouseButtonDown(0)]
 * });
 *
 * // Raw state access
 * input.isKeyDown('space')     // Check any key
 * input.isMouseButtonDown(0)   // 0=left, 1=middle, 2=right
 * input.getMousePos()          // { x, y } screen coords
 */
import { Game } from '../game';
/** Action types */
export type ActionType = 'button' | 'vector';
/** Binding source - string shorthand or custom callback */
export type BindingSource = string | (() => any);
/** Action definition */
export interface ActionDef {
    type: ActionType;
    bindings: BindingSource[];
}
/** Vector value */
export interface Vec2 {
    x: number;
    y: number;
}
/**
 * InputPlugin - Action-based input system
 */
export declare class InputPlugin {
    private game;
    private canvas;
    /** Action definitions */
    private actions;
    /** Current bindings (may differ from defaults after rebind) */
    private bindings;
    /** Raw input state */
    private mousePos;
    private keysDown;
    private mouseButtons;
    /** Send interval handle */
    private sendInterval;
    constructor(game: Game, canvas: HTMLCanvasElement | string);
    /**
     * Define an action with default bindings.
     */
    action(name: string, def: ActionDef): this;
    /**
     * Rebind an action to new bindings.
     */
    rebind(name: string, bindings: BindingSource[]): this;
    /**
     * Reset action to default bindings.
     */
    resetBinding(name: string): this;
    /**
     * Reset all bindings to defaults.
     */
    resetAllBindings(): this;
    /**
     * Get current bindings for serialization.
     * Only includes string bindings (callbacks can't be serialized).
     */
    getBindings(): Record<string, string[]>;
    /**
     * Load bindings from serialized data.
     */
    loadBindings(data: Record<string, string[]>): this;
    /**
     * Check if a key is currently pressed.
     * Games can use this in callback bindings for custom key mappings.
     */
    isKeyDown(key: string): boolean;
    /**
     * Get current value of an action.
     */
    get(name: string): boolean | Vec2 | null;
    /**
     * Get all action values as an object.
     */
    getAll(): Record<string, any>;
    /**
     * Resolve button value from sources (OR logic).
     */
    private resolveButton;
    /**
     * Resolve vector value from sources (additive, clamped).
     */
    private resolveVector;
    /**
     * Resolve a string binding to button value.
     */
    private resolveStringButton;
    /**
     * Resolve a string binding to vector value.
     */
    private resolveStringVector;
    /**
     * Get mouse position.
     */
    getMousePos(): Vec2;
    /**
     * Check if a mouse button is pressed.
     * 0 = left, 1 = middle, 2 = right
     */
    isMouseButtonDown(button: number): boolean;
    /**
     * Set up event listeners.
     */
    private setupListeners;
    /**
     * Start the send loop.
     */
    private startSendLoop;
    /**
     * Stop the send loop.
     */
    destroy(): void;
}
