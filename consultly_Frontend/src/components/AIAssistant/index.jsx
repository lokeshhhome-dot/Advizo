import { AiAssistantProvider } from "../../context/AiAssistantContext";
import FloatingButton from "./FloatingButton";
import ChatDrawer from "./ChatDrawer";

/**
 * Admin-only AI Assistant widget (floating button + slide-in chat drawer).
 * Mount ONCE inside the admin layout so a single instance persists across
 * all admin pages and the conversation survives navigation and open/close.
 */
export default function AiAssistantWidget() {
  return (
    <>
      <ChatDrawer />
      <FloatingButton />
    </>
  );
}

export { AiAssistantProvider };
