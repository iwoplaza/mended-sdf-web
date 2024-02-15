import Select from './Select';
import { displayModeAtom } from './debugAtoms';

function DebugOptions() {
  return (
    <div>
      <Select
        label="Display Mode"
        options={[
          { key: 'mended', label: 'Mended' },
          { key: 'traditional', label: 'Traditional' },
          { key: 'g-buffer', label: 'G-Buffer' },
          { key: 'blur-diff', label: 'Blur Diff' },
        ]}
        valueAtom={displayModeAtom}
      />
    </div>
  );
}

export default DebugOptions;
