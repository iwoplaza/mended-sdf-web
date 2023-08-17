import { ChangeEvent, useCallback } from 'react';
import { SetStateAction, WritableAtom, useAtom } from 'jotai';

import { showPartialRendersAtom } from './debugAtoms';

function Checkbox({
  label,
  valueAtom,
}: {
  label: string;
  valueAtom: WritableAtom<boolean, [SetStateAction<boolean>], unknown>;
}) {
  const [value, setValue] = useAtom(valueAtom);

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.checked);
  }, []);

  return (
    <label>
      {label}
      <input type="checkbox" checked={value} onChange={onChange} />
    </label>
  );
}

function DebugOptions() {
  return (
    <div>
      <Checkbox
        label="Show Partial Renders"
        valueAtom={showPartialRendersAtom}
      />
    </div>
  );
}

export default DebugOptions;
