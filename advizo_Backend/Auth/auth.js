const JWT = require("jsonwebtoken");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { User } = require("../Modal/userSchema");
const { shopModel } = require("../Modal/shopify");
dotenv.config();

const verify_Token = async (request) => {
   try {
      const auth = request.headers.authorization || request.headers.Authorization;
      if (!auth || typeof auth !== "string") {
         return false;
      }

      const parts = auth.trim().split(" ");
      if (parts.length !== 2) {
         return false;
      }

      const [scheme, token] = parts;
      if (!/^Bearer$/i.test(scheme) || !token) {
         return false;
      }

      const jwt_ = JWT.verify(token, process.env.JWT_SECRET_KEY);
      return !!jwt_ && jwt_;
   } catch (err) {
      console.log("token is invalid ", err);
      return false;
   }
};

/**
 * Resolve MongoDB user id from JWT payload.
 * Supports Shopify/customer tokens ({ id }), consultant tokens ({ id, role }),
 * and legacy sign-in tokens ({ email }).
 */
const resolveAuthenticatedUserId = async (request) => {
   const payload = request.user;
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

const sendForbidden = (res, message = "Forbidden") =>
   res.status(403).json({ success: false, message });

const sendUnauthorized = (res, message = "Authentication required") =>
   res.status(401).json({ success: false, message });

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const userBelongsToShop = async (userId, shopId) => {
   if (!isValidObjectId(userId) || !shopId) return false;
   const user = await User.findById(userId).select("_id shop_id");
   if (!user) return false;
   return String(user.shop_id) === String(shopId);
};

const consultantBelongsToShop = async (consultantId, shopId) => {
   if (!isValidObjectId(consultantId) || !shopId) return false;
   const consultant = await User.findById(consultantId).select("_id shop_id userType");
   if (!consultant || consultant.userType !== "consultant") return false;
   return String(consultant.shop_id) === String(shopId);
};

const usersShareShop = async (userId, otherUserId) => {
   if (!isValidObjectId(userId) || !isValidObjectId(otherUserId)) return false;
   const users = await User.find({ _id: { $in: [userId, otherUserId] } }).select("shop_id");
   if (users.length !== 2) return false;
   return String(users[0].shop_id) === String(users[1].shop_id);
};

const assertAdminShopAccess = async (req, res, adminId) => {
   if (!isValidObjectId(adminId)) {
      res.status(400).json({ success: false, message: "Invalid admin ID" });
      return false;
   }

   const shopDoc = await shopModel.findById(adminId).select("shop");
   if (!shopDoc) {
      res.status(404).json({ success: false, message: "Admin not found" });
      return false;
   }

   if (req.shop && shopDoc.shop !== req.shop) {
      sendForbidden(res);
      return false;
   }

   req.adminShop = shopDoc;
   return true;
};

const assertConsultantSelf = async (req, res, consultantId) => {
   const authUserId = await resolveAuthenticatedUserId(req);
   if (!authUserId) {
      sendUnauthorized(res, "Access denied. Token is not verified");
      return false;
   }

   if (String(authUserId) !== String(consultantId)) {
      sendForbidden(res);
      return false;
   }

   return true;
};

const authorizeUserResource = async (req, res, { userId, shopId }) => {
   if (!isValidObjectId(userId)) {
      res.status(400).json({ success: false, message: "Invalid user ID" });
      return false;
   }

   const authUserId = await resolveAuthenticatedUserId(req);

   if (authUserId) {
      if (String(authUserId) !== String(userId)) {
         sendForbidden(res);
         return false;
      }

      if (shopId && !(await userBelongsToShop(userId, shopId))) {
         sendForbidden(res);
         return false;
      }

      return true;
   }

   sendUnauthorized(res);
   return false;
};

const authorizeChatParticipant = async (req, res, { shopId, userId, consultantId }) => {
   if (
      !isValidObjectId(shopId) ||
      !isValidObjectId(userId) ||
      !isValidObjectId(consultantId)
   ) {
      res.status(400).json({ success: false, message: "Invalid IDs" });
      return false;
   }

   if (!(await userBelongsToShop(userId, shopId))) {
      sendForbidden(res);
      return false;
   }

   if (!(await consultantBelongsToShop(consultantId, shopId))) {
      sendForbidden(res);
      return false;
   }

   const authUserId = await resolveAuthenticatedUserId(req);

   if (authUserId) {
      const authId = String(authUserId);
      if (authId !== String(userId) && authId !== String(consultantId)) {
         sendForbidden(res);
         return false;
      }
      return true;
   }

   // No authenticated user → DENY (was silently allowing chat-Activity-history reads).
   sendUnauthorized(res);
   return false;
};

const authorizeCallParticipant = async (req, res, { callerId, receiverId, shopId }) => {
   if (!isValidObjectId(callerId) || !isValidObjectId(receiverId)) {
      res.status(400).json({ success: false, message: "Invalid participant ID" });
      return false;
   }

   if (shopId) {
      const sameShop = await usersShareShop(callerId, receiverId);
      const callerInShop = await userBelongsToShop(callerId, shopId);
      const receiverInShop = await userBelongsToShop(receiverId, shopId);
      if (!sameShop || !callerInShop || !receiverInShop) {
         sendForbidden(res);
         return false;
      }
   } else if (!(await usersShareShop(callerId, receiverId))) {
      sendForbidden(res);
      return false;
   }

   const authUserId = await resolveAuthenticatedUserId(req);

   // No authenticated user → DENY (was allowing unauthenticated call teardown /
   // call-session disclosure).
   if (!authUserId) {
      sendUnauthorized(res);
      return false;
   }

   const authId = String(authUserId);
   if (authId !== String(callerId) && authId !== String(receiverId)) {
      sendForbidden(res);
      return false;
   }

   return true;
};

const assertConsultantInAdminShop = async (req, res, consultantId) => {
   if (!isValidObjectId(consultantId)) {
      res.status(400).json({ success: false, message: "Invalid consultant ID" });
      return false;
   }

   const consultant = await User.findById(consultantId).select("shop_id userType");
   if (!consultant || consultant.userType !== "consultant") {
      res.status(404).json({ success: false, message: "Consultant not found" });
      return false;
   }

   if (req.shop) {
      const shopDoc = await shopModel.findOne({ shop: req.shop }).select("_id");
      if (!shopDoc || String(shopDoc._id) !== String(consultant.shop_id)) {
         sendForbidden(res);
         return false;
      }
   }

   return true;
};

const assertShopIdMatchesAdminSession = async (req, res, shopId) => {
   if (!isValidObjectId(shopId)) {
      res.status(400).json({ success: false, message: "Invalid shop ID" });
      return false;
   }

   if (req.shop) {
      const shopDoc = await shopModel.findById(shopId).select("shop");
      if (!shopDoc || shopDoc.shop !== req.shop) {
         sendForbidden(res);
         return false;
      }
   }

   return true;
};

const assertAuthenticatedUserShop = async (req, res, shopId) => {
   if (!isValidObjectId(shopId)) {
      res.status(400).json({ success: false, message: "Invalid shop ID" });
      return false;
   }

   const authUserId = await resolveAuthenticatedUserId(req);
   if (!authUserId) {
      sendUnauthorized(res, "Access denied. Token is not verified");
      return false;
   }

   if (!(await userBelongsToShop(authUserId, shopId))) {
      sendForbidden(res);
      return false;
   }

   return true;
};

module.exports = {
   verify_Token,
   resolveAuthenticatedUserId,
   assertAdminShopAccess,
   assertConsultantSelf,
   authorizeUserResource,
   authorizeChatParticipant,
   authorizeCallParticipant,
   assertConsultantInAdminShop,
   assertShopIdMatchesAdminSession,
   assertAuthenticatedUserShop,
   userBelongsToShop,
   consultantBelongsToShop,
   usersShareShop,
};
