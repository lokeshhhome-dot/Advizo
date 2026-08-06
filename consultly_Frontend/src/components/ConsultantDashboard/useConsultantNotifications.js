import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { socket } from "../Sokect-io/SokectConfig";

const getSessionIds = () => ({
  consultantId: localStorage.getItem("client_u_Identity"),
  shopId:
    localStorage.getItem("shop_o_Identity") ||
    localStorage.getItem("shop_o_Identity__"),
  token: localStorage.getItem("token"),
});

export function useConsultantNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    const { consultantId, shopId, token } = getSessionIds();
    if (!consultantId || !shopId || !token) return;

    setLoading(true);
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/notifications/${shopId}/${consultantId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.data?.success) {
        setNotifications(response.data.notifications || []);
        setUnreadCount(response.data.unreadCount || 0);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchNotifications();
    };

    socket.on("consultantNotification", handleRefresh);
    socket.on("receiveMessage", handleRefresh);
    socket.on("call-missed", handleRefresh);
    socket.on("seenUpdate", handleRefresh);

    return () => {
      socket.off("consultantNotification", handleRefresh);
      socket.off("receiveMessage", handleRefresh);
      socket.off("call-missed", handleRefresh);
      socket.off("seenUpdate", handleRefresh);
    };
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (notification) => {
    const { consultantId, shopId, token } = getSessionIds();
    if (!consultantId || !shopId || !token || !notification) return;

    try {
      const payload =
        notification.type === "message"
          ? { type: "message", userId: notification.userId }
          : { type: "missed_call", ids: [notification.id] };

      await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/notifications/${shopId}/${consultantId}/read`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      await fetchNotifications();
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    const { consultantId, shopId, token } = getSessionIds();
    if (!consultantId || !shopId || !token) return;

    try {
      await axios.put(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/notifications/${shopId}/${consultantId}/read`,
        { markAll: true },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      await fetchNotifications();
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}
