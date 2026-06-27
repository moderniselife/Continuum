/**
 * StreamingDots — Pulsing dots animation for streaming state.
 * Displays three dots with staggered animation delays to indicate
 * the assistant is generating a response.
 */

const StreamingDots = () => {
  return (
    <div className="flex items-center gap-1">
      <span
        className="bg-text-tertiary h-1.5 w-1.5 animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full"
        style={{ animationDelay: "0s" }}
      />
      <span
        className="bg-text-tertiary h-1.5 w-1.5 animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full"
        style={{ animationDelay: "0.15s" }}
      />
      <span
        className="bg-text-tertiary h-1.5 w-1.5 animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full"
        style={{ animationDelay: "0.3s" }}
      />
    </div>
  );
};

export default StreamingDots;
