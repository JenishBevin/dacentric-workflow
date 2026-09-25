import React, { createContext, useContext, useState } from "react";

interface PendingOpen {
  conversationId: string;
  title: string;
}

interface ChatLauncherValue {
  pendingOpen: PendingOpen | null;
  requestOpen: (conversationId: string, title: string) => void;
  clearPendingOpen: () => void;
}

const ChatLauncherContext = createContext<ChatLauncherValue | null>(null);

/** Lets a "Discuss" button, mounted inside a task/board page, tell the
 * globally-mounted <ChatWidget /> (in AppLayout) to open on a conversation
 * it just created — the two don't otherwise share any state. */
export function ChatLauncherProvider({ children }: { children: React.ReactNode }) {
  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null);

  return (
    <ChatLauncherContext.Provider
      value={{
        pendingOpen,
        requestOpen: (conversationId, title) => setPendingOpen({ conversationId, title }),
        clearPendingOpen: () => setPendingOpen(null),
      }}
    >
      {children}
    </ChatLauncherContext.Provider>
  );
}

export function useChatLauncher() {
  const ctx = useContext(ChatLauncherContext);
  if (!ctx) throw new Error("useChatLauncher must be used within ChatLauncherProvider");
  return ctx;
}
