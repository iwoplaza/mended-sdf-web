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

function AutoRotateControl() {
  const [autoRotateControl, setAutoRotateControl] = useAtom(
    autoRotateControlAtom,
  );

  const onCheckedChange = useCallback(
    (e: CheckedState) => {
      setAutoRotateControl(e === true);
    },
    [setAutoRotateControl],
  );

  return (
    <>
      <ControlLabel htmlFor="auto-rotate-camera">Auto rotate</ControlLabel>
      <Checkbox
        checked={autoRotateControl}
        onCheckedChange={onCheckedChange}
        className="justify-self-start"
        id="auto-rotate-camera"
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
          <SelectItem value={'512'}>512x512</SelectItem>
          <SelectItem value={'1024'}>1024x1024</SelectItem>
          <SelectItem value={'2048'}>2048x2048</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}

export function ControlsSidebar() {
  return (
    <Card className="m-4 flex flex-col">
      <CardHeader>
        <img className="h-12" src="/mender-logo-light.svg" alt="Mender Logo" />
      </CardHeader>
      <CardContent className="grow">
        <div className="grid grid-cols-[1fr,auto] gap-y-2 gap-x-4 justify-items-end place-items-center">
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
          <AutoRotateControl />
          <DisplayModeControl />
          <TargetResolutionControl />
        </div>
      </CardContent>
      <CardFooter className="grow-0 shrink">© Iwo Plaza 2024.</CardFooter>
    </Card>
  );
}
