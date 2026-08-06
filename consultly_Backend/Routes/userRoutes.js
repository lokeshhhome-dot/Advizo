const express = require("express");
const userRouter = express.Router();
const { usersController, checkedUserBlance, checkUserAvailable, getConsultant } = require("../Controller/usersController");
const { getVouchersController } = require("../Controller/userDetailsController");
const { optionalAuthenticateToken } = require("../Auth/signup-signin");

userRouter.get("/shopify/users/:userId", optionalAuthenticateToken, usersController);
userRouter.get("/shopify/users/checked-balance/:userId/:consultantId", optionalAuthenticateToken, checkedUserBlance);
userRouter.get("/get/vouchers/:adminId", getVouchersController);
userRouter.get("/check/user/available/:userId", optionalAuthenticateToken, checkUserAvailable);
userRouter.get("/public/find-consultant/:shop_id",optionalAuthenticateToken, getConsultant)


module.exports = { userRouter };
