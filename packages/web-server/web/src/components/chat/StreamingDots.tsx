/**
 * StreamingDots — Pulsing dots animation for streaming state.
 *
 * Displays three accent-coloured dots with staggered animation delays
 * inside a frosted glass pill to indicate the assistant is generating
 * a response.
 *
 * @remarks Uses the Liquid Glass design language.
 */

const StreamingDots = () => {
  return (
    <div className="glass-subtle inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="bg-accent h-1.5 w-1.5 animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
};

export default StreamingDots;
