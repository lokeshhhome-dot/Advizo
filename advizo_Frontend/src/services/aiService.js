import axios from "axios";
import { getAppBridgeToken } from "../utils/getAppBridgeToken";

/**
 * Frontend AI service — single place that talks to the admin AI API.
 * Backend contract (unchanged): POST /api/admin/ai/chat/:adminId { message }
 */
export const sendAiMessage = async (app, message) => {
  const adminId = localStorage.getItem("advizo");
  if (!adminId) {
    throw new Error("Session not ready. Please reload the app.");
  }

  const token = await getAppBridgeToken(app);
  const response = await axios.post(
    `${process.env.REACT_APP_BACKEND_HOST}/admin/ai/chat/${adminId}`,
    { message },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response?.data?.reply || "No reply.";
};
