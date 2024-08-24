import { useCallback } from 'react';
import { useAtom, useSetAtom } from 'jotai';
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
} from '@/controlAtoms';
import { accumulatedLayersAtom } from '@/GameEngine/sdfRenderer/sdfRenderer';

function ControlLabel(props: { htmlFor: string; children: string }) {
  return (
    <div className="min-h-[3rem] flex items-center">
      <Label htmlFor={props.htmlFor}>{props.children}</Label>
    </div>
  );
}

function CameraOrientationControl() {
  const [cameraOrientation, setCameraOrientation] = useAtom(
    cameraOrientationControlAtom,
  );
  const setAccumulatedLayers = useSetAtom(accumulatedLayersAtom);

  const onValueChange = useCallback(
    (values: number[]) => {
      setCameraOrientation(values[0]);
      setAccumulatedLayers(0);
    },
    [setCameraOrientation, setAccumulatedLayers],
  );

  return (
    <>
      <ControlLabel htmlFor="camera-orientation">
        Camera orientation
      </ControlLabel>
      <Slider
        value={[cameraOrientation]}
        onValueChange={onValueChange}
        className="justify-self-start"
        id="camera-orientation"
        max={360}
      />
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
          <CameraOrientationControl />
          <AutoRotateControl />
          <DisplayModeControl />
          <TargetResolutionControl />
        </div>
      </CardContent>
      <CardFooter className="grow-0 shrink">© Iwo Plaza 2024.</CardFooter>
    </Card>
  );
}
