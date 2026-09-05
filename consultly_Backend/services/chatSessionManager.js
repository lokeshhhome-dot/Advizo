const mongoose = require("mongoose");
const { User } = require("../Modal/userSchema");
const { TransactionHistroy } = require("../Modal/transactionHistroy");
const { shopModel } = require("../Modal/shopify");
const { WalletHistory } = require("../Modal/walletHistory");
const { formatTime } = require("../Helper/helper");
const { consumeMinutes } = require("./subscriptionMinutes");

// Same reliability philosophy as services/callSessionManager.js's
// GRACE_PERIOD_MS: a disconnect (refresh, tab close, network loss) doesn't
// instantly end billing — it starts a short window to reconnect. Socket.IO's
// own transport-level heartbeat (pingInterval: 10000, pingTimeout: 5000 in
// server-io.js) already spends up to ~15s detecting a truly dead connection
// before "disconnect" even fires, so this grace period is layered ON TOP of
// that — no separate application-level heartbeat event is introduced, the
// existing Socket.IO ping/pong IS layer 1.
const CHAT_GRACE_PERIOD_MS = 20000;

const logChat = (transactionId, message, extra = {}) => {
  console.log(`[CHAT-SESSION ${transactionId}] ${message}`, Object.keys(extra).length ? extra : "");
};

/**
 * Tracks actively-billing chat sessions (keyed by the SAME TransactionHistroy
 * _id the existing chat billing already uses — no new session/ID concept)
 * and provides ONE idempotent finalization function so the explicit
 * "endChat" socket event, a disconnect-grace-period timeout, and the
 * beforeunload/pagehide REST endpoint all funnel through the exact same
 * billing math instead of three copies of it.
 */
const createChatSessionManager = (io, notifyChatsOnMinutesExhausted) => {
  // transactionId -> { transactionId, userId, consultantId, shopId, graceTimers: {} }
  const activeChats = new Map();
  const endingChats = new Set();

  const clearGraceTimer = (chat, userId) => {
    const timer = chat?.graceTimers?.[userId];
    if (timer) {
      clearTimeout(timer);
      delete chat.graceTimers[userId];
    }
  };

  const registerActiveChat = ({ transactionId, userId, consultantId, shopId }) => {
    const id = String(transactionId);
    activeChats.set(id, {
      transactionId: id,
      userId: String(userId),
      consultantId: String(consultantId),
      shopId: String(shopId),
      graceTimers: {},
    });
    logChat(id, "registered active chat");
  };

  const removeActiveChat = (transactionId) => {
    const id = String(transactionId);
    const chat = activeChats.get(id);
    if (chat) {
      Object.keys(chat.graceTimers || {}).forEach((uid) => clearGraceTimer(chat, uid));
    }
    activeChats.delete(id);
    endingChats.delete(id);
  };

  /**
   * The SAME finalization math the existing "endChat" socket handler always
   * ran, extracted verbatim (no new balance-capping, no new fields) so every
   * trigger path is billing-identical to before. Idempotent: only the first
   * caller to see status !== "completed" performs billing; concurrent or
   * later callers for the same transactionId get { skipped: true }.
   */
  const finalizeChatSession = async (transactionId, { reason = "ended", endedBy = "system" } = {}) => {
    const id = String(transactionId);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return { skipped: true, reason: "invalid_id" };
    }
    if (endingChats.has(id)) {
      logChat(id, "finalize skipped — already ending");
      return { skipped: true, reason: "already_ending" };
    }
    endingChats.add(id);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const transaction = await TransactionHistroy.findById(id).session(session);
      if (!transaction) {
        await session.abortTransaction();
        endingChats.delete(id);
        return { skipped: true, reason: "not_found" };
      }
      if (transaction.status === "completed") {
        await session.abortTransaction();
        endingChats.delete(id);
        removeActiveChat(id);
        return { skipped: true, reason: "already_completed" };
      }

      const userId = String(transaction.senderId);
      const consultantId = String(transaction.receiverId);
      const shopId = String(transaction.shop_id);

      const consultantCost = await User.findById(consultantId).session(session);
      if (!consultantCost) throw new Error("Consultant not found");
      const shop = await shopModel.findById(shopId).session(session);
      if (!shop) throw new Error("Shop not found");
      const user_ = await User.findById(userId).session(session);
      if (!user_) throw new Error("User not found");

      const endTime = new Date();
      const totalSeconds = Math.floor((endTime - new Date(transaction.startTime)) / 1000);
      const perSecondCost = consultantCost.chatPerMinute / 60;
      const totalAmount = Number((totalSeconds * perSecondCost).toFixed(2));
      const adminCommission = (totalAmount * Number(shop.adminPersenTage)) / 100;
      const consultantShare = totalAmount - adminCommission;
      const shopShare = adminCommission;

      transaction.endTime = endTime;
      transaction.totalSeconds = totalSeconds;
      transaction.totalAmount = totalAmount;
      transaction.status = "completed";
      await transaction.save({ session });

      await User.findByIdAndUpdate(userId, { $inc: { walletBalance: -totalAmount } }, { session });
      await User.findByIdAndUpdate(consultantId, { $inc: { walletBalance: consultantShare } }, { session });
      await shopModel.findByIdAndUpdate(shopId, { $inc: { adminWalletBalance: shopShare } }, { session });

      await TransactionHistroy.findByIdAndUpdate(
        id,
        {
          $inc: {
            adminAmount: adminCommission,
            consultantAmount: consultantShare,
            amount: totalAmount,
          },
        },
        { session },
      );

      await User.findByIdAndUpdate(
        userId,
        { $set: { isChatAccepted: "chatEnd", chatLock: true } },
        { session },
      );

      // Matches the original endChat handler exactly — these two writes were
      // never session-scoped there either, so left as-is rather than
      // "improving" billing-adjacent behavior that wasn't asked for.
      await WalletHistory.create({
        userId,
        shop_id: shopId,
        amount: totalAmount,
        transactionType: "usage",
        referenceType: "chat",
        direction: "debit",
        description: `Chat ended for ${formatTime(totalSeconds)} minutes`,
        status: "success",
      });
      await WalletHistory.create({
        userId: consultantId,
        shop_id: shopId,
        amount: consultantShare,
        transactionType: "usage",
        referenceType: "chat",
        direction: "credit",
        description: `Chat ended for ${formatTime(totalSeconds)} minutes`,
        status: "success",
      });

      await consumeMinutes(shopId, totalSeconds, session);

      await session.commitTransaction();

      const payload = { transactionId: id, totalSeconds, totalAmount, reason };
      io.to(userId).emit("chatEnded", payload);
      io.to(consultantId).emit("chatEnded", payload);

      if (typeof notifyChatsOnMinutesExhausted === "function") {
        notifyChatsOnMinutesExhausted(shopId).catch(() => {});
      }

      removeActiveChat(id);
      logChat(id, "finalized", { reason, endedBy, totalSeconds, totalAmount });

      return { success: true, totalSeconds, totalAmount };
    } catch (error) {
      console.error(`[CHAT-SESSION ${id}] finalize error:`, error);
      await session.abortTransaction();
      endingChats.delete(id);
      return { error: error.message };
    } finally {
      session.endSession();
    }
  };

  const startChatGracePeriod = (transactionId, userId, disconnectReason) => {
    const id = String(transactionId);
    const chat = activeChats.get(id);
    if (!chat || endingChats.has(id)) return;
    if (chat.graceTimers[userId]) return; // already counting down for this user

    logChat(id, `disconnect detected for ${userId}`, { disconnectReason });

    chat.graceTimers[userId] = setTimeout(() => {
      delete chat.graceTimers[userId];
      finalizeChatSession(id, {
        reason: "disconnect_timeout",
        endedBy: userId === chat.userId ? "user_disconnect" : "consultant_disconnect",
      });
    }, CHAT_GRACE_PERIOD_MS);
  };

  const cancelChatGraceForUser = (userId) => {
    const uid = String(userId);
    for (const chat of activeChats.values()) {
      if ((chat.userId === uid || chat.consultantId === uid) && chat.graceTimers[uid]) {
        logChat(chat.transactionId, `${uid} reconnected within grace period — resuming`);
        clearGraceTimer(chat, uid);
      }
    }
  };

  const handleChatUserDisconnect = (userId, disconnectReason) => {
    const uid = String(userId);
    for (const chat of activeChats.values()) {
      if (chat.userId === uid || chat.consultantId === uid) {
        startChatGracePeriod(chat.transactionId, uid, disconnectReason);
      }
    }
  };

  return {
    registerActiveChat,
    removeActiveChat,
    finalizeChatSession,
    handleChatUserDisconnect,
    cancelChatGraceForUser,
    CHAT_GRACE_PERIOD_MS,
  };
};

module.exports = { createChatSessionManager };
