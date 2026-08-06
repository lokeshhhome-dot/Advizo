const { default: mongoose } = require("mongoose");
const { User } = require("../Modal/userSchema");
const { TransactionHistroy } = require("../Modal/transactionHistroy");
const { CallSession } = require("../Modal/callSessions");
const { shopModel } = require("../Modal/shopify");
const { WalletHistory } = require("../Modal/walletHistory");
const { formatTime } = require("../Helper/helper");
const { invalidateConsultantList } = require("../Utils/redis");
const {
  consumeMinutes,
  getCommunicationStatus,
  COMMUNICATION_DISABLED_ERROR,
} = require("./subscriptionMinutes");

const GRACE_PERIOD_MS = 15000;
// If the media-ready handshake from both parties hasn't completed this long
// after accept, force the timer sync anyway. The call IS accepted (transaction
// exists) — the timer and billing must start at any cost; a lost socket emit
// must never leave a live call unbilled and both screens stuck at 00:00.
const TIMER_SYNC_FALLBACK_MS = 7000;
// Statuses from which a call can never resume. Used to guard state
// transitions (idempotent claims) and to replay lost events on reconnect.
const TERMINAL_SESSION_STATUSES = [
  "cancelled",
  "missed",
  "ended",
  "completed",
  "failed",
];
const BILLING_TICK_MS = 10000;
// Max allowed drift between the client-reported (on-screen) duration and the
// server-computed one. Within it, the on-screen value is billed verbatim;
// beyond it the value is treated as tampered/broken and the server wins.
const CLIENT_DURATION_TOLERANCE_SECONDS = 10;
const ORPHAN_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const ORPHAN_STALE_MS = 2 * 60 * 1000;

const buildCallId = (callerId, receiverId, channelName) =>
  `${callerId}_${receiverId}_${channelName}`;

const logCall = (callId, message, extra = {}) => {
  console.log(`[CALL ${callId}] ${message}`, Object.keys(extra).length ? extra : "");
};

const pickValidObjectId = (...values) => {
  for (const value of values) {
    if (value == null || value === "" || value === "undefined" || value === "null") {
      continue;
    }
    const clean = String(value).replace(/^"+|"+$/g, "").trim();
    if (mongoose.Types.ObjectId.isValid(clean)) {
      return clean;
    }
  }
  return null;
};

const toNumber = (value, fallback = 0) => {
  if (value == null) return fallback;
  if (typeof value === "object" && typeof value.toString === "function") {
    return Number(value.toString()) || fallback;
  }
  return Number(value) || fallback;
};

const resolveShopRecord = async (shopIdCandidates, dbSession = null) => {
  const ids = shopIdCandidates
    .map((id) => pickValidObjectId(id))
    .filter(Boolean);

  const uniqueIds = [...new Set(ids)];
  for (const id of uniqueIds) {
    const query = shopModel.findById(id);
    if (dbSession) query.session(dbSession);
    const shop = await query;
    if (shop) {
      return { shop, shopId: String(shop._id) };
    }
  }

  return { shop: null, shopId: uniqueIds[0] || null };
};

const createCallSessionManager = (io) => {
  const onlineUsers = new Map();
  const ringingCalls = new Map();
  const liveCalls = new Map();
  const endingCalls = new Set();

  const getPerSecondCost = (consultant, callType) => {
    const perMinute =
      callType === "voice"
        ? Number(consultant.voicePerMinute)
        : Number(consultant.videoPerMinute);
    return perMinute / 60;
  };

  const clearBillingInterval = (call) => {
    if (call?.billingInterval) {
      clearInterval(call.billingInterval);
      call.billingInterval = null;
    }
  };

  const clearGraceTimer = (call, userId) => {
    const timer = call?.graceTimers?.[userId];
    if (timer) {
      clearTimeout(timer);
      delete call.graceTimers[userId];
    }
  };

  const clearAllGraceTimers = (call) => {
    if (!call?.graceTimers) return;
    for (const userId of Object.keys(call.graceTimers)) {
      clearGraceTimer(call, userId);
    }
  };

  const touchCallActivity = (call) => {
    if (call) {
      call.lastActivityAt = Date.now();
    }
  };

  const removeLiveCall = (callId) => {
    const call = liveCalls.get(callId);
    if (call?.syncFallbackTimer) {
      clearTimeout(call.syncFallbackTimer);
      call.syncFallbackTimer = null;
    }
    liveCalls.delete(callId);
    ringingCalls.delete(callId);
    endingCalls.delete(callId);
  };

  const emitToUser = (userId, event, payload) => {
    if (!userId) return;
    io.to(String(userId)).emit(event, payload);
  };

  // A finishing session may drain the shop's minute pool while chats are
  // still active. Chats have no billing tick, so notify them here — each
  // client then finalizes through the existing autoChatEnded → endChat flow.
  // (Active CALLS are covered by their own billing-tick minutes check.)
  const notifyChatsOnMinutesExhausted = async (shopId) => {
    try {
      if (!shopId) return;
      const { allowed } = await getCommunicationStatus(shopId);
      if (allowed) return;

      const activeChats = await TransactionHistroy.find({
        shop_id: shopId,
        type: "chat",
        status: "active",
      }).lean();

      for (const chat of activeChats) {
        const chatCustomerId = String(chat.senderId);
        const chatConsultantId = String(chat.receiverId);
        const endPayload = {
          transactionId: chat._id,
          reason: "minutes-exhausted",
        };
        emitToUser(chatCustomerId, "autoChatEnded", endPayload);
        emitToUser(chatConsultantId, "autoChatEnded", endPayload);
        emitToUser(chatCustomerId, "CHAT_ENDED_LOW_BALANCE", {
          ...COMMUNICATION_DISABLED_ERROR,
          message:
            "Chat ended because communication minutes have been exhausted.",
        });
        emitToUser(chatConsultantId, "CHAT_ENDED_LOW_BALANCE", {
          ...COMMUNICATION_DISABLED_ERROR,
          message: "Communication minutes exhausted. Chat has ended.",
        });
      }
    } catch (error) {
      console.error(
        "[callSessionManager] notifyChatsOnMinutesExhausted error:",
        error.message,
      );
    }
  };

  const logStateTransition = async (callId, channelName, fromStatus, toStatus, reason) => {
    logCall(callId, `state ${fromStatus} -> ${toStatus}`, { reason, at: new Date().toISOString() });
    try {
      await CallSession.findOneAndUpdate(
        { sessionId: channelName },
        {
          $set: { status: toStatus, updatedAt: new Date() },
          $push: {
            stateLog: {
              from: fromStatus,
              to: toStatus,
              reason,
              at: new Date(),
            },
          },
        },
      );
    } catch (err) {
      console.error(`[CALL ${callId}] Failed to log state transition:`, err.message);
    }
  };

  const endCallSession = async (
    callId,
    {
      reason = "ended",
      endedBy = "system",
      transactionId = null,
      callerId = null,
      receiverId = null,
      channelName = null,
      callType = null,
      shopId = null,
      // Exact seconds the ending party's screen showed (single source of truth).
      clientDurationSeconds = null,
      // When the end actually happened (request arrival / disconnect moment) —
      // billing must not include our own processing latency.
      endedAtMs = null,
    } = {},
  ) => {
    if (endingCalls.has(callId)) {
      logCall(callId, "endCallSession skipped — already ending");
      return { skipped: true, reason: "already_ending" };
    }

    const liveCall = liveCalls.get(callId);
    const resolvedCallerId = callerId || liveCall?.callerId;
    const resolvedReceiverId = receiverId || liveCall?.receiverId;
    const resolvedChannelName = channelName || liveCall?.channelName;
    const resolvedCallType = callType || liveCall?.callType;
    const resolvedShopId = shopId || liveCall?.shopId;
    const resolvedTransactionId = transactionId || liveCall?.transactionId;

    if (!resolvedTransactionId || !resolvedCallerId || !resolvedReceiverId) {
      logCall(callId, "endCallSession aborted — missing identifiers", {
        resolvedTransactionId,
        resolvedCallerId,
        resolvedReceiverId,
      });
      return { skipped: true, reason: "missing_identifiers" };
    }

    endingCalls.add(callId);
    logCall(callId, "endCallSession started", { reason, endedBy });

    if (liveCall) {
      clearBillingInterval(liveCall);
      clearAllGraceTimers(liveCall);
    }

    let session;
    try {
      let trnaID = resolvedTransactionId;
      if (typeof trnaID === "string") {
        trnaID = trnaID.replace(/^"+|"+$/g, "");
      }

      if (!mongoose.Types.ObjectId.isValid(trnaID)) {
        logCall(callId, "Invalid transaction ID", { trnaID });
        removeLiveCall(callId);
        return { skipped: true, reason: "invalid_transaction_id" };
      }

      const existingTransaction = await TransactionHistroy.findById(trnaID);
      if (existingTransaction?.status === "completed") {
        logCall(callId, "Transaction already completed — notifying parties only");
        emitToUser(resolvedCallerId, "callEnded", {
          trnaID,
          reason: "already_completed",
          endedBy,
        });
        emitToUser(resolvedReceiverId, "callEnded", {
          trnaID,
          reason: "already_completed",
          endedBy,
        });
        removeLiveCall(callId);
        return { skipped: true, reason: "already_completed" };
      }

      session = await mongoose.startSession();
      session.startTransaction();

      const transaction = await TransactionHistroy.findById(trnaID).session(session);
      if (!transaction) throw new Error("Transaction not found");

      if (transaction.status === "completed") {
        await session.abortTransaction();
        removeLiveCall(callId);
        return { skipped: true, reason: "already_completed" };
      }

      const effectiveCallType = resolvedCallType || transaction.type;
      if (!effectiveCallType) {
        logCall(callId, "endCallSession aborted — missing callType");
        await session.abortTransaction();
        endingCalls.delete(callId);
        return { skipped: true, reason: "missing_call_type" };
      }

      const caller = await User.findById(resolvedCallerId).session(session);
      if (!caller) throw new Error("Caller not found");

      const receiver = await User.findById(resolvedReceiverId).session(session);
      if (!receiver) throw new Error("Receiver not found");

      const { shop, shopId: effectiveShopId } = await resolveShopRecord(
        [resolvedShopId, transaction.shop_id],
        session,
      );

      if (!shop) {
        logCall(callId, "Shop not found — finalizing without admin commission", {
          resolvedShopId,
          transactionShopId: transaction.shop_id,
        });
      }

      // Bill strictly from the moment BOTH parties connected (the on-screen
      // timer start), so the charged duration always equals what the user saw.
      // Prefer the in-memory synced start; fall back to the persisted
      // connectedAt if the live call was lost (e.g. server restart).
      const syncedStart =
        liveCall?.timerSynced && liveCall?.billingStartTime
          ? new Date(liveCall.billingStartTime)
          : transaction.connectedAt
            ? new Date(transaction.connectedAt)
            : null;

      // End timestamp: the moment the end was initiated (handler entry /
      // disconnect detection), never "now" after our DB round-trips — that
      // latency used to be silently billed to the caller.
      const endedAtCandidate = Number(endedAtMs);
      const endTime =
        Number.isFinite(endedAtCandidate) && endedAtCandidate > 0
          ? new Date(Math.min(endedAtCandidate, Date.now()))
          : new Date();

      // If the call never actually connected, there is nothing to bill.
      let totalSeconds = syncedStart
        ? Math.max(1, Math.floor((endTime - syncedStart) / 1000))
        : 0;

      // The on-screen timer is the single source of truth: if the client
      // reported the seconds its screen showed and they are within tolerance
      // of our own measurement, bill EXACTLY that number. Outside tolerance
      // (tampering, broken clock) the server measurement wins.
      const reportedSeconds = Math.floor(Number(clientDurationSeconds));
      if (
        syncedStart &&
        Number.isFinite(reportedSeconds) &&
        reportedSeconds >= 0 &&
        Math.abs(reportedSeconds - totalSeconds) <=
          CLIENT_DURATION_TOLERANCE_SECONDS
      ) {
        totalSeconds = Math.max(1, reportedSeconds);
        logCall(callId, "Billing from client-reported (on-screen) duration", {
          reportedSeconds,
        });
      }

      const perSecondCost = getPerSecondCost(receiver, effectiveCallType);
      let totalAmount = Number((totalSeconds * perSecondCost).toFixed(2));

      const callerBalance = Number(caller.walletBalance || 0);
      if (totalAmount > callerBalance) {
        totalAmount = Number(callerBalance.toFixed(2));
        logCall(callId, "Capped bill to available balance", {
          calculated: totalSeconds * perSecondCost,
          capped: totalAmount,
        });
      }

      const adminPercentage = shop ? toNumber(shop.adminPersenTage, 0) : 0;
      const adminCommission = shop
        ? (totalAmount * adminPercentage) / 100
        : 0;
      const receiverShare = totalAmount - adminCommission;
      const walletShopId = effectiveShopId || pickValidObjectId(transaction.shop_id);

      transaction.endTime = endTime;
      transaction.duration = totalSeconds;
      transaction.totalAmount = totalAmount;
      transaction.totalSeconds = totalSeconds;
      transaction.status = "completed";
      transaction.type = effectiveCallType;
      transaction.endedBy = endedBy;
      await transaction.save({ session });

      if (totalAmount > 0) {
        // Atomic floor at zero — a wallet can NEVER go negative, even if the
        // same caller is billed by two concurrent calls at once.
        await User.findByIdAndUpdate(
          resolvedCallerId,
          [
            {
              $set: {
                walletBalance: {
                  $max: [0, { $subtract: ["$walletBalance", totalAmount] }],
                },
              },
            },
          ],
          { session },
        );

        await User.findByIdAndUpdate(
          resolvedReceiverId,
          { $inc: { walletBalance: receiverShare } },
          { session },
        );

        if (shop && effectiveShopId) {
          await shopModel.findByIdAndUpdate(
            effectiveShopId,
            { $inc: { adminWalletBalance: adminCommission } },
            { session },
          );
        }

        await TransactionHistroy.findByIdAndUpdate(
          trnaID,
          {
            $inc: {
              adminAmount: adminCommission,
              consultantAmount: receiverShare,
              amount: totalAmount,
            },
          },
          { session },
        );

        if (walletShopId) {
          await WalletHistory.create(
            [
              {
                userId: resolvedCallerId,
                shop_id: walletShopId,
                amount: totalAmount,
                referenceType: effectiveCallType,
                transactionType: "usage",
                direction: "debit",
                description: `Call ended (${reason}) for ${formatTime(totalSeconds)}`,
                status: "success",
              },
              {
                userId: resolvedReceiverId,
                shop_id: walletShopId,
                amount: receiverShare,
                referenceType: effectiveCallType,
                transactionType: "usage",
                direction: "credit",
                description: `Call ended (${reason}) for ${formatTime(totalSeconds)}`,
                status: "success",
              },
            ],
            { session, ordered: true },
          );
        }
      }

      // Deduct communication minutes from the shop's subscription (billed
      // per started minute of the call, voice and video alike).
      await consumeMinutes(effectiveShopId, totalSeconds, session);

      receiver.isBusy = false;
      await receiver.save({ session });

      await User.findByIdAndUpdate(
        resolvedCallerId,
        { $set: { isCallAccepted: false } },
        { session },
      );

      await CallSession.findOneAndUpdate(
        { sessionId: resolvedChannelName },
        {
          $set: {
            status: "ended",
            endTime,
            updatedAt: endTime,
          },
        },
        { session },
      );

      await session.commitTransaction();

      // The call freed the consultant (isBusy -> false), which getConsultant
      // caches. Invalidate only AFTER the commit: doing it before would let a
      // concurrent read refill the cache from pre-commit state and leave the
      // consultant showing as busy indefinitely.
      await invalidateConsultantList(effectiveShopId);

      logCall(callId, "Billing finalized", {
        totalSeconds,
        totalAmount,
        reason,
        endedBy,
      });

      const payload = {
        trnaID,
        totalSeconds,
        totalAmount,
        reason,
        endedBy,
        channelName: resolvedChannelName,
      };

      if (reason === "insufficient-balance") {
        emitToUser(resolvedCallerId, "autoCallEnded-no-balance", {
          transactionId: trnaID,
          reason: "insufficient-balance",
          ...payload,
        });
        emitToUser(resolvedReceiverId, "autoCallEnded-no-balance", {
          transactionId: trnaID,
          reason: "insufficient-balance",
          ...payload,
        });
      }

      if (reason === "minutes-exhausted") {
        // Caller is always the customer; receiver the consultant.
        emitToUser(resolvedCallerId, "CALL_ENDED_LOW_BALANCE", {
          transactionId: trnaID,
          message: "Communication ended.",
          ...payload,
        });
        emitToUser(resolvedReceiverId, "CALL_ENDED_LOW_BALANCE", {
          transactionId: trnaID,
          message: "Communication minutes exhausted. Call ended automatically.",
          ...payload,
        });
      }

      emitToUser(resolvedCallerId, "callEnded", payload);
      emitToUser(resolvedReceiverId, "callEnded", payload);

      removeLiveCall(callId);

      // This session's consumption may have emptied the pool — end any chats
      // still running on it (fire-and-forget; must not delay this response).
      notifyChatsOnMinutesExhausted(effectiveShopId).catch(() => {});

      return { success: true, totalSeconds, totalAmount };
    } catch (error) {
      console.error(`[CALL ${callId}] endCallSession error:`, error);
      if (session) {
        await session.abortTransaction();
      }
      endingCalls.delete(callId);
      return { error: error.message };
    } finally {
      if (session) {
        session.endSession();
      }
    }
  };

  const startBillingInterval = (callId) => {
    const call = liveCalls.get(callId);
    if (!call || call.billingInterval) return;

    call.billingInterval = setInterval(async () => {
      try {
        const current = liveCalls.get(callId);
        if (!current || endingCalls.has(callId)) return;

        touchCallActivity(current);

        const caller = await User.findById(current.callerId).select("walletBalance");
        const receiver = await User.findById(current.receiverId).select(
          "voicePerMinute videoPerMinute",
        );
        if (!caller || !receiver) return;

        const perSecondCost = getPerSecondCost(receiver, current.callType);
        const elapsedSeconds = Math.max(
          0,
          Math.floor((Date.now() - current.billingStartTime) / 1000),
        );
        const projectedCost = Number((elapsedSeconds * perSecondCost).toFixed(2));
        const balance = Number(caller.walletBalance || 0);

        logCall(callId, "Billing tick", {
          elapsedSeconds,
          projectedCost,
          balance,
        });

        if (balance <= 0 || balance < perSecondCost) {
          logCall(callId, "Balance exhausted — auto-ending call");
          clearBillingInterval(current);
          await endCallSession(callId, {
            reason: "insufficient-balance",
            endedBy: "balance_exhausted",
          });
          return;
        }

        // Shop minutes are consumed only at session end, so project THIS
        // call's usage against the pool. Checked once per started minute —
        // finer granularity buys nothing (minutes are billed per started
        // minute) and would just add DB reads.
        const elapsedMinutes = Math.ceil(elapsedSeconds / 60);
        if (elapsedMinutes !== current.minutesCheckedAt) {
          current.minutesCheckedAt = elapsedMinutes;
          const { remainingMinutes } = await getCommunicationStatus(
            current.shopId,
          );
          if (
            remainingMinutes !== null &&
            remainingMinutes - elapsedMinutes <= 0
          ) {
            logCall(callId, "Shop minutes exhausted — auto-ending call", {
              remainingMinutes,
              elapsedMinutes,
            });
            clearBillingInterval(current);
            await endCallSession(callId, {
              reason: "minutes-exhausted",
              endedBy: "minutes_exhausted",
            });
          }
        }
      } catch (err) {
        console.error(`[CALL ${callId}] Billing tick error:`, err);
      }
    }, BILLING_TICK_MS);
  };

  // Tell the OTHER participant that their peer's socket went away (or came
  // back), so their call screen can show "Reconnecting..." instead of a frozen
  // video with no explanation.
  //
  // Notification only: it changes no state, no timer and no call flow, and it is
  // fully guarded — a failure here must never affect the grace period or the
  // end-call path that follows it.
  const notifyPeerNetworkState = (call, userId, online) => {
    try {
      if (!call) return;
      const peerId =
        String(call.callerId) === String(userId) ? call.receiverId : call.callerId;
      emitToUser(peerId, "peer-network-state", {
        userId: String(userId),
        channelName: call.channelName,
        online,
        graceMs: GRACE_PERIOD_MS,
      });
    } catch (err) {
      console.error("[CALL] peer-network-state notify failed:", err.message);
    }
  };

  const startGracePeriod = (callId, userId, disconnectReason) => {
    const call = liveCalls.get(callId);
    if (!call || endingCalls.has(callId)) return;

    if (!call.graceTimers) call.graceTimers = {};

    if (call.graceTimers[userId]) {
      logCall(callId, `Grace period already active for user ${userId}`);
      return;
    }

    logCall(callId, `Disconnect detected for user ${userId}`, {
      disconnectReason,
      graceMs: GRACE_PERIOD_MS,
    });

    // The user's screen (and timer) died at the disconnect, so billing must
    // stop there — the grace window exists only to allow reconnection, and
    // must never be charged.
    const disconnectedAtMs = Date.now();

    notifyPeerNetworkState(call, userId, false);

    call.graceTimers[userId] = setTimeout(async () => {
      logCall(callId, `Grace period expired for user ${userId} — auto-ending`);
      delete call.graceTimers[userId];
      await endCallSession(callId, {
        reason: "disconnect_timeout",
        endedBy: userId === call.callerId ? "user_disconnect" : "consultant_disconnect",
        endedAtMs: disconnectedAtMs,
      });
    }, GRACE_PERIOD_MS);
  };

  const cancelGraceForUser = (userId) => {
    for (const [callId, call] of liveCalls.entries()) {
      if (
        (call.callerId === userId || call.receiverId === userId) &&
        call.graceTimers?.[userId]
      ) {
        logCall(callId, `User ${userId} reconnected within grace period — resuming`);
        clearGraceTimer(call, userId);
        touchCallActivity(call);
        notifyPeerNetworkState(call, userId, true);
      }
    }
  };

  const handleUserDisconnect = (userId, disconnectReason) => {
    for (const [callId, call] of liveCalls.entries()) {
      if (call.callerId === userId || call.receiverId === userId) {
        startGracePeriod(callId, userId, disconnectReason);
      }
    }
  };

  const trySyncCallTimer = (callId) => {
    const call = liveCalls.get(callId);
    if (!call || call.timerSynced) return null;
    if (!call.callerMediaReady || !call.receiverMediaReady) return null;

    call.timerSynced = true;
    if (call.syncFallbackTimer) {
      clearTimeout(call.syncFallbackTimer);
      call.syncFallbackTimer = null;
    }
    const startedAt = Date.now();
    call.billingStartTime = startedAt;

    // Persist the connect time so billing survives a lost in-memory call and
    // always matches the on-screen timer start (never call-accept).
    if (call.transactionId && mongoose.Types.ObjectId.isValid(call.transactionId)) {
      TransactionHistroy.findByIdAndUpdate(call.transactionId, {
        $set: { connectedAt: new Date(startedAt) },
      }).catch((err) =>
        console.error(`[CALL ${callId}] Failed to persist connectedAt:`, err.message),
      );
    }

    // Billing (and balance-exhaustion auto-end) begins now — the exact moment
    // both users' timers start — not at call-accept.
    startBillingInterval(callId);

    const payload = {
      startedAt,
      channelName: call.channelName,
      callType: call.callType,
    };

    emitToUser(call.callerId, "call-timer-sync", payload);
    emitToUser(call.receiverId, "call-timer-sync", payload);
    logCall(callId, "Synced call timer started for both parties", { startedAt });
    return payload;
  };

  const markCallMediaReady = (callId, userId) => {
    const call = liveCalls.get(callId);
    if (!call) return null;

    const uid = String(userId);
    if (uid === call.callerId) call.callerMediaReady = true;
    if (uid === call.receiverId) call.receiverMediaReady = true;

    touchCallActivity(call);
    return trySyncCallTimer(callId);
  };

  const registerLiveCall = ({
    callId,
    callerId,
    receiverId,
    channelName,
    callType,
    shopId,
    transactionId,
    billingStartTime,
  }) => {
    const call = {
      callId,
      callerId: String(callerId),
      receiverId: String(receiverId),
      channelName,
      callType,
      shopId,
      transactionId: String(transactionId),
      // Billing is NOT anchored at accept. It starts (and this becomes set) only
      // when both parties connect and the on-screen timer syncs.
      acceptedAt: billingStartTime || Date.now(),
      billingStartTime: null,
      lastActivityAt: Date.now(),
      graceTimers: {},
      billingInterval: null,
      status: "active",
      callerMediaReady: false,
      receiverMediaReady: false,
      timerSynced: false,
    };

    liveCalls.set(callId, call);
    ringingCalls.delete(callId);

    // AT-ANY-COST timer guarantee: if both media-ready signals haven't
    // arrived shortly after accept, force the sync. The call is accepted and
    // billable — a lost socket emit must never block the timer/billing.
    call.syncFallbackTimer = setTimeout(() => {
      const current = liveCalls.get(callId);
      if (!current || current.timerSynced || endingCalls.has(callId)) return;
      logCall(callId, "Timer sync fallback — forcing sync", {
        callerMediaReady: current.callerMediaReady,
        receiverMediaReady: current.receiverMediaReady,
      });
      current.callerMediaReady = true;
      current.receiverMediaReady = true;
      trySyncCallTimer(callId);
    }, TIMER_SYNC_FALLBACK_MS);

    // Billing interval intentionally NOT started here — it starts on timer sync.
    logCall(callId, "Live call registered (billing starts on connect)", {
      transactionId: call.transactionId,
    });
    return call;
  };

  const handleCallReconnect = (userId, { callerId, receiverId, channelName }) => {
    if (!callerId || !receiverId || !channelName) return false;
    const callId = buildCallId(callerId, receiverId, channelName);
    const call = liveCalls.get(callId);
    if (!call) {
      logCall(callId, `Reconnect attempt but no live call for user ${userId}`);
      return false;
    }
    cancelGraceForUser(String(userId));
    touchCallActivity(call);
    return true;
  };

  const cleanupOrphanedCalls = async () => {
    try {
      const staleBefore = new Date(Date.now() - ORPHAN_STALE_MS);

      // Sessions stuck ringing/pending (server restart wiped the in-memory
      // ring timeout, or the call was never placed) can never connect — a
      // real ring times out after 20s, so anything older than the stale
      // window is dead. Mark missed so reconnecting clients stop waiting.
      await CallSession.updateMany(
        {
          status: { $in: ["pending", "ringing"] },
          updatedAt: { $lt: staleBefore },
        },
        { $set: { status: "missed", endTime: new Date() } },
      );
      const orphanedSessions = await CallSession.find({
        status: { $in: ["ongoing", "active"] },
        updatedAt: { $lt: staleBefore },
      }).lean();

      for (const session of orphanedSessions) {
        try {
          const callId = buildCallId(
            session.callerId,
            session.receiverId,
            session.sessionId,
          );

          if (liveCalls.has(callId) || endingCalls.has(callId)) continue;

          logCall(callId, "Orphan cleanup — closing stale session", {
            sessionId: session.sessionId,
            lastUpdated: session.updatedAt,
          });

          const transactionId = session.transtionId;
          if (!transactionId) {
            await CallSession.findByIdAndUpdate(session._id, {
              $set: { status: "failed", endTime: new Date() },
            });
            continue;
          }

          const txn = await TransactionHistroy.findById(transactionId);
          if (!txn || txn.status === "completed") {
            await CallSession.findByIdAndUpdate(session._id, {
              $set: { status: "ended", endTime: new Date() },
            });
            continue;
          }

          await endCallSession(callId, {
            reason: "orphan_cleanup",
            endedBy: "system_cleanup",
            transactionId,
            callerId: String(session.callerId),
            receiverId: String(session.receiverId),
            channelName: session.sessionId,
            callType: session.callType || txn.type,
            shopId: pickValidObjectId(txn.shop_id, session.shopId),
            // Bill to the last observed activity, not to whenever this
            // cleanup job happened to run (could be minutes later).
            endedAtMs: new Date(
              session.lastActivityAt || session.updatedAt || Date.now(),
            ).getTime(),
          });
        } catch (err) {
          console.error(
            `[CALL] Orphan cleanup failed for session ${session.sessionId}:`,
            err.message,
          );
        }
      }

      const orphanedTransactions = await TransactionHistroy.find({
        status: "active",
        type: { $in: ["voice", "video"] },
        updatedAt: { $lt: staleBefore },
      }).lean();

      for (const txn of orphanedTransactions) {
        try {
          const session = await CallSession.findOne({
            transtionId: String(txn._id),
          }).lean();

          const channelName = session?.sessionId;
          if (!channelName) continue;

          const callId = buildCallId(txn.senderId, txn.receiverId, channelName);
          if (liveCalls.has(callId) || endingCalls.has(callId)) continue;

          logCall(callId, "Orphan cleanup — closing stale transaction", {
            transactionId: String(txn._id),
          });

          await endCallSession(callId, {
            reason: "orphan_cleanup",
            endedBy: "system_cleanup",
            transactionId: String(txn._id),
            callerId: String(txn.senderId),
            receiverId: String(txn.receiverId),
            channelName,
            callType: txn.type,
            shopId: pickValidObjectId(txn.shop_id, session?.shopId),
            endedAtMs: new Date(
              txn.lastActivityAt || txn.updatedAt || Date.now(),
            ).getTime(),
          });
        } catch (err) {
          console.error(
            `[CALL] Orphan cleanup failed for transaction ${txn._id}:`,
            err.message,
          );
        }
      }
    } catch (err) {
      console.error("[CALL] Orphan cleanup error:", err);
    }
  };

  const resolveActiveCallFromChannel = async (channelName, hints = {}) => {
    if (!channelName) return null;

    let session = await CallSession.findOne({
      sessionId: channelName,
      status: { $in: ["active", "ongoing"] },
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (!session) {
      session = await CallSession.findOne({ sessionId: channelName })
        .sort({ createdAt: -1 })
        .lean();
    }

    const callerId = String(hints.callerId || session?.callerId || "");
    const receiverId = String(hints.receiverId || session?.receiverId || "");

    let trnaID =
      hints.transactionId || session?.transtionId || hints.transtionId;
    if (typeof trnaID === "string") {
      trnaID = trnaID.replace(/^"+|"+$/g, "");
    }

    let transaction = null;
    if (trnaID && mongoose.Types.ObjectId.isValid(trnaID)) {
      transaction = await TransactionHistroy.findById(trnaID);
    }

    if ((!transaction || transaction.status === "completed") && callerId && receiverId) {
      transaction = await TransactionHistroy.findOne({
        senderId: callerId,
        receiverId,
        status: "active",
        type: { $in: ["voice", "video"] },
      }).sort({ createdAt: -1 });
      trnaID = transaction?._id ? String(transaction._id) : trnaID;
    }

    if (!callerId || !receiverId || !trnaID || !transaction) {
      return null;
    }

    if (transaction.status === "completed") {
      return {
        callId: buildCallId(callerId, receiverId, channelName),
        callerId,
        receiverId,
        channelName,
        callType: hints.callType || session?.callType || transaction.type,
        shopId: pickValidObjectId(
          hints.shopId,
          session?.shopId,
          transaction.shop_id,
        ),
        transactionId: String(trnaID),
        session,
        transaction,
        alreadyCompleted: true,
      };
    }

    return {
      callId: buildCallId(callerId, receiverId, channelName),
      callerId,
      receiverId,
      channelName,
      callType: hints.callType || session?.callType || transaction.type,
      shopId: pickValidObjectId(
        hints.shopId,
        session?.shopId,
        transaction.shop_id,
      ),
      transactionId: String(trnaID),
      session,
      transaction,
    };
  };

  // A client that was loading/offline when the realtime event fired missed it
  // for good — Socket.IO does not queue. The DB status is authoritative, so on
  // every register/reconnect with a channelName we replay the terminal state
  // (using the SAME event names the live path emits) directly to that socket.
  const replayTerminalStateToSocket = async (socket, uid, channelName) => {
    try {
      const latest = await CallSession.findOne({ sessionId: channelName })
        .sort({ updatedAt: -1 })
        .lean();
      if (!latest) return false;

      const status = String(latest.status || "").toLowerCase();
      if (!TERMINAL_SESSION_STATUSES.includes(status)) return false;

      const isParticipant =
        String(latest.callerId) === String(uid) ||
        String(latest.receiverId) === String(uid);
      if (!isParticipant) return false;

      const callId = buildCallId(latest.callerId, latest.receiverId, channelName);
      const payload = {
        callId,
        callerId: String(latest.callerId),
        receiverId: String(latest.receiverId),
        channelName,
        callType: latest.callType,
        status,
        recovered: true,
      };

      if (status === "cancelled") {
        socket.emit("call-ended-rejected", payload);
      } else if (status === "missed") {
        socket.emit("call-missed", payload);
      } else {
        socket.emit("callEnded", { ...payload, reason: status });
      }

      logCall(callId, "Replayed terminal call state to reconnecting socket", {
        uid: String(uid),
        status,
      });
      return true;
    } catch (err) {
      console.error(
        "[callSessionManager] replayTerminalStateToSocket error:",
        err.message,
      );
      return false;
    }
  };

  const syncActiveCallToSocket = async (socket, uid, channelName, hints = {}) => {
    const resolved = await resolveActiveCallFromChannel(channelName, {
      ...hints,
      callerId: hints.callerId,
      receiverId: hints.receiverId,
    });

    if (!resolved || resolved.alreadyCompleted) {
      // No live call to sync — if the session already reached a terminal
      // state, deliver the event this client missed instead of leaving it
      // waiting forever.
      await replayTerminalStateToSocket(socket, uid, channelName);
      return resolved;
    }

    const liveCall = liveCalls.get(resolved.callId);
    const billingStartTime =
      liveCall?.billingStartTime ||
      resolved.transaction?.startTime ||
      Date.now();

    socket.emit("call-accepted-started", {
      callerId: resolved.callerId,
      receiverId: resolved.receiverId,
      channelName: resolved.channelName,
      callType: resolved.callType,
      transactionId: resolved.transactionId,
      shopId: resolved.shopId,
      startedAt: new Date(billingStartTime).getTime(),
    });

    if (liveCall?.timerSynced) {
      socket.emit("call-timer-sync", {
        startedAt: liveCall.billingStartTime,
        channelName: resolved.channelName,
        callType: resolved.callType,
      });
    }

    logCall(resolved.callId, "Synced active call state to socket", { uid });
    return resolved;
  };

  const startOrphanCleanupJob = () => {
    cleanupOrphanedCalls();
    return setInterval(cleanupOrphanedCalls, ORPHAN_CLEANUP_INTERVAL_MS);
  };

  return {
    onlineUsers,
    ringingCalls,
    liveCalls,
    buildCallId,
    endCallSession,
    registerLiveCall,
    handleUserDisconnect,
    handleCallReconnect,
    cancelGraceForUser,
    touchCallActivity,
    logStateTransition,
    markCallMediaReady,
    trySyncCallTimer,
    resolveActiveCallFromChannel,
    syncActiveCallToSocket,
    replayTerminalStateToSocket,
    startOrphanCleanupJob,
    cleanupOrphanedCalls,
    notifyChatsOnMinutesExhausted,
    GRACE_PERIOD_MS,
  };
};

module.exports = {
  createCallSessionManager,
  buildCallId,
  pickValidObjectId,
  TERMINAL_SESSION_STATUSES,
};
