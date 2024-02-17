export * as macros from './macros';

import { inflateWGSL } from './inflateOperator';
import { revolveX, revolveY, revolveZ } from './revolveOperators';
import { extrude } from './extrude';
import { smin } from './sminOperator';
import { repeatXYZ, repeatXZ } from './repeatOperator';

export const op = {
  inflate: inflateWGSL,
  revolveX,
  revolveY,
  revolveZ,
  extrude,
  smin,
  repeatXYZ,
  repeatXZ,
};

import { sphere, circle } from './sphere';
import { box2, box3 } from './box';
import { lineSegment2, lineSegment3 } from './lineSegment';

export const sdf = {
  sphere,
  circle,
  box2,
  box3,
  lineSegment2,
  lineSegment3,
};
