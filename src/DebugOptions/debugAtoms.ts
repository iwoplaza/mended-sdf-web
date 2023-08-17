import { atomWithStorage } from 'jotai/utils';

export const showPartialRendersAtom = atomWithStorage(
  'SHOW_PARTIAL_RENDERS',
  false,
);
