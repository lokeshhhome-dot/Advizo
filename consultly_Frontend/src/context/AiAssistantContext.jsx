import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { sendAiMessage } from "../services/aiService";

const AiAssistantContext = createContext(null);

/**
 * Single source of truth for the AI Assistant widget.
 * Mounted once in the admin layout, so the conversation survives
 * drawer open/close and route changes inside the dashboard.
 */
export function AiAssistantProvider({ children }) {
  const app = useAppBridge();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const clearChat = useCallback(() => setMessages([]), []);

  const sendMessage = useCallback(
    async (text) => {
      const message = String(text || "").trim();
      if (!message || loading) return;

      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", text: message },
      ]);
      setLoading(true);

      try {
        const reply = await sendAiMessage(app, message);
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", text: reply },
        ]);
      } catch (err) {
        const errorText =
          err?.response?.data?.message ||
          err?.message ||
          "AI service unavailable.";
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            text: errorText,
            isError: true,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [app, loading],
  );

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      messages,
      loading,
      sendMessage,
      clearChat,
    }),
    [isOpen, open, close, toggle, messages, loading, sendMessage, clearChat],
  );

  return (
    <AiAssistantContext.Provider value={value}>
      {children}
    </AiAssistantContext.Provider>
  );
}

export const useAiAssistant = () => {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) {
    throw new Error("useAiAssistant must be used inside AiAssistantProvider");
  }
  return ctx;
};
