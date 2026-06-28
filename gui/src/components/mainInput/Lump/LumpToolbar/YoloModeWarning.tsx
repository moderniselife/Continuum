import { BoltIcon } from "@heroicons/react/24/solid";
import { useAppDispatch } from "../../../../redux/hooks";
import { setYoloMode } from "../../../../redux/slices/uiSlice";
import { Button } from "../../../ui";

export function YoloModeWarning() {
  const dispatch = useAppDispatch();

  return (
    <div className="bg-amber-500/15 border-amber-500/40 flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5">
      <div className="flex items-center gap-2">
        <BoltIcon className="h-4 w-4 flex-shrink-0 animate-pulse text-amber-400" />
        <span className="text-xs font-semibold text-amber-300">
          YOLO Mode Active — All tools auto-approved
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-2xs text-amber-400 hover:text-amber-300"
        onClick={() => dispatch(setYoloMode(false))}
        data-testid="disable-yolo-mode"
      >
        Disable
      </Button>
    </div>
  );
}
