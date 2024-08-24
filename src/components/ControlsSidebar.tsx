import { useCallback } from 'react';
import { useAtom } from 'jotai';
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
} from '@/DebugOptions';

function ControlLabel(props: { htmlFor: string; children: string }) {
  return (
    <div className="min-h-[3rem] flex items-center">
      <Label htmlFor={props.htmlFor}>{props.children}</Label>
    </div>
  );
}

function DisplayModeControl() {
  const [displayMode, setDisplayMode] = useAtom(displayModeAtom);

  const onValueChange = useCallback(
    (value: string) => {
      setDisplayMode(value as DisplayMode);
    },
    [setDisplayMode],
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

export function ControlsSidebar() {
  return (
    <Card className="m-4 flex flex-col">
      <CardHeader>
        <img className="h-12" src="/mender-logo-light.svg" alt="Mender Logo" />
      </CardHeader>
      <CardContent className="grow">
        <div className="grid grid-cols-[1fr,auto] gap-y-2 gap-x-4 justify-items-end place-items-center">
          <ControlLabel htmlFor="camera-orientation">
            Camera orientation
          </ControlLabel>
          <Slider className="justify-self-start" id="camera-orientation" />

          <ControlLabel htmlFor="auto-rotate-camera">Auto rotate</ControlLabel>
          <Checkbox className="justify-self-start" id="auto-rotate-camera" />

          <DisplayModeControl />
        </div>
      </CardContent>
      <CardFooter className="grow-0 shrink">© Iwo Plaza 2024.</CardFooter>
    </Card>
  );
}
