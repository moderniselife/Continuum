/**
 * ChatPanel — Main chat panel composing the model selector,
 * message view, and input area into a full-height layout.
 */

import ModelSelector from "./ModelSelector";
import ChatView from "./ChatView";
import ChatInput from "./ChatInput";

const ChatPanel = () => {
  return (
    <div className="mx-auto flex h-full w-full max-w-[800px] flex-col px-4">
      {/* Model selector header */}
      <div className="py-2">
        <ModelSelector />
      </div>

      {/* Scrollable message list */}
      <ChatView />

      {/* Input area */}
      <div className="pb-4">
        <ChatInput />
      </div>
    </div>
  );
};

export default ChatPanel;
