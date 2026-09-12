const { Server } = require("socket.io");
const { User } = require("./Modal/userSchema");
const { default: mongoose } = require("mongoose");
const { ChatList } = require("./Modal/chatListSchema");
const { MessageModal } = require("./Modal/messageSchema");
const sendFCM = require("./firebase/sendNotification");
const { TransactionHistroy } = require("./Modal/transactionHistroy");
const { shopModel } = require("./Modal/shopify");
const { missCalled } = require("./Modal/miscallasHistroy");
const { CallSession } = require("./Modal/callSessions");
const { sendCallFCM } = require("./firebase/callPushNotification");
const { ConsultantClient } = require("./Modal/consultantClient");
const { createCallSessionManager, buildCallId, pickValidObjectId } = require("./services/callSessionManager");
const { createChatSessionManager } = require("./services/chatSessionManager");
const {
  getCommunicationStatus,
  COMMUNICATION_DISABLED_ERROR,
} = require("./services/subscriptionMinutes");
const { invalidateConsultantList } = require("./Utils/redis");
const { startChatAttachmentCleanupJob } = require("./services/chatAttachmentCleanup");
const { createSocketAuthMiddleware } = require("./Socket-Io-MiddleWare/socketAuth");
const {
  getAuthUserId,
  isValidObjectId,
  isValidChannelName,
  isValidCallType,
  assertCallParticipant,
  assertCallInitiator,
  assertCallReceiver,
  assertChatMessage,
  assertChatPair,
  assertConsultantOnly,
  assertTransactionParticipant,
  rejectSocketAction,
  resolveShopFromDomain,
  registerSocketPresence,
  unregisterSocketPresence,
} = require("./Socket-Io-MiddleWare/socketSecurity");
const chalk = require("chalk");

// Real-time ring window: if the receiver neither accepts nor rejects within
// this time, the call is auto-cut on both sides (status -> missed).
const RING_TIMEOUT_MS = 15000;

let callManagerInstance = null;
let chatManagerInstance = null;

function getCallManager() {
  return callManagerInstance;
}

function getChatManager() {
  return chatManagerInstance;
}

const ioServer = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["*"],
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  const callManager = createCallSessionManager(io);
  callManagerInstance = callManager;
  const {
    onlineUsers,
    ringingCalls,
    buildCallId,
    endCallSession,
    registerLiveCall,
    handleUserDisconnect,
    handleCallReconnect,
    touchCallActivity,
    logStateTransition,
    startOrphanCleanupJob,
    markCallMediaReady,
    trySyncCallTimer,
    resolveActiveCallFromChannel,
    syncActiveCallToSocket,
    notifyChatsOnMinutesExhausted,
  } = callManager;

  const chatManager = createChatSessionManager(io, notifyChatsOnMinutesExhausted);
  chatManagerInstance = chatManager;
  const { registerActiveChat, finalizeChatSession, handleChatUserDisconnect, cancelChatGraceForUser } =
    chatManager;

  startOrphanCleanupJob();
  startChatAttachmentCleanupJob();
  io.use(createSocketAuthMiddleware());

  io.on("connection", async (socket) => {
    console.log("Socket connected:", socket.id, "user:", socket.data?.userId);

    await registerSocketPresence(io, socket, onlineUsers);
    callManager.cancelGraceForUser(getAuthUserId(socket));
    cancelChatGraceForUser(getAuthUserId(socket));

    socket.on("register", async (payload) => {
      try {
        const uid = getAuthUserId(socket);
        if (!uid) return;

        await registerSocketPresence(io, socket, onlineUsers);
        console.log("Online User IDs:", Array.from(onlineUsers.keys()));
        if (typeof payload === "object" && payload?.channelName && isValidChannelName(payload.channelName)) {
          // Only a genuine participant may reconnect to / read a call's session.
          // (Was leaking another call's transactionId/shopId and keeping foreign
          // calls alive.)
          const authId = String(uid);
          if (
            authId !== String(payload.callerId) &&
            authId !== String(payload.receiverId)
          ) {
            return;
          }
          handleCallReconnect(uid, {
            callerId: payload.callerId,
            receiverId: payload.receiverId,
            channelName: payload.channelName,
          });
          await syncActiveCallToSocket(socket, uid, payload.channelName, {
            callerId: payload.callerId,
            receiverId: payload.receiverId,
            shopId: socket.data.shopId,
          });
        }
      } catch (error) {
        console.error("[socket] register error:", error.message);
      }
    });

    socket.on("call-reconnect", async ({ callerId, receiverId, channelName }) => {
      try {
        const uid = getAuthUserId(socket);
        if (!uid || !isValidChannelName(channelName)) return;

        if (
          !(await assertCallParticipant(socket, {
            callerId,
            receiverId,
            event: "call-reconnect",
          }))
        ) {
          return;
        }

        const resumed = handleCallReconnect(uid, { callerId, receiverId, channelName });
        if (resumed) {
          console.log(`[CALL] Reconnect resumed for user ${uid}`, channelName);
        }
      } catch (error) {
        console.error("[socket] call-reconnect error:", error.message);
      }
    });

    socket.on(
      "call-leaving",
      async ({ callerId, receiverId, channelName }) => {
        try {
          const uid = getAuthUserId(socket);
          if (!uid || !isValidChannelName(channelName)) return;

          if (
            !(await assertCallParticipant(socket, {
              callerId,
              receiverId,
              event: "call-leaving",
            }))
          ) {
            return;
          }

          const callId = buildCallId(callerId, receiverId, channelName);
          console.log(`[CALL ${callId}] call-leaving signal from user ${uid}`);
          handleUserDisconnect(uid, "client_leaving");
        } catch (error) {
          console.error("[socket] call-leaving error:", error.message);
        }
      },
    );

    // ------------- call user --------------//

    socket.on(
      "call-user",
      async ({ callerId, receiverId, channelName, callType, shop }, ack) => {
        // Ack so the caller knows the ring reached the server and stops
        // retrying. Old clients pass no ack — respond() is then a no-op.
        const respond = (payload) => {
          if (typeof ack === "function") ack(payload);
        };
        try {
          if (!isValidChannelName(channelName) || !isValidCallType(callType)) {
            respond({ ok: false, reason: "invalid_payload" });
            return;
          }

          if (
            !(await assertCallInitiator(socket, {
              callerId,
              receiverId,
              event: "call-user",
            }))
          ) {
            respond({ ok: false, reason: "forbidden" });
            return;
          }

          const authCallerId = getAuthUserId(socket);

          // Retry-safe: a duplicate ring for an already-ringing call only
          // re-delivers the incoming-call notification — it must NOT create a
          // second timeout / missed-call record / session update.
          const dupCallId = buildCallId(authCallerId, receiverId, channelName);
          const existingRing = ringingCalls.get(dupCallId);
          if (existingRing && existingRing.status === "ringing") {
            const callerName_ = await User.findById(authCallerId).select("fullname");
            io.to(String(receiverId)).emit("incoming-call", {
              callerId: authCallerId,
              callerName: callerName_?.fullname || "Unknown",
              callType,
              channelName,
              shop,
            });
            respond({ ok: true, duplicate: true });
            return;
          }

          const callerInfo = await User.findById(authCallerId);
          if (!callerInfo) throw new Error("Caller not found");
          if (callerInfo.userType === "customer") {
            const receiverInfo = await User.findById({ _id: receiverId })
              .select("voicePerMinute videoPerMinute")
              .lean();
            if (!receiverInfo) throw new Error("Receiver not found");
            const callCost =
              callType === "voice"
                ? Number(receiverInfo.voicePerMinute)
                : Number(receiverInfo.videoPerMinute);
            if (Number(callerInfo.walletBalance) < callCost) {
              io.to(authCallerId).emit("balanceError", {
                message: "Insufficient wallet balance",
                required: callCost,
                available: callerInfo.walletBalance,
              });
              respond({ ok: false, reason: "insufficient_balance" });
              return;
            }
          }

          // Shop communication minutes are the single source of truth — block
          // BEFORE the consultant is notified (no incoming-call, no FCM).
          const commStatus = await getCommunicationStatus(socket.data.shopId);
          if (!commStatus.allowed) {
            io.to(authCallerId).emit("COMMUNICATION_DISABLED", {
              ...COMMUNICATION_DISABLED_ERROR,
            });
            respond({ ok: false, reason: "communication_disabled" });
            return;
          }

          const callId = buildCallId(authCallerId, receiverId, channelName);
          const user_ = await User.findById(authCallerId).select(
            "fullname walletBalance",
          );
          // ROOM emit: the ring must reach EVERY connected socket of the
          // receiver (dashboard + any other window). onlineUsers holds only
          // the newest socket id, which after multi-socket support may not be
          // the dashboard — targeting it alone silently dropped the ring.
          const receiverRoom = io.sockets.adapter.rooms.get(String(receiverId));
          const receiverOnline = Boolean(receiverRoom && receiverRoom.size > 0);
          console.log("receiverOnline", receiverOnline)
          if (receiverOnline) {
            console.log("incoming-call",)
            io.to(String(receiverId)).emit("incoming-call", {
              callerId: authCallerId,
              callerName: user_?.fullname || "Unknown",
              callType,
              channelName,
              shop,
            });
          }
          const consultant = await User.findById(receiverId);
          const shopRecord =
            (await resolveShopFromDomain(shop)) ||
            (socket.data.shopId
              ? await shopModel.findById(socket.data.shopId).select("_id shop")
              : null);
          if (!shopRecord) {
            respond({ ok: false, reason: "shop_not_found" });
            return;
          }
          if (!receiverOnline && consultant.firebaseToken?.token) {
            await sendCallFCM({
              token: consultant.firebaseToken.token,
              callerId: authCallerId,
              callerName: callerInfo.fullname,
              channelName,
              callType,
              receiverId,
              shop,
              shopId: shopRecord._id.toString(),
              avatar: callerInfo.profileImage,
            });

          }

          const call = {
            callId,
            callerId: authCallerId,
            receiverId,
            channelName,
            callType,
            status: "ringing",
            startedAt: Date.now(),
            timeout: null,
          };

          ringingCalls.set(callId, call);

          // DB is authoritative for call state — record the ring so late
          // joiners / reconnects can recover it even if this process dies.
          await CallSession.findOneAndUpdate(
            { sessionId: channelName, callerId: authCallerId, receiverId },
            { $set: { status: "ringing", lastActivityAt: new Date() } },
          ).catch((err) =>
            console.error("[call-user] failed to persist ringing:", err.message),
          );

          call.timeout = setTimeout(async () => {
            const activeCall = ringingCalls.get(callId);
            if (!activeCall) {
              return;
            }

            if (activeCall.status === "ringing") {
              activeCall.status = "missed";

              // Claim the transition in the DB first — only a session still in
              // a ring state can become missed. If another path (reject/accept)
              // already claimed it, this is a no-op and we just clean up.
              const claimed = await CallSession.findOneAndUpdate(
                {
                  sessionId: channelName,
                  callerId: authCallerId,
                  receiverId,
                  status: { $in: ["pending", "ringing"] },
                },
                { $set: { status: "missed", endTime: new Date() } },
              );

              ringingCalls.delete(callId);
              if (!claimed) return;

              // Room emits — reach every connected socket of each party.
              io.to(String(authCallerId)).emit("call-missed", { callId });
              io.to(String(receiverId)).emit("call-missed", { callId });

              await missCalled.create({
                senderId: authCallerId,
                receiverId,
                type: callType,
                reason: "timeout",
                shop_id: shopRecord?._id || socket.data.shopId || null,
              });

              io.to(String(receiverId)).emit("consultantNotification", {
                type: "missed_call",
                userId: authCallerId,
                shopId: shopRecord?._id || socket.data.shopId || null,
                callType,
                reason: "timeout",
                senderName: user_?.fullname || "User",
              });
            }
          }, RING_TIMEOUT_MS);

          respond({ ok: true, ringing: receiverOnline });
        } catch (error) {
          console.error("❌ Error in call-user:", error);
          respond({ ok: false, reason: "server_error" });
        }
      },
    );

    //---------------- reject call logics ----------------

    socket.on(
      "reject-call",
      async ({ callerId, receiverId, channelName, callType }) => {
        try {
          if (!isValidChannelName(channelName) || !isValidCallType(callType)) return;

          if (
            !(await assertCallReceiver(socket, {
              callerId,
              receiverId,
              event: "reject-call",
            }))
          ) {
            return;
          }

       

          const callId = buildCallId(callerId, receiverId, channelName);
          const call = ringingCalls.get(callId);

          // DB is authoritative: claim the reject by flipping a still-ringing
          // session to cancelled. This works even if the in-memory ring entry
          // is gone (server restart, or reject raced ahead of call-user), and
          // the guarded match makes duplicate rejects no-ops.
          const claimed = await CallSession.findOneAndUpdate(
            {
              sessionId: channelName,
              callerId,
              receiverId,
              status: { $in: ["pending", "ringing"] },
            },
            { $set: { status: "cancelled", endTime: new Date() } },
          );

          if (call) {
            call.status = "rejected";
            clearTimeout(call.timeout);
            ringingCalls.delete(callId);
          }

          if (!call && !claimed) return;

          const payload = { callerId, receiverId, channelName, callType };
          // Room emits — reach every connected socket of each party.
          io.to(String(callerId)).emit("call-ended-rejected", payload);
          io.to(String(receiverId)).emit("call-ended-rejected", payload);
          await missCalled.create({
            senderId: callerId,
            receiverId,
            type: callType,
            reason: "rejected",
            shop_id: socket.data.shopId || null,
          });

          io.to(String(receiverId)).emit("consultantNotification", {
            type: "missed_call",
            userId: callerId,
            shopId: socket.data.shopId || null,
            callType,
            reason: "rejected",
          });

        } catch (error) {
          console.error("[socket] reject-call error:", error.message);
        }
      },
    );

    //---------------- accept call logics ----------------

    socket.on(
      "call-accepted",
      async ({ callerId, receiverId, channelName, callType, shopId }) => {
        try {
          if (!isValidChannelName(channelName) || !isValidCallType(callType)) {
            return;
          }

          if (
            !(await assertCallReceiver(socket, {
              callerId,
              receiverId,
              event: "call-accepted",
            }))
          ) {
            return;
          }

          const resolvedShopId = isValidObjectId(shopId)
            ? String(shopId)
            : socket.data.shopId;

          if (!resolvedShopId || String(socket.data.shopId) !== String(resolvedShopId)) {
            return;
          }

          const callId = buildCallId(callerId, receiverId, channelName);
          const call = ringingCalls.get(callId);

          if (!call) {
            return;
          }

          // Re-check minutes at accept — they may have been exhausted by a
          // session that ended while this call was ringing. Blocks before any
          // billing state is created; both parties tear down via the existing
          // call-ended-rejected handling.
          const commStatus = await getCommunicationStatus(resolvedShopId);
          if (!commStatus.allowed) {
            call.status = "rejected";
            clearTimeout(call.timeout);
            ringingCalls.delete(callId);

            const rejectedPayload = { callerId, receiverId, channelName, callType };
            // Room emits — reach every connected socket of each party.
            io.to(String(callerId)).emit("COMMUNICATION_DISABLED", {
              ...COMMUNICATION_DISABLED_ERROR,
            });
            io.to(String(callerId)).emit("call-ended-rejected", rejectedPayload);
            io.to(String(receiverId)).emit("COMMUNICATION_DISABLED", {
              ...COMMUNICATION_DISABLED_ERROR,
            });
            io.to(String(receiverId)).emit("call-ended-rejected", rejectedPayload);

            await CallSession.findOneAndUpdate(
              { sessionId: channelName, callerId, receiverId },
              { $set: { status: "cancelled", endTime: new Date() } },
            );
            return;
          }

          call.status = "accepted";
          clearTimeout(call.timeout);

          const billingStartTime = Date.now();
          const transaction = await TransactionHistroy.create({
            senderId: callerId,
            receiverId: receiverId,
            shop_id: resolvedShopId,
            startTime: new Date(billingStartTime),
            status: "active",
            type: callType,
            duration: 0,
            lastActivityAt: new Date(),
          });
          await transaction.save();

          const existingSession = await CallSession.findOne({
            sessionId: channelName,
            callerId: callerId,
            receiverId: receiverId,
          });

          if (existingSession) {
            await logStateTransition(
              callId,
              channelName,
              existingSession.status,
              "active",
              "call_accepted",
            );
            await CallSession.findOneAndUpdate(
              {
                sessionId: channelName,
                callerId: callerId,
                receiverId: receiverId,
              },
              {
                $set: {
                  transtionId: transaction._id,
                  callType: callType,
                  shopId: resolvedShopId,
                  status: "active",
                  startTime: new Date(billingStartTime),
                  lastActivityAt: new Date(),
                },
              },
              { new: true },
            );
          } else {
            await CallSession.create({
              sessionId: channelName,
              callerId: callerId,
              receiverId: receiverId,
              transtionId: transaction._id,
              callType: callType,
              shopId: resolvedShopId,
              status: "active",
              startTime: new Date(billingStartTime),
              lastActivityAt: new Date(),
              stateLog: [
                {
                  from: "pending",
                  to: "active",
                  reason: "call_accepted",
                  at: new Date(),
                },
              ],
            });
          }

          registerLiveCall({
            callId,
            callerId,
            receiverId,
            channelName,
            callType,
            shopId: resolvedShopId,
            transactionId: transaction._id,
            billingStartTime,
          });

          const startedPayload = {
            callerId,
            receiverId,
            channelName,
            callType,
            transactionId: transaction._id,
            shopId: resolvedShopId,
            startedAt: billingStartTime,
          };

          // Room emits — reach every connected socket of each party
          // (dashboard AND the call window, whichever order they registered).
          io.to(String(callerId)).emit("call-accepted-started", startedPayload);
          io.to(String(receiverId)).emit("call-accepted-started", startedPayload);

          const user = await User.findById(callerId);
          if (!user) return console.log("Caller not found");

          const consultant = await User.findById(receiverId);
          if (!consultant) return console.log("Consultant not found");
          consultant.isBusy = true;
          await consultant.save();
          // isBusy is part of the cached consultant list.
          await invalidateConsultantList(resolvedShopId);

          const existingUser = await ConsultantClient.findOne({
            userId: user._id,
            consultantId: consultant._id,
            shop_id: resolvedShopId,
          });
          if (!existingUser) {
            await ConsultantClient.create({
              userId: user._id,
              consultantId: consultant._id,
              shop_id: resolvedShopId,
            });
          }
        } catch (error) {
          console.error("Error in call-accepted:", error);
        }
      },
    );

    socket.on(
      "user-is-on",
      async ({ callerId, receiverId, channelName, callType }) => {
        try {
          if (!isValidChannelName(channelName) || !isValidCallType(callType)) return;

          if (
            !(await assertCallParticipant(socket, {
              callerId,
              receiverId,
              event: "user-is-on",
            }))
          ) {
            return;
          }

          const callId = buildCallId(callerId, receiverId, channelName);
          const liveCall = callManager.liveCalls.get(callId);
          if (liveCall) {
            touchCallActivity(liveCall);
            // A party announcing presence on the call page counts as
            // media-ready. This is a redundant path to call-media-connected —
            // if that emit is ever lost, the synced timer (and billing) must
            // still start once both parties are on the page.
            markCallMediaReady(callId, getAuthUserId(socket));
          }

          // Room emits — reach every connected socket of each party.
          io.to(String(callerId)).emit("both-user-join", {
            channelName,
            callType,
          });
          io.to(String(receiverId)).emit("both-user-join", {
            channelName,
            callType,
          });
        } catch (error) {
          console.error("[socket] user-is-on error:", error.message);
        }
      },
    );

    socket.on(
      "call-media-connected",
      async ({ callerId, receiverId, channelName }) => {
        try {
          if (!isValidChannelName(channelName)) return;

          if (
            !(await assertCallParticipant(socket, {
              callerId,
              receiverId,
              event: "call-media-connected",
            }))
          ) {
            return;
          }

          const callId = buildCallId(callerId, receiverId, channelName);
          const uid = getAuthUserId(socket);
          markCallMediaReady(callId, uid);
        } catch (error) {
          console.error("[socket] call-media-connected error:", error.message);
        }
      },
    );

    socket.on(
      "user-connected-time-updated",
      async ({ callerId, receiverId, channelName, transactionId }) => {
        try {
          if (!transactionId || !isValidChannelName(channelName)) return;

          if (
            !(await assertCallParticipant(socket, {
              callerId,
              receiverId,
              event: "user-connected-time-updated",
            }))
          ) {
            return;
          }

          const cleanTransactionId = String(transactionId).replace(/"/g, "");

          if (!mongoose.Types.ObjectId.isValid(cleanTransactionId)) {
            return;
          }

          const transaction = await TransactionHistroy.findById(cleanTransactionId).select(
            "senderId receiverId",
          );
          if (
            !transaction ||
            (String(transaction.senderId) !== getAuthUserId(socket) &&
              String(transaction.receiverId) !== getAuthUserId(socket))
          ) {
            return;
          }

          const callId = buildCallId(callerId, receiverId, channelName);
          const liveCall = callManager.liveCalls.get(callId);
          if (liveCall) {
            touchCallActivity(liveCall);
            // Redundant media-ready path (see user-is-on): this event is sent
            // by each call page right after call-accepted-started, so the
            // synced timer can never be blocked by one lost emit.
            markCallMediaReady(callId, getAuthUserId(socket));
          }

          await TransactionHistroy.findByIdAndUpdate(cleanTransactionId, {
            lastActivityAt: new Date(),
          });

          await CallSession.findOneAndUpdate(
            { sessionId: channelName, callerId, receiverId },
            { lastActivityAt: new Date() },
          );
        } catch (error) {
          console.error("[socket] user-connected-time-updated error:", error.message);
        }
      },
    );

    socket.on("call-ended", async (data, ack) => {
      // Stamp arrival BEFORE any DB work — resolution/authorization latency
      // must never be billed to the caller.
      const receivedAtMs = Date.now();
      const {
        transactionId,
        callerId,
        receiverId,
        shopId,
        callType,
        channelName,
        clientDurationSeconds = null,
        endby = "user_cut_call",
      } = data;

      const respond = (payload) => {
        if (typeof ack === "function") ack(payload);
      };

      try {
        if (!channelName || !isValidChannelName(channelName)) {
          respond({ success: false, reason: "missing_channel" });
          return;
        }

        const resolved = await resolveActiveCallFromChannel(channelName, {
          transactionId,
          callerId,
          receiverId,
          shopId,
          callType,
        });

        if (!resolved) {
          respond({ success: false, reason: "call_not_found" });
          return;
        }

        if (
          !(await assertCallParticipant(socket, {
            callerId: resolved.callerId,
            receiverId: resolved.receiverId,
            event: "call-ended",
          }))
        ) {
          respond({ success: false, reason: "forbidden" });
          return;
        }

        if (resolved.alreadyCompleted) {
          respond({ success: true, skipped: true, reason: "already_completed" });
          return;
        }

        const endedBy =
          endby === "consultant_cut_call"
            ? "consultant_cut_call"
            : "user_cut_call";

        const result = await endCallSession(resolved.callId, {
          reason: "manual_end",
          endedBy,
          transactionId: resolved.transactionId,
          callerId: resolved.callerId,
          receiverId: resolved.receiverId,
          channelName: resolved.channelName,
          callType: resolved.callType,
          shopId: resolved.shopId,
          clientDurationSeconds,
          endedAtMs: receivedAtMs,
        });

        if (result?.skipped && result?.reason === "already_ending") {
          await new Promise((r) => setTimeout(r, 500));
        }

        respond({
          success: Boolean(
            result?.success ||
            result?.skipped ||
            result?.reason === "already_completed",
          ),
          ...result,
        });
      } catch (error) {
        console.error("❌ call-ended handler error:", error);
        respond({ success: false, error: error.message });
      }
    });

    socket.on("typing", async (data) => {
      try {
        const { receiverId, shop_id, isTyping } = data || {};
        const senderId = getAuthUserId(socket);

        if (!senderId) return;

        if (!isValidObjectId(receiverId) || !isValidObjectId(shop_id)) {
          return;
        }

        if (String(socket.data.shopId) !== String(shop_id)) {
          return;
        }

        io.to(String(receiverId)).emit("userTyping", {
          senderId,
          receiverId,
          shop_id,
          isTyping: Boolean(isTyping),
        });
      } catch (error) {
        console.error("[socket] typing error:", error.message);
      }
    });

    socket.on("sendMessage", async (data) => {
      const { receiverId, shop_id, text, timestamp, attachment, tempId } = data || {};
      const senderId = getAuthUserId(socket);
      // TEMPORARY (debugging silent customer-send failures) — confirms the
      // emit actually reached the server at all, and with what identity.
      console.log("[CHAT DEBUG] sendMessage received:", {
        senderId,
        receiverId,
        shop_id,
        socketShopId: socket?.data?.shopId,
        hasText: Boolean(text),
        hasAttachment: Boolean(attachment),
      });

      try {
        if (
          !(await assertChatMessage(socket, {
            receiverId,
            shop_id,
            text,
            attachment,
            event: "sendMessage",
          }))
        ) {
          return;
        }

        // The client got storageKey from its own upload-attachment response,
        // but a tampered client could try to attach someone else's uploaded
        // object — the key is scoped to shop+uploader at upload time, so
        // verify it matches THIS sender before trusting it (IDOR guard).
        if (attachment && !String(attachment.storageKey).startsWith(`chat/${shop_id}/${senderId}/`)) {
          return rejectSocketAction(socket, "sendMessage", "forbidden");
        }

        // Attachment-only messages have no text — everywhere below that used
        // `text` for a human-readable preview (inbox row, notification, push)
        // uses this instead.
        const previewText = attachment
          ? (attachment.type === "image" ? "📷 Photo" : "📄 PDF")
          : text;

        // Sender and receiver are independent reads, and between them they cover
        // every field this handler needs — including the ones that used to be
        // re-fetched further down (senderInfo, and the receiver's FCM details).
        const [sender, receiver] = await Promise.all([
          User.findById(senderId)
            .select("userType walletBalance fullname profileImage")
            .lean(),
          User.findById(receiverId)
            .select("userType chatCost firebaseToken isActive")
            .lean(),
        ]);
        if (!sender) throw new Error("Sender not found");

        /**
         * if sender is customer then deduct the amount from sender's
         *  wallet and add the amount to receiver's wallet and add the admin commission to the shop's wallet
         *  and create a transaction record in the database
         */

        // Shop minutes gate every message (first message creates the chat, so
        // this also stops new chat requests from ever reaching the consultant).
        const commStatus = await getCommunicationStatus(shop_id);
        if (!commStatus.allowed) {
          io.to(String(senderId)).emit("COMMUNICATION_DISABLED", {
            ...COMMUNICATION_DISABLED_ERROR,
          });

          // If a billed chat is currently active between this pair, the pool
          // drained mid-session — end it through the existing autoChatEnded
          // flow (client emits endChat → server finalizes billing + Activity-history).
          const activeChat = await TransactionHistroy.findOne({
            type: "chat",
            status: "active",
            shop_id,
            $or: [
              { senderId, receiverId },
              { senderId: receiverId, receiverId: senderId },
            ],
          }).lean();
          if (activeChat) {
            const chatCustomerId = String(activeChat.senderId);
            const chatConsultantId = String(activeChat.receiverId);
            const endPayload = {
              transactionId: activeChat._id,
              reason: "minutes-exhausted",
            };
            io.to(chatCustomerId).emit("autoChatEnded", endPayload);
            io.to(chatConsultantId).emit("autoChatEnded", endPayload);
            io.to(chatCustomerId).emit("CHAT_ENDED_LOW_BALANCE", {
              ...COMMUNICATION_DISABLED_ERROR,
              message:
                "Chat ended because communication minutes have been exhausted.",
            });
            io.to(chatConsultantId).emit("CHAT_ENDED_LOW_BALANCE", {
              ...COMMUNICATION_DISABLED_ERROR,
              message: "Communication minutes exhausted. Chat has ended.",
            });
          }
          return;
        }

        if (sender.userType === "customer") {
          if (!receiver) throw new Error("Receiver not found");
          const chatCost = Number(receiver.chatCost);

          if (Number(sender.walletBalance) < chatCost) {
            io.to(senderId.toString()).emit("balanceError", {
              message: "Insufficient wallet balance",
              required: chatCost,
              available: sender.walletBalance,
            });
            return;
          }
        }

        const existingChat = await ChatList.findOne({
          senderId,
          receiverId,
          shop_id,
        });

        if (!existingChat) {
          await ChatList.create([
            {
              senderId,
              receiverId,
              shop_id,
              lastMessage: previewText,
              lastMessageTime: timestamp,
              isRequest: false,
            },
          ]);
        } else {
          await ChatList.updateOne(
            { _id: existingChat._id },
            { lastMessage: previewText, lastMessageTime: timestamp },
          );
        }

        const messageDoc = {
          senderId,
          receiverId,
          shop_id,
          text: text || "",
          timestamp,
          isRead: false,
          messageType: attachment ? "attachment" : "text",
        };
        if (attachment) {
          const retentionDays = Number(process.env.CHAT_ATTACHMENT_RETENTION_DAYS || 30);
          messageDoc.attachment = {
            type: attachment.type,
            storageKey: attachment.storageKey,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            size: attachment.size,
            width: attachment.width,
            height: attachment.height,
            uploadedAt: new Date(),
            expiresAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
          };
        }

        const savedChat = await MessageModal.create(messageDoc);

        // `sender` above already holds fullname/profileImage — this was a second
        // fetch of the exact same document.
        const senderInfo = sender;

        // Independent lookups — same queries, run concurrently.
        const [customerUser, consultantUser] = await Promise.all([
          User.findOne({
            _id: { $in: [senderId, receiverId] },
            userType: "customer",
          }),
          User.findOne({
            _id: { $in: [senderId, receiverId] },
            userType: "consultant",
          }),
        ]);

        if (customerUser?.isChatAccepted === "chatEnd") {
          await User.updateOne(
            { _id: customerUser._id },
            { $set: { isChatAccepted: "request" } },
          );
        }

        const existingUser = await ConsultantClient.findOne({
          userId: customerUser._id,
          consultantId: consultantUser._id,
          shop_id,
        });
        if (!existingUser) {
          await ConsultantClient.create({
            userId: customerUser._id,
            consultantId: consultantUser._id,
            shop_id,
          });
        }

        const messageWithSender = {
          ...savedChat.toObject(),
          senderName: senderInfo?.fullname || "User",
          avatar: senderInfo?.profileImage || null,
          // In-memory passthrough only (not persisted) — lets the sender's own
          // UI reconcile its optimistic bubble by id instead of by text
          // equality, which breaks for empty-text attachment messages.
          tempId: tempId || null,
        };
        // TEMPORARY (debugging silent customer-send failures) — confirms the
        // message actually persisted and is about to be broadcast back.
        console.log("[CHAT DEBUG] sendMessage persisted, broadcasting receiveMessage:", {
          messageId: String(savedChat._id),
          senderId,
          receiverId,
        });
        io.to(String(senderId)).emit("receiveMessage", messageWithSender);
        io.to(String(receiverId)).emit("receiveMessage", messageWithSender);

        // `receiver` was fetched once up front with these same fields.
        if (receiver?.userType === "consultant") {
          io.to(String(receiverId)).emit("consultantNotification", {
            type: "message",
            userId: senderId,
            shopId: shop_id,
            preview: previewText,
            senderName: senderInfo?.fullname || "User",
          });
        }
        if (receiver?.firebaseToken?.token && !receiver?.isActive) {
          const shop_Domain = await shopModel.findById(shop_id);
          await sendFCM(
            receiver.firebaseToken.token,
            senderInfo.fullname,
            previewText,
            "https://www.svgrepo.com/show/335455/profile-default.svg",
            shop_Domain.shop,
          );
        }
      } catch (error) {
        console.error("❌ Transaction failed:", error);
      }
    });

    socket.on("acceptUserChat", async (acceptData) => {
      try {
        const { userId, shopId, consultantId } = acceptData || {};

        if (
          !(await assertChatPair(socket, {
            userId,
            consultantId,
            shopId,
            event: "acceptUserChat",
          }))
        ) {
          return;
        }

        // Customer confirms after consultant unlocks the chat session.
        if (getAuthUserId(socket) !== String(userId)) {
          rejectSocketAction(socket, "acceptUserChat", "forbidden");
          return;
        }

        const user = await User.findById(userId);
        const canStartChat =
          user &&
          (user.isChatAccepted === "request" || user.isChatAccepted === "unlock");
        if (!canStartChat) {
       
          rejectSocketAction(socket, "acceptUserChat", "invalid_state");
          return;
        }

        // Block before chat billing starts — the shop's minute pool may have
        // been exhausted since the consultant unlocked the chat.
        const commStatus = await getCommunicationStatus(shopId);
        if (!commStatus.allowed) {
          io.to(userId).emit("COMMUNICATION_DISABLED", {
            ...COMMUNICATION_DISABLED_ERROR,
          });
          io.to(consultantId).emit("COMMUNICATION_DISABLED", {
            ...COMMUNICATION_DISABLED_ERROR,
          });
          return;
        }

        const consultantCost = await User.findById(consultantId);
        const consultantChatCost = Number(consultantCost?.chatPerMinute);
        const perSecondCost = consultantChatCost / 60;
        const userBalance = Number(user?.walletBalance);
        if (userBalance < perSecondCost) {
          io.to(userId).emit("balanceError", {
            message: "Insufficient balance to start chat",
          });
          return;
        }

        user.isChatAccepted = "accepted";
        user.chatLock = false;
        await user.save();

        const transaction = await TransactionHistroy.create({
          senderId: userId,
          receiverId: consultantId,
          shop_id: shopId,
          startTime: new Date(),
          status: "active",
          type: "chat",
        });

        // Tracks this session so a disconnect (refresh/close/network loss —
        // see the "disconnect" handler below) can auto-finalize billing via
        // the same idempotent path "endChat" uses, instead of leaving it
        // billing forever if the client never sends an explicit end.
        registerActiveChat({
          transactionId: transaction._id,
          userId,
          consultantId,
          shopId,
        });

        const timerPayload = {
          transactionId: transaction._id,
          startTime: transaction.startTime,
          userId,
          consultantId,
          shopId,
        };

        io.to(userId).emit("chatTimerStarted", timerPayload);
        io.to(consultantId).emit("chatTimerStarted", timerPayload);

        ("✅ chatTimerStarted emitted for user and consultant");

        const maxChatSeconds = Math.floor(userBalance / perSecondCost);
        const minutes = Math.floor(maxChatSeconds / 60);
        const seconds = maxChatSeconds % 60;

       
        // The countdown below used to be a setInterval ticking once per SECOND
        // for the whole chat, purely to subtract from a local balance variable.
        // It touched nothing outside this closure, and it was only ever cleared
        // when the balance ran out — so every chat left a 1Hz timer (plus its
        // captured transaction/user objects) alive on the event loop, and an
        // ended chat kept ticking to completion. With N concurrent chats that is
        // N timers/second of pure overhead.
        //
        // Same observable behaviour, one timer: pre-compute which tick the old
        // loop would have emitted on (identical arithmetic, so identical
        // float-rounding), then fire once at that exact moment.
        let ticksUntilAutoEnd = 0;
        let remainingBalance = userBalance;
        while (remainingBalance >= perSecondCost) {
          remainingBalance -= perSecondCost;
          ticksUntilAutoEnd++;
        }
        ticksUntilAutoEnd++; // the tick on which the old loop hit the else-branch

        setTimeout(() => {
        
          io.to(userId).emit("autoChatEnded", {
            transactionId: transaction._id,
            reason: "auto-ended",
          });

          io.to(consultantId).emit("autoChatEnded", {
            transactionId: transaction._id,
            reason: "auto-ended",
          });
        }, ticksUntilAutoEnd * 1000);
      } catch (error) {
        console.error("[socket] acceptUserChat error:", error.message);
      }
    });

    socket.on("conFirmChatEmit", async (acceptDataIds) => {
      try {
        const { userId, shopId, consultantId } = acceptDataIds || {};

        if (!(await assertConsultantOnly(socket, "conFirmChatEmit"))) return;

        if (
          !(await assertChatPair(socket, {
            userId,
            consultantId,
            shopId,
            event: "conFirmChatEmit",
          }))
        ) {
          return;
        }

        if (getAuthUserId(socket) !== String(consultantId)) return;

        const customerUser = await User.findById(userId);
        if (customerUser?.isChatAccepted === "chatEnd") {
          await User.updateOne(
            { _id: customerUser._id },
            { $set: { isChatAccepted: "unlock" } },
          );

        }

        io.to(userId).emit("acceptUser", {
          userId,
          shopId,
          consultantId,
          userAccepted: "accept",
        });

      } catch (error) {
        console.error("[socket] conFirmChatEmit error:", error.message);
      }
    });

    //----------------------------------------------- chat end --------------------------------------------------------------//

    socket.on("endChat", async (data) => {
      const { transactionId, userId, consultantId, shopId } = data || {};
      try {
        if (
          !(await assertTransactionParticipant(socket, {
            transactionId,
            userId,
            consultantId,
            shopId,
            event: "endChat",
          }))
        ) {
          return;
        }

        // Same idempotent finalize path a disconnect-timeout or the
        // beforeunload/pagehide REST endpoint would also use for this exact
        // transactionId — whichever gets there first performs the billing
        // math; the rest see { skipped: true, reason: "already_completed" }.
        await finalizeChatSession(transactionId, {
          reason: "ended",
          endedBy: getAuthUserId(socket) === String(userId) ? "user_end_chat" : "consultant_end_chat",
        });
      } catch (error) {
        console.log("[socket] endChat error:", error.message);
      }
    });

    socket.on("markSeen", async (data) => {
      try {
        const { senderId, receiverId } = data || {};
        const authId = getAuthUserId(socket);

        if (!authId || !isValidObjectId(senderId) || !isValidObjectId(receiverId)) {
          return;
        }

        if (authId !== String(receiverId)) {
          return;
        }

        await MessageModal.updateMany(
          {
            senderId,
            receiverId,
            isRead: false,
          },
          { $set: { isRead: true } },
        );

        io.to(String(receiverId)).emit("seenUpdate", { senderId });
      } catch (error) {
        console.error("[socket] markSeen error:", error.message);
      }
    });

    socket.on("disconnect", async (reason) => {
      console.log("❌ Socket disconnected:", socket.id, "reason:", reason);

      try {
        await unregisterSocketPresence(io, socket, onlineUsers, handleUserDisconnect);
        // Layer 1+2 of the chat reliability requirement: Socket.IO's own
        // transport heartbeat (pingInterval/pingTimeout above) already spent
        // up to ~15s confirming this connection is really gone before this
        // fires; handleChatUserDisconnect starts a further grace period
        // (services/chatSessionManager.js) before auto-ending any chat this
        // user was actively billing, exactly mirroring how calls already
        // handle a disconnect via callManager.handleUserDisconnect above.
        handleChatUserDisconnect(getAuthUserId(socket), reason);
      } catch (err) {
        console.error("Error during socket disconnect cleanup:", err);
      }
    });
  });
};

module.exports = { ioServer, getCallManager, getChatManager };
