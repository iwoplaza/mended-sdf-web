import { ChangeEvent, useCallback } from 'react';
import { SetStateAction, WritableAtom, useAtom } from 'jotai';

import { displayModeAtom } from './debugAtoms';

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

function Select<T extends string>({
  label,
  options,
  valueAtom,
}: {
  label: string;
  options: { key: T; label: string }[];
  valueAtom: WritableAtom<T, [SetStateAction<T>], unknown>;
}) {
  const [value, setValue] = useAtom(valueAtom);

  const handleSelect = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setValue(event.currentTarget.value as T);
    },
    [],
  );

  return (
    <label>
      {label}
      <select value={value} onChange={handleSelect}>
        {options.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DebugOptions() {
  return (
    <div>
      <Select
        label="Display Mode"
        options={[
          { key: 'mended', label: 'Mended' },
          { key: 'traditional', label: 'Traditional' },
          { key: 'g-buffer', label: 'G-Buffer' },
        ]}
        valueAtom={displayModeAtom}
      />
    </div>
  );
}

export default DebugOptions;
