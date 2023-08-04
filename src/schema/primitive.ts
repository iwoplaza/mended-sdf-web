import {
  FLOAT,
  INT,
  IRefResolver,
  ISerialInput,
  ISerialOutput,
  Schema,
} from 'typed-binary';

export class Vec2Schema extends Schema<[number, number]> {
  constructor(private numberType: Schema<number>) {
    super();
  }

  resolve(_ctx: IRefResolver): void {
    // No inner references to resolve
  }

  read(input: ISerialInput): [number, number] {
    const x = this.numberType.read(input);
    const y = this.numberType.read(input);

    return [x, y];
  }

  write(output: ISerialOutput, [x, y]: [number, number]): void {
    this.numberType.write(output, x);
    this.numberType.write(output, y);
  }

  sizeOf([x, y]: [number, number]): number {
    return this.numberType.sizeOf(x) + this.numberType.sizeOf(y);
  }
}

export const Vec2i32 = new Vec2Schema(INT);
export const Vec2f32 = new Vec2Schema(FLOAT);
