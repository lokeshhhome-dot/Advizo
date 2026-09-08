
const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const { User } = require("../Modal/userSchema");
const {
   getCommunicationStatus,
   COMMUNICATION_DISABLED_ERROR,
} = require("../services/subscriptionMinutes");
const { default: mongoose } = require("mongoose");
const { CallSession } = require("../Modal/callSessions");
const {
  authorizeCallParticipant,
  resolveAuthenticatedUserId,
   usersShareShop,
} = require("../Auth/auth");

const CHANNEL_REGEX = /^channel-[a-f0-9]{6}-[a-f0-9]{6}$/i;
const ENDED_SESSION_STATUSES = new Set(["ended", "completed", "cancelled", "missed", "failed"]);
const ALLOWED_CALL_TYPES = new Set(["voice", "video"]);

const parseTokenExpiry = () => {
   const raw = Number(process.env.AGORA_TOKEN_EXPIRY_SECONDS || 600);
   if (!Number.isFinite(raw)) return 600;
   return Math.max(60, Math.min(3600, Math.floor(raw)));
};

const AGORA_TOKEN_EXPIRY_SECONDS = parseTokenExpiry();

const logSecurityEvent = (event, context = {}) => {
   console.warn(`[AGORA_SECURITY] ${event}`, context);
};

const isValidChannelName = (channelName) =>
   typeof channelName === "string" && CHANNEL_REGEX.test(channelName);

const isValidUid = (uid) => {
   const num = Number(uid);
   return Number.isInteger(num) && num >= 1 && num <= 4294967295;
};

const isChannelOwnedByParticipants = (channelName, callerId, receiverId) => {
   if (!isValidChannelName(channelName)) return false;
   const expected = `channel-${String(callerId).slice(-6)}-${String(receiverId).slice(-6)}`.toLowerCase();
   return String(channelName).toLowerCase() === expected;
};

const resolveExistingSession = async (channelName) => {
   return CallSession.findOne({ sessionId: channelName }).sort({ createdAt: -1 }).lean();
};

const ensureParticipantsForSession = async (session) => {
   const [caller, receiver] = await Promise.all([
      User.findById(session.callerId).select("_id shop_id userType"),
      User.findById(session.receiverId).select("_id shop_id userType"),
   ]);

   if (!caller || !receiver) return null;
   if (String(caller.shop_id) !== String(receiver.shop_id)) return null;
   return { caller, receiver };
};

const validateSessionAccess = async (authUser, session, channelName) => {
   const participants = await ensureParticipantsForSession(session);
   if (!participants) {
      return { ok: false, reason: "invalid_session_participants" };
   }

   const isParticipant =
      String(participants.caller._id) === String(authUser._id) ||
      String(participants.receiver._id) === String(authUser._id);
   if (!isParticipant) {
      return {
         ok: false,
         reason: "non_participant_token_request",
         context: {
            callerId: String(participants.caller._id),
            receiverId: String(participants.receiver._id),
         },
      };
   }

   if (
      !isChannelOwnedByParticipants(
         channelName,
         participants.caller._id,
         participants.receiver._id,
      )
   ) {
      return {
         ok: false,
         reason: "channel_ownership_violation",
         context: {
            callerId: String(participants.caller._id),
            receiverId: String(participants.receiver._id),
         },
      };
   }

   if (
      !(await usersShareShop(
         String(participants.caller._id),
         String(participants.receiver._id),
      ))
   ) {
      return { ok: false, reason: "cross_shop_session_access" };
   }

   return { ok: true, participants };
};

const restartEndedSession = async (session, effectiveCallType) => {
   const previousStatus = String(session.status || "").toLowerCase();
   return CallSession.findOneAndUpdate(
      { _id: session._id, status: session.status },
      {
         $set: {
            status: "pending",
            callType: effectiveCallType,
            startTime: new Date(),
            lastActivityAt: new Date(),
            endTime: null,
            transtionId: null,
         },
         $push: {
            stateLog: {
               from: previousStatus,
               to: "pending",
               reason: "new_call_token_request",
               at: new Date(),
            },
         },
      },
      { new: true },
   ).lean();
};

const resolveSessionForTokenRequest = async (req, { forceCallType = null } = {}) => {
   const authUserId = await resolveAuthenticatedUserId(req);
   if (!authUserId || !mongoose.Types.ObjectId.isValid(authUserId)) {
      logSecurityEvent("unauthenticated_token_request", { ip: req.ip });
      return { errorCode: 401, message: "Authentication required" };
   }

   const { channelName, uid, receiverId, callType } = req.body || {};
   if (!isValidChannelName(channelName)) {
      return { errorCode: 400, message: "Invalid channelName" };
   }
   if (!isValidUid(uid)) {
      return { errorCode: 400, message: "Invalid uid" };
   }

   const authUser = await User.findById(authUserId).select("_id shop_id userType");
   if (!authUser) {
      logSecurityEvent("auth_user_missing_for_token", { authUserId, channelName });
      return { errorCode: 401, message: "Authentication required" };
   }

   // Shop communication minutes gate every call — no Agora token may be
   // issued (and no session created/restarted) once the pool is exhausted.
   const commStatus = await getCommunicationStatus(authUser.shop_id);
   if (!commStatus.allowed) {
      logSecurityEvent("token_blocked_minutes_exhausted", { authUserId, channelName });
      return {
         errorCode: 403,
         code: COMMUNICATION_DISABLED_ERROR.code,
         message: COMMUNICATION_DISABLED_ERROR.message,
      };
   }

   let session = await resolveExistingSession(channelName);
   let effectiveCallType = forceCallType || callType || session?.callType || "voice";
   if (!ALLOWED_CALL_TYPES.has(effectiveCallType)) {
      return { errorCode: 400, message: "Invalid call type" };
   }

   if (session) {
      if (ENDED_SESSION_STATUSES.has(String(session.status || "").toLowerCase())) {
         const access = await validateSessionAccess(authUser, session, channelName);
         if (!access.ok) {
            logSecurityEvent(access.reason, {
               authUserId,
               channelName,
               status: session.status,
               ...(access.context || {}),
            });
            return { errorCode: 403, message: "Forbidden" };
         }

         if (receiverId && mongoose.Types.ObjectId.isValid(receiverId)) {
            const receiverMatches =
               String(receiverId) === String(access.participants.caller._id) ||
               String(receiverId) === String(access.participants.receiver._id);
            if (!receiverMatches) {
               logSecurityEvent("receiver_mismatch_on_session_restart", {
                  authUserId,
                  channelName,
                  receiverId,
               });
               return { errorCode: 403, message: "Forbidden" };
            }
         }

         const restarted = await restartEndedSession(session, effectiveCallType);
         if (!restarted) {
            session = await resolveExistingSession(channelName);
            if (
               !session ||
               ENDED_SESSION_STATUSES.has(String(session.status || "").toLowerCase())
            ) {
               return { errorCode: 409, message: "Call session is no longer active" };
            }
         } else {
            logSecurityEvent("session_restarted_after_ended", {
               authUserId,
               channelName,
               previousStatus: session.status,
            });
            session = restarted;
         }

         return {
            authUser,
            session,
            channelName,
            uid: Number(uid),
            callType: effectiveCallType,
         };
      }

      const access = await validateSessionAccess(authUser, session, channelName);
      if (!access.ok) {
         logSecurityEvent(access.reason, {
            authUserId,
            channelName,
            sessionId: String(session._id),
            ...(access.context || {}),
         });
         return { errorCode: 403, message: "Forbidden" };
      }

      effectiveCallType = forceCallType || session.callType || effectiveCallType;
      return { authUser, session, channelName, uid: Number(uid), callType: effectiveCallType };
   }

   if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
      return { errorCode: 400, message: "receiverId is required" };
   }

   const receiver = await User.findById(receiverId).select("_id shop_id userType");
   if (!receiver) {
      return { errorCode: 404, message: "Receiver not found" };
   }

   if (String(receiver._id) === String(authUser._id)) {
      return { errorCode: 400, message: "Invalid participants" };
   }

   if (String(receiver.shop_id) !== String(authUser.shop_id)) {
      logSecurityEvent("cross_shop_token_request", {
         authUserId,
         receiverId,
         channelName,
      });
      return { errorCode: 403, message: "Forbidden" };
   }

   if (!isChannelOwnedByParticipants(channelName, authUser._id, receiver._id)) {
      logSecurityEvent("channel_spoof_attempt", {
         authUserId,
         receiverId,
         channelName,
      });
      return { errorCode: 403, message: "Forbidden" };
   }

   const created = await CallSession.create({
      sessionId: channelName,
      callerId: authUser._id,
      receiverId: receiver._id,
      callType: effectiveCallType,
      shopId: String(authUser.shop_id),
      status: "pending",
      startTime: new Date(),
      lastActivityAt: new Date(),
      stateLog: [
         {
            from: "pending",
            to: "pending",
            reason: "agora_token_requested",
            at: new Date(),
         },
      ],
   });

   logSecurityEvent("session_bootstrapped_for_token", {
      authUserId,
      receiverId: String(receiver._id),
      channelName,
      sessionId: String(created._id),
   });

   return {
      authUser,
      session: created.toObject ? created.toObject() : created,
      channelName,
      uid: Number(uid),
      callType: effectiveCallType,
   };
};


const generateToken = async (req, res) => {
   try {
      const { channelName, uid } = req.body || {};

      if (!process.env.AGORA_APP_ID || !process.env.AGORA_APP_CERTIFICATE) {
         logSecurityEvent("agora_credentials_missing", { route: "generate-token" });
         return res.status(500).json({
            error: "Agora credentials not configured"
         });
      }

      const resolved = await resolveSessionForTokenRequest(req, { forceCallType: null });
      if (resolved?.errorCode) {
         return res.status(resolved.errorCode).json(
            resolved.code
               ? { success: false, code: resolved.code, message: resolved.message, error: resolved.message }
               : { error: resolved.message },
         );
      }

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const privilegeExpiredTs = currentTimestamp + AGORA_TOKEN_EXPIRY_SECONDS;

      const token = RtcTokenBuilder.buildTokenWithUid(
         process.env.AGORA_APP_ID,
         process.env.AGORA_APP_CERTIFICATE,
         resolved.channelName || channelName,
         resolved.uid ?? Number(uid),
         RtcRole.PUBLISHER,
         privilegeExpiredTs
      );

      res.json({
         token,
         appId: process.env.AGORA_APP_ID,
         channelName: resolved.channelName || channelName,
         uid: resolved.uid ?? Number(uid)
      });
   } catch (error) {
      console.error("Error generating token:", error.message);
      res.status(500).json({ error: "Failed to generate token" });
   }
};


const generateVoiceToken = async (req, res) => {
   try {
      const { channelName, uid } = req.body || {};

      if (!channelName || !uid) {
         return res.status(400).json({
            error: "channelName and uid are required"
         });
      }
      const appId = process.env.AGORA_APP_ID;
      const appCertificate = process.env.AGORA_APP_CERTIFICATE;

      if (!appId || !appCertificate) {
         logSecurityEvent("agora_credentials_missing", { route: "generate-voice-token" });
         return res.status(500).json({
            error: "Agora credentials not configured. Please check your environment variables.",
            details: {
               appId: appId ? "Set" : "Missing",
               appCertificate: appCertificate ? "Set" : "Missing"
            }
         });
      }

      const resolved = await resolveSessionForTokenRequest(req, { forceCallType: "voice" });
      if (resolved?.errorCode) {
         return res.status(resolved.errorCode).json(
            resolved.code
               ? { success: false, code: resolved.code, message: resolved.message, error: resolved.message }
               : { error: resolved.message },
         );
      }

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const privilegeExpiredTs = currentTimestamp + AGORA_TOKEN_EXPIRY_SECONDS;

      const token = RtcTokenBuilder.buildTokenWithUid(
         appId,
         appCertificate,
         resolved.channelName || channelName,
         resolved.uid ?? Number(uid),
         RtcRole.PUBLISHER,
         privilegeExpiredTs
      );
      res.json({
         token,
         appId: appId,
         channelName: resolved.channelName || channelName,
         uid: resolved.uid ?? Number(uid),
         callType: "voice"
      });
   } catch (error) {
      console.error("Error generating voice token:", error.message);
      res.status(500).json({
         error: "Failed to generate voice token",
         details: "Internal server error"
      });
   }
}

const getCaller_Receiver_Details = async (req, res) => {
   try {
      const { callerId, receiverId } = req.params || req.query;

      if (!callerId || !receiverId) {
         return res.status(400).json({
            error: "callerId and receiverId are required"
         });
      }
      if (!mongoose.Types.ObjectId.isValid(callerId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
         return res.status(400).json({
            error: "Invalid callerId or receiverId"
         });
      }

      if (
         !(await authorizeCallParticipant(req, res, {
            callerId,
            receiverId,
            shopId: req.query.shopId,
         }))
      ) {
         return;
      }

      // Two independent reads, and only four fields of each are returned.
      const [caller, receiver] = await Promise.all([
         User.findById(callerId).select("fullname fees profileImage").lean(),
         User.findById(receiverId).select("fullname fees profileImage").lean(),
      ]);

      if (!caller || !receiver) {
         return res.status(400).json({
            error: "Caller or receiver not found"
         });
      }
      const payload = {

         caller: {
            _id: caller._id,
            fullname: caller.fullname,
            fees: caller.fees,
            profileImage: caller.profileImage
         },

         receiver: {
            _id: receiver._id,
            fullname: receiver.fullname,
            fees: receiver.fees,
            profileImage: receiver.profileImage
         }

      }


      res.status(200).json({
         success: true,
         payload
      });
   } catch (error) {
      console.error("Error getting caller and receiver details:", error);
      res.status(500).json({
         error: "Failed to get caller and receiver details",
         details: error.message
      });
   }
}

const endActiveCall = async (req, res) => {
   try {
      // Stamp arrival BEFORE any DB work — resolution latency is not billable.
      const receivedAtMs = Date.now();
      const {
         channelName,
         callerId,
         receiverId,
         shopId,
         callType,
         endby,
         clientDurationSeconds = null,
      } = req.body;
      const { getCallManager } = require("../server-io");
      const callManager = getCallManager();

      if (!callManager) {
         return res.status(503).json({
            success: false,
            message: "Call service not ready",
         });
      }

      if (!channelName) {
         return res.status(400).json({
            success: false,
            message: "channelName is required",
         });
      }

      const { resolveActiveCallFromChannel, endCallSession } = callManager;
      const resolved = await resolveActiveCallFromChannel(channelName, {
         callerId,
         receiverId,
         shopId,
         callType,
      });

      if (!resolved) {
         return res.status(404).json({
            success: false,
            message: "No active call found for this channel",
         });
      }

      if (
         !(await authorizeCallParticipant(req, res, {
            callerId: resolved.callerId,
            receiverId: resolved.receiverId,
            shopId: resolved.shopId,
         }))
      ) {
         return;
      }

      if (resolved.alreadyCompleted) {
         return res.status(200).json({
            success: true,
            skipped: true,
            reason: "already_completed",
         });
      }

      const result = await endCallSession(resolved.callId, {
         reason: "manual_end",
         endedBy:
            endby === "consultant_cut_call"
               ? "consultant_cut_call"
               : "user_cut_call",
         transactionId: resolved.transactionId,
         callerId: resolved.callerId,
         receiverId: resolved.receiverId,
         channelName: resolved.channelName,
         callType: resolved.callType,
         shopId: resolved.shopId,
         clientDurationSeconds,
         endedAtMs: receivedAtMs,
      });

      return res.status(200).json({
         success: Boolean(result?.success || result?.skipped),
         ...result,
      });
   } catch (error) {
      console.error("Error ending active call:", error);
      return res.status(500).json({
         success: false,
         message: "Failed to end call",
         error: error.message,
      });
   }
};

module.exports = { generateToken, generateVoiceToken, getCaller_Receiver_Details, endActiveCall };
