import { Parsed } from 'typed-binary';
import { object, vec2i } from 'wigsill';

export type SceneSchema = Parsed<typeof SceneSchema>;
export const SceneSchema = object({
  canvasSize: vec2i,
});

export const MAX_SPHERES = 64;
