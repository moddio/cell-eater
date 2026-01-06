/**
 * Cell Eater - Entity Definitions
 */

import * as modu from 'modu-engine';
import { INITIAL_RADIUS } from './constants';

export function defineEntities(game: modu.Game): void {
    game.defineEntity('cell')
        .with(modu.Transform2D)
        .with(modu.Sprite, { shape: modu.SHAPE_CIRCLE, radius: INITIAL_RADIUS, layer: 1 })
        .with(modu.Body2D, { shapeType: modu.SHAPE_CIRCLE, radius: INITIAL_RADIUS, bodyType: modu.BODY_KINEMATIC })
        .with(modu.Player)
        .register();

    game.defineEntity('food')
        .with(modu.Transform2D)
        .with(modu.Sprite, { shape: modu.SHAPE_CIRCLE, radius: 8, layer: 0 })
        .with(modu.Body2D, { shapeType: modu.SHAPE_CIRCLE, radius: 8, bodyType: modu.BODY_STATIC })
        .register();

    // Camera entity - client-only, excluded from snapshots entirely
    game.defineEntity('camera')
        .with(modu.Camera2D, { smoothing: 0.15 })
        .syncNone()
        .register();
}
