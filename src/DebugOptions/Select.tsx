import { useCallback } from 'react';
import { SetStateAction, WritableAtom, useAtom } from 'jotai';

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

export default Select;
