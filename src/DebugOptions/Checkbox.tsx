import { ChangeEvent, useCallback } from "react";
import { SetStateAction, WritableAtom, useAtom } from "jotai";

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

  export default Checkbox;