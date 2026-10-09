import { io } from "socket.io-client";
import {
  getActiveSession,
  getSocketUserIdForActiveSession,
  SESSION_TYPES,
  setupBrowserSessionSync,
} from "../../utils/browserSession";
import {
  clearConsultantSession,
  redirectToConsultantLogin,
} from "../../utils/consultantAuth";

setupBrowserSessionSync();

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

// const resolveSocketUrl = () => {
//   if (process.env.REACT_APP_SOCKET_URL) {
//     return process.env.REACT_APP_SOCKET_URL.replace(/\/$/, "");
//   }

//   const backendHost =
//     process.env.REACT_APP_BACKEND_HOST
//   return backendHost.replace(/\/api\/?$/, "").replace(/\/$/, "");
// };

const resolveSocketUrl = () => {
  const socketUrl = process.env.REACT_APP_SOCKET_URL?.trim();

  if (socketUrl) {
    return socketUrl.replace(/\/$/, "");
  }

  const backendHost = process.env.REACT_APP_BACKEND_HOST?.trim();

  if (backendHost) {
    return backendHost.replace(/\/api\/?$/, "").replace(/\/$/, "");
  }

  console.error(
    "[socket] Missing REACT_APP_SOCKET_URL and REACT_APP_BACKEND_HOST"
  );

  return "";
};

const SOCKET_URL = resolveSocketUrl();

let socketInstance = null;

const getSocketAuthPayload = () => {
  const token = localStorage.getItem("token");
  return token ? { token } : {};
};

export const getSocketUserId = () => getSocketUserIdForActiveSession();
export const isValidSocketUserId = (userId) =>
  Boolean(userId && OBJECT_ID_REGEX.test(String(userId).trim()));

export const notifySocketUserReady = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("advizo:socket-user"));
  }
};

export const getSocket = () => {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: getSocketAuthPayload(),
    });
    // The same consultant logged in on another device — the backend has
    // already invalidated this device's token, so log out here too.
    socketInstance.on("session:replaced", (payload) => {
      if (getActiveSession() !== SESSION_TYPES.CONSULTANT) return;
      socketInstance.io.opts.reconnection = false;
      clearConsultantSession();
      window.alert(
        payload?.message ||
          "You were logged out because your account signed in on another device.",
      );
      redirectToConsultantLogin();
    });
  } else {
    socketInstance.auth = getSocketAuthPayload();
  }
  return socketInstance;
};

export const registerSocketUser = (
  socket = getSocket(),
  userId = getSocketUserId(),
  activeCall = null,
) => {
  const id = String(userId || "").trim();
  if (!isValidSocketUserId(id)) return false;

  if (activeCall?.channelName) {
    socket.emit("register", {
      userId: id,
      callerId: activeCall.callerId,
      receiverId: activeCall.receiverId,
      channelName: activeCall.channelName,
    });
  } else {
    socket.emit("register", id);
  }
  return true;
};

export const emitCallLeaving = (activeCall) => {
  const socket = getSocket();
  const userId = getSocketUserId();
  if (!socket?.connected || !activeCall?.channelName || !userId) return;
  socket.emit("call-leaving", {
    userId,
    callerId: activeCall.callerId,
    receiverId: activeCall.receiverId,
    channelName: activeCall.channelName,
  });
};

export const emitCallReconnect = (activeCall) => {
  const socket = getSocket();
  const userId = getSocketUserId();
  if (!socket?.connected || !activeCall?.channelName || !userId) return;
  socket.emit("call-reconnect", {
    userId,
    callerId: activeCall.callerId,
    receiverId: activeCall.receiverId,
    channelName: activeCall.channelName,
  });
};

export const connectAndRegisterSocket = (activeCall = null, userIdOverride = null) => {
  const socket = getSocket();
  const userId = userIdOverride || getSocketUserId();

  if (!isValidSocketUserId(userId)) {
    console.warn("[socket] connect skipped: missing/invalid userId");
    return socket;
  }

  const onConnect = () => {
    registerSocketUser(socket, userId, activeCall);
    if (activeCall?.channelName) {
      emitCallReconnect(activeCall);
    }
    socket.off("connect", onConnect);
  };

  socket.auth = getSocketAuthPayload();

  if (socket.connected) {
    registerSocketUser(socket, userId, activeCall);
    if (activeCall?.channelName) {
      emitCallReconnect(activeCall);
    }
    return socket;
  }

  socket.off("connect", onConnect);
  socket.on("connect", onConnect);
  socket.connect();
  return socket;
};

/**
 * Wait until socket is connected (or fail after timeout).
 * @param {string|null} userIdOverride
 * @param {object|null} activeCall
 * @param {number} timeoutMs
 * @param {string|null} tokenOverride - JWT from URL; written to localStorage before connect
 */
export const ensureSocketConnected = (
  userIdOverride = null,
  activeCall = null,
  timeoutMs = 8000,
  tokenOverride = null,
) => {
  const socket = getSocket();
  const userId = userIdOverride || getSocketUserId();

  return new Promise((resolve, reject) => {
    if (!isValidSocketUserId(userId)) {
      reject(new Error("Missing user session. Please refresh and try again."));
      return;
    }

    const resolvedToken = String(
      tokenOverride || localStorage.getItem("token") || "",
    ).trim();

    if (!resolvedToken) {
      reject(new Error("Missing auth token. Please refresh and try again."));
      return;
    }

    localStorage.setItem("token", resolvedToken);
    socket.auth = { token: resolvedToken };

    if (socket.connected) {
      registerSocketUser(socket, userId, activeCall);
      resolve(socket);
      return;
    }

    let settled = false;

    const cleanup = () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
      clearTimeout(timer);
    };

    const onConnect = () => {
      if (settled) return;
      settled = true;
      cleanup();
      registerSocketUser(socket, userId, activeCall);
      resolve(socket);
    };

    const onError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err || new Error("Socket connection failed"));
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Socket connection timed out"));
    }, timeoutMs);

    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
    socket.connect();
  });
};

export const socket = getSocket();
