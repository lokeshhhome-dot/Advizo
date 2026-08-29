const express = require("express");
const { adminController, voucherController, getTransactionController, getUserConsultantController, getShopAllUserController, getShopAllConsultantController, updateUserConsultantController, appEnableAndDisableController, checkAppBillingController, voucherHandlerController, updatesVoucherController, getWithdrawalRequest, updateConsultantWidthrawalRequest, declineWithdrawalRequest, updateAdminPercentage, updateConsultantCardTheme, updateMenuController, getConsultantSupportRequests, replyConsultantSupportRequest, markConsultantSupportRequestRead, completeWelcomeShown, _PlanDetails, getConsultantAd, } = require("../Controller/adminController");
const { verifyShopifyToken } = require("../MiddleWare/ShopifyMiddleware/verifyShopifyToken");
const { sendEmail } = require("../MiddleWare/ShopifyMiddleware/nodemailer");
const { getSetupGuideController, getMenuController } = require("../Controller/adminController");
const {
  getBillingPlans,
  createSubscription,
  getTrialStatus,
} = require("../Controller/adminPrincingController");
const { invalidateThemeAssets } = require("../MiddleWare/ShopifyMiddleware/helperTheme");
const adminRoute = express.Router();

// ---- In-app billing (Shopify recurring charges remain the only provider) ----
adminRoute.get("/billing/plans/:adminId", verifyShopifyToken, getBillingPlans);
adminRoute.post("/billing/subscribe/:adminId", verifyShopifyToken, createSubscription);
adminRoute.get("/billing/trial-status/:adminId", verifyShopifyToken, getTrialStatus);


adminRoute.get("/admin/:adminId", verifyShopifyToken, adminController);
adminRoute.post("/admin/voucher/:adminId", verifyShopifyToken, voucherController);
adminRoute.get("/activity/transactions/:adminId", verifyShopifyToken, getTransactionController);
adminRoute.get("/user/consultant/:adminId", verifyShopifyToken, getUserConsultantController);
adminRoute.get("/shop/all-user/:adminId", verifyShopifyToken, getShopAllUserController);
adminRoute.get("/shop/all-consultant/:adminId", verifyShopifyToken, getShopAllConsultantController);
adminRoute.post("/update-wallet/:adminId", verifyShopifyToken, updateUserConsultantController);
adminRoute.post("/app-enable-and-disable/:adminId", verifyShopifyToken, appEnableAndDisableController);
adminRoute.get("/shop/billing-status/:adminId", verifyShopifyToken, checkAppBillingController)
adminRoute.delete("/delete/voucher/:shopId/:voucherId", verifyShopifyToken, voucherHandlerController)
adminRoute.put("/admin/voucher-updates/:shopId/:voucherId", verifyShopifyToken, updatesVoucherController)
adminRoute.get("/withdrawal-requests/:adminId", verifyShopifyToken, getWithdrawalRequest)
adminRoute.put("/update/widthrwal/req/:adminId", verifyShopifyToken, updateConsultantWidthrawalRequest)
adminRoute.put("/declin/widthrwal/req/:transactionId", verifyShopifyToken, declineWithdrawalRequest)
adminRoute.put("/admin/update-percentage/:adminId", verifyShopifyToken, updateAdminPercentage)
adminRoute.put("/admin/consultant-card-theme/:adminId", verifyShopifyToken, updateConsultantCardTheme)
adminRoute.get("/is-setup-guide-open/:adminId", verifyShopifyToken, getSetupGuideController)
adminRoute.put("/close-setup-guide/:adminId", verifyShopifyToken, updateMenuController)
adminRoute.get("/menu/:adminId", verifyShopifyToken, getMenuController)
adminRoute.get("/consultant-support/:adminId", verifyShopifyToken, getConsultantSupportRequests)
adminRoute.put("/consultant-support/:adminId/:requestId/reply", verifyShopifyToken, replyConsultantSupportRequest)
adminRoute.put("/consultant-support/:adminId/:requestId/read", verifyShopifyToken, markConsultantSupportRequestRead)
adminRoute.patch("/shop/welcome-complete/:adminId", verifyShopifyToken, completeWelcomeShown)
adminRoute.get("/api-find-consultant/:shop_id", verifyShopifyToken, getConsultantAd)


adminRoute.get("/plan/details/:adminId", verifyShopifyToken, _PlanDetails)
adminRoute.get("/send/mail", verifyShopifyToken, async (req, res) => {
  try {
    await sendEmail({ userInstall: false });
    res.json({ success: true, message: "Email sent" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error sending email" });
  }
})

module.exports = { adminRoute };    