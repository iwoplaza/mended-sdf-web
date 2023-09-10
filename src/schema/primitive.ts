import { f32, i32, tupleOf } from 'typed-binary';

export const Vec2i32 = tupleOf(i32, 2);
export const Vec2f32 = tupleOf(f32, 2);

export const Vec3i32 = tupleOf(i32, 3);
export const Vec3f32 = tupleOf(f32, 3);

export const Vec4i32 = tupleOf(i32, 4);
export const Vec4f32 = tupleOf(f32, 4);
