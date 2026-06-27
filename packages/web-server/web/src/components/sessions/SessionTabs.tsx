import { useCallback } from "react";
import { X, Plus } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";

/** Maximum number of tabs visible in the tab bar */
const MAX_VISIBLE_TABS = 5;

/**
 * Horizontal session tab bar for the title bar.
 * Displays up to MAX_VISIBLE_TABS sessions as closeable tabs
 * with a trailing "new session" button.
 */
const SessionTabs = () => {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    createSession,
    deleteSession,
  } = useSessionStore();

  const visibleSessions = sessions.slice(0, MAX_VISIBLE_TABS);

  const handleTabClick = useCallback(
    (id: string) => {
      setActiveSession(id);
    },
    [setActiveSession],
  );

  const handleClose = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      deleteSession(id);
    },
    [deleteSession],
  );

  const handleCreate = useCallback(() => {
    createSession();
  }, [createSession]);

  return (
    <div className="scrollbar-hide flex flex-row items-center overflow-x-auto">
      {visibleSessions.map((session) => {
        const isActive = activeSessionId === session.id;

        return (
          <button
            key={session.id}
            type="button"
            onClick={() => handleTabClick(session.id)}
            className={`group flex max-w-[160px] shrink-0 items-center gap-1.5 px-3 py-1 text-xs transition-all duration-150 ${
              isActive
                ? "bg-bg-active text-text-primary border-accent border-b-2"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            } `}
          >
            <span className="truncate">{session.title}</span>

            {/* Close tab button — visible on hover */}
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => handleClose(e, session.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  deleteSession(session.id);
                }
              }}
              className="hover:bg-bg-hover rounded p-0.5 opacity-0 transition-all duration-150 group-hover:opacity-100"
              aria-label={`Close tab: ${session.title}`}
            >
              <X size={14} />
            </span>
          </button>
        );
      })}

      {/* New session button */}
      <button
        type="button"
        onClick={handleCreate}
        className="text-text-tertiary hover:text-text-primary hover:bg-bg-hover shrink-0 rounded p-1.5 transition-all duration-150"
        aria-label="Create new session"
      >
        <Plus size={14} />
      </button>
    </div>
  );
};

export default SessionTabs;
