import {
  IRefResolver,
  ISerialInput,
  ISerialOutput,
  Schema,
  f32,
  i32,
  tupleOf,
} from 'typed-binary';

export const Vec2i32 = tupleOf(i32, 2);
export const Vec2f32 = tupleOf(f32, 2);

export const Vec3i32 = tupleOf(i32, 3);
export const Vec3f32 = tupleOf(f32, 3);

export const Vec4i32 = tupleOf(i32, 4);
export const Vec4f32 = tupleOf(f32, 4);

export class PadSchema extends Schema<undefined> {
  constructor(
    private readonly bytes: number,
    private readonly paddingValue: number = 0,
  ) {
    super();
  }

  resolve(_ctx: IRefResolver): void {
    // nothing to resolve
  }

  write(output: ISerialOutput, _value: undefined): void {
    for (let i = 0; i < this.bytes; ++i) {
      output.writeByte(this.paddingValue);
    }
  }

  read(input: ISerialInput): undefined {
    for (let i = 0; i < this.bytes; ++i) {
      input.readByte();
    }
  }

  sizeOf(_value: undefined): number {
    return this.bytes;
  }
}

export const pad = (bytes: number, paddingValue?: number) =>
  new PadSchema(bytes, paddingValue);
