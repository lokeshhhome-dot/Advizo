const express = require("express")
const { consultantController,
   updateConsultantStatus,
   getConsultantById,
   getConsultantHistory,
   getConsultantAllUser,
   getConsultantAllUserHistory,
   deleteConsultant,
   getConsultantByShopIdAndConsultantId,
   loginConsultant,
   forgotConsultantPassword,
   resetConsultantPassword,
   getChatListByShopIdAndConsultantId,
   removeChatListAndConsultantIdFromChatList,
   updateConsultantData,
   getConsultantAllUsers,
   updateConsultantProfileStoreFront,
   getUserConversationControllerConsultant,
   getConsultantSelfOverview,
   getConsultantWalletHistroy,
   WithdrawalRequestController,
   getWithdrawalRequest,
   getMonthlyRevenueController,
   tokenVerifyController,
   submitConsultantSupportRequest,
   getConsultantSupportRequests,
   markConsultantSupportReplyRead,
   getConsultantNotifications,
   markConsultantNotificationsRead,
} = require("../Controller/consultantController")
const consultantRoute = express.Router()
const path = require("path");
const multer = require("multer");
const { verifyShopifyToken } = require("../MiddleWare/ShopifyMiddleware/verifyShopifyToken");
const { authenticateToken } = require("../Auth/signup-signin");

// Avatars only: allow real image types by BOTH mime and extension, and cap size.
// Blocks svg/html/js/exe (stored-XSS + malware vectors).
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ALLOWED_IMAGE_MIME.has(file.mimetype) && ALLOWED_IMAGE_EXT.has(ext)) {
      return cb(null, true);
    }
    return cb(new Error("Only JPG, PNG, or WEBP images are allowed"));
  },
});


consultantRoute.post("/add-consultant/:shop_id", verifyShopifyToken, upload.single("profileImage"), consultantController)
consultantRoute.put("/update-consultant/:id", verifyShopifyToken, upload.single("profileImage"), updateConsultantData)
// ADMIN listing — embedded admin authenticates with a Shopify session token.
// STOREFRONT listing — public so browsing customers can see consultants.
// getConsultant already returns ONLY safe display fields (no password/PII).
consultantRoute.put("/api-consultant-update-status/:id", verifyShopifyToken, updateConsultantStatus)
consultantRoute.get("/consultantid/:id",verifyShopifyToken, getConsultantById)
consultantRoute.get("/consultant-history/:id", verifyShopifyToken, getConsultantHistory)
consultantRoute.get("/consultant-all-user/:id", verifyShopifyToken, getConsultantAllUser)
consultantRoute.get("/consultant-all-user-history", verifyShopifyToken, getConsultantAllUserHistory)
consultantRoute.delete('/delete-consultant/:id', verifyShopifyToken, deleteConsultant);
consultantRoute.get("/consultant-by-shop-id-and-consultant-id/:shop_id/:consultant_id", getConsultantByShopIdAndConsultantId);
consultantRoute.post("/login-consultant", loginConsultant);
consultantRoute.post("/forgot-password", forgotConsultantPassword);
consultantRoute.post("/reset-password", resetConsultantPassword);
consultantRoute.get("/get/chat-list/:shop_id/:consultant_id", authenticateToken, getChatListByShopIdAndConsultantId);
consultantRoute.delete("/remove/user/chat-list/:id/:senderId", authenticateToken, removeChatListAndConsultantIdFromChatList);
consultantRoute.get("/get/consultant/:id", authenticateToken, getConsultantAllUsers);
consultantRoute.put("/update-profile", authenticateToken, upload.single("profileImage"), updateConsultantProfileStoreFront);
consultantRoute.get("/find-user-chat-logs/:id", authenticateToken, getUserConversationControllerConsultant)
consultantRoute.get("/me/overview/:consultantId", authenticateToken, getConsultantSelfOverview)
consultantRoute.get("/find-consultant/wallet/history/:userId/:shopId", authenticateToken, getConsultantWalletHistroy)
consultantRoute.post("/submit/withdrawal/request/:consultantId/:shopId", authenticateToken, WithdrawalRequestController)
consultantRoute.get("/find/consultant/withdrawal/request/:consultantId", authenticateToken, getWithdrawalRequest)
consultantRoute.get("/find/monthly-revenue/:shop_id/:consultantId", authenticateToken, getMonthlyRevenueController) // defult did use 
consultantRoute.get("/verify-token", authenticateToken, tokenVerifyController)
consultantRoute.post("/support-request", authenticateToken, submitConsultantSupportRequest)
consultantRoute.get("/support-requests", authenticateToken, getConsultantSupportRequests)
consultantRoute.put("/support-requests/:requestId/read", authenticateToken, markConsultantSupportReplyRead)
consultantRoute.get("/notifications/:shop_id/:consultant_id", authenticateToken, getConsultantNotifications)
consultantRoute.put("/notifications/:shop_id/:consultant_id/read", authenticateToken, markConsultantNotificationsRead)


module.exports = { consultantRoute }

