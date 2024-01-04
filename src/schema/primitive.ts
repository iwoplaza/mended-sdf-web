import {
  IRefResolver,
  ISerialInput,
  ISerialOutput,
  Schema,
  f32,
  i32,
  tupleOf,
} from 'typed-binary';

export type Vec2i32 = [number, number];
export const Vec2i32 = tupleOf(i32, 2);
export type Vec2f32 = [number, number];
export const Vec2f32 = tupleOf(f32, 2);

export type Vec3i32 = [number, number, number];
export const Vec3i32 = tupleOf(i32, 3);
export type Vec3f32 = [number, number, number];
export const Vec3f32 = tupleOf(f32, 3);

export type Vec4i32 = [number, number, number, number];
export const Vec4i32 = tupleOf(i32, 4);
export type Vec4f32 = [number, number, number, number];
export const Vec4f32 = tupleOf(f32, 4);

type IStableSchema = ReturnType<IRefResolver['resolve']>;
type ISchema = Parameters<IRefResolver['resolve']>[0];
export class PadSchema<T> extends Schema<T> {
  private innerSchema: IStableSchema;

  constructor(
    private readonly _innerUnstableSchema: ISchema,
    private readonly bytes: number,
    private readonly paddingValue: number = 0,
  ) {
    super();

    // In case this isn't part of a keyed chain,
    // let's assume the inner type is stable.
    this.innerSchema = _innerUnstableSchema as IStableSchema;
  }

  resolve(ctx: IRefResolver): void {
    this.innerSchema = ctx.resolve(this._innerUnstableSchema);
  }

  write(output: ISerialOutput, value: T): void {
    this.innerSchema.write(output, value);
    const valueSize = this.innerSchema.sizeOf(value);

    for (let i = valueSize; i < this.bytes; ++i) {
      output.writeByte(this.paddingValue);
    }
  }

  read(input: ISerialInput): T {
    const value = this.innerSchema.read(input) as T;
    const valueSize = this.innerSchema.sizeOf(value);

    // Reading the padding
    for (let i = valueSize; i < this.bytes; ++i) {
      input.readByte();
    }

    return value;
  }

  sizeOf(value: T): number {
    return Math.max(this.innerSchema.sizeOf(value), this.bytes);
  }
}

export const pad = <T>(
  innerSchema: Schema<T>,
  bytes: number,
  paddingValue?: number,
) => new PadSchema<T>(innerSchema, bytes, paddingValue);
