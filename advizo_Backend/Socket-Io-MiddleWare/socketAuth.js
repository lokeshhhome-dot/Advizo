const JWT = require("jsonwebtoken");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { User } = require("../Modal/userSchema");
const { isConsultantSessionCurrent } = require("../Auth/auth");

dotenv.config();

const resolveUserIdFromPayload = async (payload) => {
  if (!payload) return null;

  if (payload.id) {
    return String(payload.id);
  }

  if (payload._id) {
    return String(payload._id);
  }

  if (payload.email) {
    const user = await User.findOne({ email: payload.email }).select("_id");
    return user?._id ? String(user._id) : null;
  }

  return null;
};

const extractTokenFromHandshake = (handshake) => {
  const auth = handshake?.auth || {};

  if (auth.token && typeof auth.token === "string") {
    return auth.token.trim();
  }

  const header = handshake?.headers?.authorization || handshake?.headers?.Authorization;
  if (typeof header === "string" && /^Bearer\s+/i.test(header)) {
    return header.trim().split(" ")[1];
  }

  return null;
};

const authenticateSocketHandshake = async (handshake) => {
  const token = extractTokenFromHandshake(handshake);

  if (token) {
    try {
      const payload = JWT.verify(token, process.env.JWT_SECRET_KEY);
      // A consultant token from a device that has since been replaced by a
      // newer login must not reconnect.
      if (!(await isConsultantSessionCurrent(payload))) {
        return { error: "session_replaced" };
      }
      const userId = await resolveUserIdFromPayload(payload);

      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return { error: "invalid_token" };
      }

      const user = await User.findById(userId).select("_id userType shop_id");
      if (!user) {
        return { error: "invalid_token" };
      }

      return { user, authMethod: "jwt", sessionId: payload.sid || null };
    } catch (err) {
      return { error: "invalid_token" };
    }
  }

  return { error: "unauthorized" };
};

const createSocketAuthMiddleware = () => {
  return async (socket, next) => {
    try {
      const result = await authenticateSocketHandshake(socket.handshake);

      if (result.error || !result.user) {
        return next(new Error("Unauthorized"));
      }

      const userId = String(result.user._id);
      socket.data.userId = userId;
      socket.data.role = result.user.userType || null;
      socket.data.shopId = result.user.shop_id ? String(result.user.shop_id) : null;
      socket.data.authMethod = result.authMethod;
      socket.data.sessionId = result.sessionId || null;
      socket.user = {
        id: userId,
        role: socket.data.role,
        shopId: socket.data.shopId,
      };

      return next();
    } catch (err) {
      console.error("[socket-auth] handshake failed:", err.message);
      return next(new Error("Unauthorized"));
    }
  };
};

module.exports = {
  createSocketAuthMiddleware,
  authenticateSocketHandshake,
};
