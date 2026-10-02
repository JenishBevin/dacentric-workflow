import React, { createContext, useContext, useState } from "react";

interface PendingOpen {
  conversationId: string;
  title: string;
  isGroup: boolean;
}

interface ChatLauncherValue {
  pendingOpen: PendingOpen | null;
  /** isGroup defaults to true — every existing caller (the "Discuss" button)
   *  only ever creates group conversations; a 1:1 caller (the chat desktop
   *  notification's click handler) passes the conversation's real value. */
  requestOpen: (conversationId: string, title: string, isGroup?: boolean) => void;
  clearPendingOpen: () => void;
}

const ChatLauncherContext = createContext<ChatLauncherValue | null>(null);

/** Lets something outside the globally-mounted <ChatWidget /> (in
 * AppLayout) — a "Discuss" button, a chat desktop notification's click —
 * tell it to open on a specific conversation. The two don't otherwise share
 * any state. */
export function ChatLauncherProvider({ children }: { children: React.ReactNode }) {
  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null);

  return (
    <ChatLauncherContext.Provider
      value={{
        pendingOpen,
        requestOpen: (conversationId, title, isGroup = true) => setPendingOpen({ conversationId, title, isGroup }),
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
