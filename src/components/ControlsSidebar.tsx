import { useCallback, useId } from 'react';
import {
  type SetStateAction,
  useAtom,
  useSetAtom,
  type WritableAtom,
} from 'jotai';
import type { RESET } from 'jotai/utils';
import type { SliderProps } from '@radix-ui/react-slider';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { Card, CardContent, CardFooter, CardHeader } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Slider } from './ui/slider';
import {
  type DisplayMode,
  DisplayModes,
  displayModeAtom,
  autoRotateControlAtom,
  cameraOrientationControlAtom,
  targetResolutionAtom,
  cameraYControlAtom,
  cameraZoomControlAtom,
  cameraFovControlAtom,
} from '@/controlAtoms';
import { accumulatedLayersAtom } from '@/GameEngine/sdfRenderer/sdfRenderer';

function ControlLabel(props: { htmlFor: string; children: string }) {
  return (
    <div className="min-h-[3rem] flex items-center">
      <Label htmlFor={props.htmlFor}>{props.children}</Label>
    </div>
  );
}

function SliderControl(
  props: {
    label: string;
    valueAtom: WritableAtom<
      number,
      [SetStateAction<number | typeof RESET>],
      void
    >;
  } & SliderProps,
) {
  const { label, valueAtom, ...rest } = props;

  const id = useId();
  const [value, setValue] = useAtom(valueAtom);
  const setAccumulatedLayers = useSetAtom(accumulatedLayersAtom);

  const onValueChange = useCallback(
    (values: number[]) => {
      setValue(values[0]);
      setAccumulatedLayers(0);
    },
    [setValue, setAccumulatedLayers],
  );

  return (
    <>
      <ControlLabel htmlFor={id}>{label}</ControlLabel>
      <div className="justify-self-stretch gap-2 flex">
        <Slider
          {...rest}
          value={[value]}
          onValueChange={onValueChange}
          className="grow"
          id={id}
        />
        <p className="min-w-12 text-right">{value}</p>
      </div>
    </>
  );
}

function CheckboxControl(props: {
  label: string;
  valueAtom: WritableAtom<
    boolean,
    [SetStateAction<boolean | typeof RESET>],
    void
  >;
}) {
  const { label, valueAtom } = props;

  const id = useId();
  const [checked, setChecked] = useAtom(valueAtom);

  const onCheckedChange = useCallback(
    (e: CheckedState) => {
      setChecked(e === true);
    },
    [setChecked],
  );

  return (
    <>
      <ControlLabel htmlFor={id}>{label}</ControlLabel>
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="justify-self-start"
        id="id"
      />
    </>
  );
}

function DisplayModeControl() {
  const [displayMode, setDisplayMode] = useAtom(displayModeAtom);
  const setAccumulatedLayers = useSetAtom(accumulatedLayersAtom);

  const onValueChange = useCallback(
    (value: string) => {
      setDisplayMode(value as DisplayMode);
      setAccumulatedLayers(0);
    },
    [setDisplayMode, setAccumulatedLayers],
  );

  return (
    <>
      <ControlLabel htmlFor="display-mode">Display mode</ControlLabel>
      <Select value={displayMode} onValueChange={onValueChange}>
        <SelectTrigger className="w-[180px]" id="display-mode">
          <SelectValue placeholder="Display mode" />
        </SelectTrigger>
        <SelectContent>
          {DisplayModes.map((mode) => (
            <SelectItem key={mode.key} value={mode.key}>
              {mode.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function TargetResolutionControl() {
  const [targetResolution, setTargetResolution] = useAtom(targetResolutionAtom);
  const setAccumulatedLayers = useSetAtom(accumulatedLayersAtom);

  const onValueChange = useCallback(
    (value: string) => {
      setTargetResolution(Number.parseInt(value));
      setAccumulatedLayers(0);
    },
    [setTargetResolution, setAccumulatedLayers],
  );

  return (
    <>
      <ControlLabel htmlFor="target-resolution">Target resolution</ControlLabel>
      <Select value={String(targetResolution)} onValueChange={onValueChange}>
        <SelectTrigger className="w-[180px]" id="target-resolution">
          <SelectValue placeholder="Target resolution" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={'256'}>256x256</SelectItem>
          <SelectItem value={'360'}>360x360</SelectItem>
          <SelectItem value={'480'}>480x480</SelectItem>
          <SelectItem value={'512'}>512x512</SelectItem>
          <SelectItem value={'750'}>750x750</SelectItem>
          <SelectItem value={'1024'}>1024x1024</SelectItem>
          <SelectItem value={'1600'}>1600x1600</SelectItem>
          <SelectItem value={'2048'}>2048x2048</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}

export function ControlsSidebar() {
  return (
    <Card className="m-4 flex flex-col max-w-96">
      <CardHeader>
        <img className="h-12" src="/phoure-logo-light.svg" alt="thoure logo" />
        <h1 className="hidden">thoure</h1>
        <h2 className="font-poppins text-xs text-center text-slate-700">
          Ethical AI upscaling for games.
        </h2>
      </CardHeader>
      <CardContent className="grow">
        <p className="text-sm text-justify mt-3 mb-10">
          The goal of <strong>phoure</strong> is to be an upscaling solution
          that does not infringe on the rights of artists. Try it out in this
          live demo.
        </p>
        <div className="grid grid-cols-[1fr,auto] gap-y-2 gap-x-4 justify-items-end place-items-center">
          <DisplayModeControl />
          <TargetResolutionControl />
          <SliderControl
            label="Camera orientation"
            valueAtom={cameraOrientationControlAtom}
            max={360}
          />
          <SliderControl
            label="Camera Y"
            valueAtom={cameraYControlAtom}
            min={-0.2}
            step={0.01}
            max={1}
          />
          <SliderControl
            label="Camera Zoom"
            valueAtom={cameraZoomControlAtom}
            min={1}
            step={0.01}
            max={4}
          />
          <SliderControl
            label="Camera FOV"
            valueAtom={cameraFovControlAtom}
            min={20}
            step={1}
            max={170}
          />
          <CheckboxControl
            label="Auto rotate"
            valueAtom={autoRotateControlAtom}
          />
          {/* <CheckboxControl
            label="Measure performance"
            valueAtom={measurePerformanceAtom}
          /> */}
        </div>
      </CardContent>
      <CardFooter className="grow-0 shrink flex justify-between items-center text-slate-500">
        <span className="text-sm">© Iwo Plaza 2024</span>
        <a
          href="https://github.com/iwoplaza/phoure"
          target="_blank"
          rel="noreferrer noopener"
        >
          <img src="/github-icon.svg" alt="GitHub logo" />
        </a>
      </CardFooter>
    </Card>
  );
}
