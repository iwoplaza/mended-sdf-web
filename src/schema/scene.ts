import { object, Parsed } from 'typed-binary';

import { Vec2i32 } from './primitive';

export type SceneSchema = Parsed<typeof SceneSchema>;
export const SceneSchema = object({
  canvasSize: Vec2i32,
});
