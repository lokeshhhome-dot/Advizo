const mongoose = require("mongoose");
const { User } = require("../Modal/userSchema");
const { shopModel } = require("../Modal/shopify");
const { TransactionHistroy } = require("../Modal/transactionHistroy");
const { usersShareShop, userBelongsToShop, consultantBelongsToShop } = require("../Auth/auth");
const { invalidateConsultantList } = require("../Utils/redis");

const CHANNEL_NAME_REGEX = /^channel-[a-f0-9]{6}-[a-f0-9]{6}$/i;

const getAuthUserId = (socket) =>
  socket?.data?.userId ? String(socket.data.userId) : null;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const isValidChannelName = (channelName) =>
  typeof channelName === "string" &&
  channelName.length > 0 &&
  channelName.length <= 128 &&
  CHANNEL_NAME_REGEX.test(channelName);

const isValidCallType = (callType) =>
  callType === "voice" || callType === "video" || callType === "chat";

const rejectSocketAction = (socket, event, reason = "forbidden") => {
  socket.emit("socket-error", { event, reason });
  return false;
};

const assertAuthenticated = (socket, event) => {
  if (!getAuthUserId(socket)) {
    return rejectSocketAction(socket, event, "unauthenticated");
  }
  return true;
};

const assertSameShopUsers = async (userId, otherUserId) => {
  if (!isValidObjectId(userId) || !isValidObjectId(otherUserId)) {
    return false;
  }
  return usersShareShop(userId, otherUserId);
};

const assertCallParticipant = async (socket, { callerId, receiverId, event }) => {
  if (!assertAuthenticated(socket, event)) return false;

  const authId = getAuthUserId(socket);

  if (!isValidObjectId(callerId) || !isValidObjectId(receiverId)) {
    return rejectSocketAction(socket, event, "invalid_ids");
  }

  if (authId !== String(callerId) && authId !== String(receiverId)) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  if (!(await assertSameShopUsers(callerId, receiverId))) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  return true;
};

const assertCallInitiator = async (socket, { callerId, receiverId, event }) => {
  if (!(await assertCallParticipant(socket, { callerId, receiverId, event }))) {
    return false;
  }

  if (getAuthUserId(socket) !== String(callerId)) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  return true;
};

const assertCallReceiver = async (socket, { callerId, receiverId, event }) => {
  if (!(await assertCallParticipant(socket, { callerId, receiverId, event }))) {
    return false;
  }

  if (getAuthUserId(socket) !== String(receiverId)) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  return true;
};

const isValidAttachmentPayload = (attachment) =>
  attachment &&
  typeof attachment === "object" &&
  (attachment.type === "image" || attachment.type === "pdf") &&
  typeof attachment.storageKey === "string" &&
  attachment.storageKey.length > 0 &&
  typeof attachment.mimeType === "string" &&
  attachment.mimeType.length > 0 &&
  typeof attachment.originalName === "string" &&
  attachment.originalName.length > 0 &&
  Number.isFinite(attachment.size) &&
  attachment.size > 0;

const assertChatMessage = async (socket, { receiverId, shop_id, text, attachment, event }) => {
  if (!assertAuthenticated(socket, event)) return false;

  const senderId = getAuthUserId(socket);

  if (!isValidObjectId(receiverId) || !isValidObjectId(shop_id)) {
    return rejectSocketAction(socket, event, "invalid_ids");
  }

  const hasText = typeof text === "string" && text.trim().length > 0 && text.length <= 5000;
  const hasAttachment = isValidAttachmentPayload(attachment);

  if (!hasText && !hasAttachment) {
    return rejectSocketAction(socket, event, "invalid_payload");
  }

  if (String(socket.data.shopId) !== String(shop_id)) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  if (!(await userBelongsToShop(senderId, shop_id))) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  if (!(await consultantBelongsToShop(receiverId, shop_id))) {
    const reverseOk =
      (await consultantBelongsToShop(senderId, shop_id)) &&
      (await userBelongsToShop(receiverId, shop_id));

    if (!reverseOk) {
      return rejectSocketAction(socket, event, "forbidden");
    }
  }

  return true;
};

const assertChatPair = async (socket, { userId, consultantId, shopId, event }) => {
  if (!assertAuthenticated(socket, event)) return false;

  const authId = getAuthUserId(socket);

  if (
    !isValidObjectId(userId) ||
    !isValidObjectId(consultantId) ||
    !isValidObjectId(shopId)
  ) {
    return rejectSocketAction(socket, event, "invalid_ids");
  }

  if (authId !== String(userId) && authId !== String(consultantId)) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  if (!(await userBelongsToShop(userId, shopId))) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  if (!(await consultantBelongsToShop(consultantId, shopId))) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  return true;
};

const assertConsultantOnly = (socket, event) => {
  if (!assertAuthenticated(socket, event)) return false;

  if (socket.data.role !== "consultant") {
    return rejectSocketAction(socket, event, "forbidden");
  }

  return true;
};

const assertTransactionParticipant = async (
  socket,
  { transactionId, userId, consultantId, shopId, event },
) => {
  if (!(await assertChatPair(socket, { userId, consultantId, shopId, event }))) {
    return false;
  }

  if (!isValidObjectId(transactionId)) {
    return rejectSocketAction(socket, event, "invalid_ids");
  }

  const transaction = await TransactionHistroy.findById(transactionId).select(
    "senderId receiverId shop_id status",
  );

  if (!transaction) {
    return rejectSocketAction(socket, event, "not_found");
  }

  const authId = getAuthUserId(socket);
  const senderId = String(transaction.senderId);
  const receiverId = String(transaction.receiverId);

  if (authId !== senderId && authId !== receiverId) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  if (
    String(transaction.senderId) !== String(userId) &&
    String(transaction.receiverId) !== String(userId)
  ) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  if (
    String(transaction.senderId) !== String(consultantId) &&
    String(transaction.receiverId) !== String(consultantId)
  ) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  if (String(transaction.shop_id) !== String(shopId)) {
    return rejectSocketAction(socket, event, "forbidden");
  }

  return true;
};

const resolveShopFromDomain = async (shopDomain) => {
  if (!shopDomain || typeof shopDomain !== "string") return null;
  return shopModel.findOne({ shop: shopDomain }).select("_id shop");
};

const registerSocketPresence = async (io, socket, onlineUsers) => {
  const uid = getAuthUserId(socket);
  if (!uid) return false;

  // MULTI-SOCKET: a user may have the dashboard AND the call window connected
  // at once. We no longer force-disconnect the previous socket — socket.io
  // clients NEVER auto-reconnect after a server-side disconnect, so kicking
  // the dashboard when the call window registered left the consultant deaf
  // (no incoming-call after every finished call until a manual refresh).
  // onlineUsers points at the newest socket; unregister falls back to any
  // other still-connected socket of the same user.
  socket.join(uid);
  onlineUsers.set(uid, socket.id);

  try {
    await User.findByIdAndUpdate(uid, { isActive: true });
    // `isActive` is returned by getConsultant, so a consultant coming online
    // must drop the cached list — otherwise the storefront shows them offline
    // for up to the full TTL. Customers don't appear in that list, so their
    // (far more frequent) connects are skipped rather than thrashing the cache.
    if (socket.data.role === "consultant") {
      await invalidateConsultantList(socket.data.shopId);
    }
  } catch (err) {
    console.error("[socket] failed to mark user active:", err.message);
  }

  socket.emit("registered", { userId: uid });
  return true;
};

const unregisterSocketPresence = async (io, socket, onlineUsers, handleUserDisconnect) => {
  const uid = getAuthUserId(socket);
  if (!uid) return null;

  if (onlineUsers.get(uid) === socket.id) {
    // Another socket of the same user still connected (e.g. the dashboard
    // after the call window closed)? Point presence at it — the user is
    // still online: no inactive mark, no disconnect grace, and the next
    // incoming-call reaches them without any refresh.
    const room = io?.sockets?.adapter?.rooms?.get(uid);
    const fallbackSocketId = room
      ? [...room].find((id) => id !== socket.id)
      : null;
    if (fallbackSocketId) {
      onlineUsers.set(uid, fallbackSocketId);
      return uid;
    }

    onlineUsers.delete(uid);

    try {
      await User.findByIdAndUpdate(uid, { isActive: false });
      // Consultant went offline — drop the cached list so the storefront stops
      // advertising them as available.
      if (socket.data.role === "consultant") {
        await invalidateConsultantList(socket.data.shopId);
      }
    } catch (err) {
      console.error("[socket] failed to mark user inactive:", err.message);
    }

    handleUserDisconnect(uid, "disconnect");
  }

  return uid;
};

module.exports = {
  getAuthUserId,
  isValidObjectId,
  isValidChannelName,
  isValidCallType,
  rejectSocketAction,
  assertAuthenticated,
  assertCallParticipant,
  assertCallInitiator,
  assertCallReceiver,
  assertChatMessage,
  assertChatPair,
  assertConsultantOnly,
  assertTransactionParticipant,
  resolveShopFromDomain,
  registerSocketPresence,
  unregisterSocketPresence,
};
