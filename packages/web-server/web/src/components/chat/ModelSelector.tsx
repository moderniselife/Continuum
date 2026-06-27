/**
 * ModelSelector — Dropdown for selecting the active model.
 * Displays the current model name with a chevron trigger and
 * a dropdown list of available models with a check indicator.
 */

import { ChevronDown, Check } from "lucide-react";
import Dropdown, { DropdownItem } from "@/components/shared/Dropdown";
import { useConfigStore } from "@/stores/configStore";

const ModelSelector = () => {
  const models = useConfigStore((s) => s.models);
  const selectedModelId = useConfigStore((s) => s.selectedModelId);
  const setSelectedModel = useConfigStore((s) => s.setSelectedModel);
  const selectedModel = useConfigStore((s) => s.getSelectedModel());

  const displayName = selectedModel?.name ?? "Select model";

  return (
    <Dropdown
      trigger={
        <button className="text-text-secondary hover:text-text-primary hover:bg-bg-hover flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-all duration-150">
          <span>{displayName}</span>
          <ChevronDown size={14} />
        </button>
      }
    >
      {models.map((model) => (
        <DropdownItem key={model.id} onClick={() => setSelectedModel(model.id)}>
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-sm">{model.name}</span>
            {model.id === selectedModelId && (
              <Check size={14} className="text-accent shrink-0" />
            )}
          </div>
        </DropdownItem>
      ))}
    </Dropdown>
  );
};

export default ModelSelector;
