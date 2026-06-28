/**
 * ModelSelector — Dropdown for selecting the active LLM model.
 * Displays the currently selected model and a list of all available models.
 */

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useConfigStore } from "@/stores/configStore";

const ModelSelector = () => {
  const models = useConfigStore((s) => s.models);
  const selectedModelId = useConfigStore((s) => s.selectedModelId);
  const setSelectedModel = useConfigStore((s) => s.setSelectedModel);
  const selectedModel = models.find((m) => m.id === selectedModelId);

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-bg-elevated hover:bg-bg-hover border-border text-text-secondary flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all duration-150"
      >
        <span className="max-w-[200px] truncate">
          {selectedModel?.name ?? "Select model"}
        </span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="bg-bg-elevated border-border animate-fade-in absolute top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border shadow-xl">
          {models.length === 0 ? (
            <div className="text-text-tertiary p-3 text-sm">
              No models configured
            </div>
          ) : (
            models.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  setSelectedModel(model.id);
                  setIsOpen(false);
                }}
                className="hover:bg-bg-hover flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-all duration-150"
              >
                <span className="flex-1 truncate">
                  <span className="text-text-primary">{model.name}</span>
                  <span className="text-text-tertiary ml-2 text-xs">
                    {model.provider}
                  </span>
                </span>
                {model.id === selectedModelId && (
                  <Check size={14} className="text-accent shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
