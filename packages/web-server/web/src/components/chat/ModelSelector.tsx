/**
 * ModelSelector — Dropdown for selecting the active LLM model.
 *
 * Trigger is a frosted glass pill showing the current model name with
 * a chevron indicator. The dropdown panel uses glass-heavy styling with
 * model rows displaying a provider badge and a check icon for the
 * currently selected model.
 *
 * @remarks Uses the Liquid Glass design language.
 */

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Sparkles } from "lucide-react";
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
      {/* Trigger pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="glass glass-shine border-border-glass text-text-secondary hover:border-border-hover hover:text-text-primary flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all duration-200"
      >
        <Sparkles size={14} className="text-accent" />
        <span className="max-w-[200px] truncate">
          {selectedModel?.name ?? "Select model"}
        </span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="glass-heavy animate-fade-in border-border-glass absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border shadow-xl shadow-black/20">
          {models.length === 0 ? (
            <div className="text-text-tertiary p-4 text-sm">
              No models configured
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto py-1">
              {models.map((model) => {
                const isSelected = model.id === selectedModelId;

                return (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setIsOpen(false);
                    }}
                    className={`hover:bg-bg-hover flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-all duration-150 ${
                      isSelected ? "bg-bg-active" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-text-primary block truncate font-medium">
                        {model.name}
                      </span>
                      <span className="text-text-tertiary block truncate text-xs">
                        {model.provider}
                      </span>
                    </span>

                    {/* Provider badge */}
                    <span className="glass-subtle text-text-tertiary shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                      {model.provider}
                    </span>

                    {isSelected && (
                      <Check size={14} className="text-accent shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
