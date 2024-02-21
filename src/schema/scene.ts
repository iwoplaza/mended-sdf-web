import { Parsed } from 'typed-binary';
import { struct, vec2i } from 'wigsill';

export type SceneSchema = Parsed<typeof SceneSchema>;
export const SceneSchema = struct({
  canvasSize: vec2i,
});

export const MAX_SPHERES = 10;
