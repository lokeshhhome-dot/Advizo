const { Conversation } = require("../Modal/Histroy");
const { User } = require("../Modal/userSchema");
const { find } = require("../Modal/userSchema");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { saveOptimizedImage } = require("../Utils/imageProcessor");
const { ChatList } = require("../Modal/chatListSchema");
const validator = require("validator");
const { TransactionHistroy } = require("../Modal/transactionHistroy");
const { WalletHistory } = require("../Modal/walletHistory");
const { WithdrawalRequestSchema } = require("../Modal/withdrawalSchema");
const { ConsultantClient } = require("../Modal/consultantClient");
const { ConsultantSupportRequest } = require("../Modal/consultantSupportRequest");
const { MessageModal } = require("../Modal/messageSchema");
const { missCalled } = require("../Modal/miscallasHistroy");
const dotenv = require("dotenv");
const { validatePhone } = require("../Utils/validations");
const {
  assertConsultantSelf,
  assertConsultantInAdminShop,
  assertShopIdMatchesAdminSession,
  assertAuthenticatedUserShop,
  authorizeUserResource,
  authorizeChatParticipant,
  resolveAuthenticatedUserId,
  userBelongsToShop,
} = require("../Auth/auth");
const { shopModel } = require("../Modal/shopify");
const {
  cacheGetJSON,
  cacheSetJSON,
  consultantListKey,
  invalidateConsultantList,
} = require("../Utils/redis");
const Subscription = require("../Modal/Subscription");
dotenv.config();




// plan limts 
const PLAN_LIMITS = {
  basic: parseInt(process.env.BASIC_PLAN_MAX_CONSULTANTS) || 3,
  standard: parseInt(process.env.PRO_PLAN_MAX_CONSULTANTS) || 10,
  premium: parseInt(process.env.ENTERPRISE_PLAN_MAX_CONSULTANTS) || 50,
};


const consultantController = async (req, res) => {
  try {
    const { shop_id } = req.params;
    const body = req.body;
    const file = req.file;

    if (!shop_id || !mongoose.Types.ObjectId.isValid(shop_id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop ID",
      });
    }

    if (!(await assertShopIdMatchesAdminSession(req, res, shop_id))) return;

    const subscription = await Subscription.findOne({ shopId: shop_id });
    if (!subscription) {
      return res.status(400).json({
        success: false,
        message: "No active subscription found for this shop.",
      });
    }


    const planName = String(
      subscription.planName || subscription.plan || "",
    ).trim();
    const planLimit =
      Number(subscription.maxConsultants) ||
      PLAN_LIMITS[planName.toLowerCase()];

    if (!planLimit) {
      return res.status(400).json({
        success: false,
        message: "Invalid or unrecognized subscription plan.",
      });
    }

    const existingConsultantCount = await User.countDocuments({
      shop_id,
      userType: "consultant",
    });

    if (existingConsultantCount >= planLimit) {
      return res.status(403).json({
        success: false,
        message: `Your current plan (${planName || "current"}) allows only ${planLimit} consultant${planLimit === 1 ? "" : "s"}. Please upgrade your plan to add more.`,
      });
    }

    const requiredFields = [
      "fullName",
      "email",
      "password",
      "phoneNumber",
      "profession",
      "specialization",
      "licenseIdNumber",
      "yearOfExperience",
      "languages",
      "displayName",
      "gender",
      "houseNumber",
      "streetArea",
      "landmark",
      "address",
      "pincode",
      "dateOfBirth",
      "pancardNumber",
      "voicePerMinute",
      "videoPerMinute",
      "chatPerMinute",
    ];

    const missingFields = requiredFields.filter((field) => !body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
        missingFields,
      });
    }
    // Email format validation add karo (required fields check ke baad)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // if (!file) {
    //     return res.status(400).json({
    //         success: false,
    //         message: "Profile image is required"
    //     });
    // }

    // Two independent uniqueness checks — run them together instead of paying
    // two serial round-trips. Both are `_id`-only: existence is all we need.
    const [existingEmail, existingLicense] = await Promise.all([
      User.findOne({ email: body.email.toLowerCase().trim() })
        .select("_id")
        .lean(),
      User.findOne({ licenseNo: body.licenseIdNumber }).select("_id").lean(),
    ]);

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists. Please use a different email.",
      });
    }
    const isPhoneValid = validatePhone(body.phoneNumber);
    if (!isPhoneValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format",
      });
    }

    if (existingLicense) {
      return res.status(400).json({
        success: false,
        message:
          "License number already exists. Please use a different license number.",
      });
    }

    const uploadFolder = path.join("uploads", "consultants");
    let imageURL = null;

    if (file) {
      // Resize + convert to WebP (falls back to original bytes if sharp fails).
      const { imageUrl } = await saveOptimizedImage(file.buffer, {
        folder: uploadFolder,
        baseName: `consultant-${Date.now()}`,
        originalExt: path.extname(file.originalname),
      });
      imageURL = imageUrl;
    }

    let randomAgoraUid;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      randomAgoraUid = Math.floor(100000 + Math.random() * 900000);
      const existingAgoraUid = await User.findOne({ agoraUid: randomAgoraUid });
      if (!existingAgoraUid) {
        break;
      }
      attempts++;
      if (attempts >= maxAttempts) {
        return res.status(500).json({
          success: false,
          message: "Failed to generate unique Agora UID. Please try again.",
        });
      }
    } while (true);

    let languagesArray;
    try {
      languagesArray = JSON.parse(body.languages);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid languages format. Expected JSON array.",
      });
    }
    if (!body.password || body.password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const hashPassword = await bcrypt.hash(body.password, 10);
    const consultantDetails = new User({
      shop_id,
      fullname: body.fullName,
      email: body.email.toLowerCase().trim(),
      phone: body.phoneNumber,
      password: hashPassword,
      profession: body.profession,
      specialization: body.specialization,
      licenseNo: body.licenseIdNumber,
      experience: String(body.yearOfExperience),
      // fees: String(body.chargingPerMinute),
      language: languagesArray,
      displayName: body.displayName,
      gender: body.gender,
      houseNumber: body.houseNumber,
      streetArea: body.streetArea,
      landmark: body.landmark,
      address: body.address,
      pincode: body.pincode,
      dateOfBirth: new Date(body.dateOfBirth),
      pan_cardNumber: body.pancardNumber,
      profileImage: imageURL,
      isActive: false,
      agoraUid: randomAgoraUid,
      userType: "consultant",
      consultantStatus: false,
      voicePerMinute: body.voicePerMinute,
      videoPerMinute: body.videoPerMinute,
      chatPerMinute: body.chatPerMinute,
    });

    await consultantDetails.save();
    await invalidateConsultantList(shop_id);

    return res.status(201).json({
      success: true,
      message: "Consultant created successfully",
      consultantId: consultantDetails._id,
    });
  } catch (error) {
    console.error("Error in consultantController:", error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists. Please use a different value.`,
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

const updateConsultantData = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const file = req.file;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid consultant ID",
      });
    }

    if (!(await assertConsultantInAdminShop(req, res, id))) return;

    const requiredFields = [
      "fullName",
      "email",
      "phoneNumber",
      "profession",
      "specialization",
      "licenseIdNumber",
      "yearOfExperience",
      "languages",
      "displayName",
      "gender",
      "houseNumber",
      "streetArea",
      "landmark",
      "address",
      "pincode",
      "dateOfBirth",
      "pancardNumber",
      "voicePerMinute",
      "videoPerMinute",
      "chatPerMinute",
    ];

    const missingFields = requiredFields.filter((field) => !body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
        missingFields,
      });
    }

    // Three independent reads → one round-trip instead of three. The checks are
    // still evaluated in the original order below, so responses are unchanged.
    const [existingUser, emailExists, licenseExists] = await Promise.all([
      User.findById(id),
      User.findOne({ email: body.email.toLowerCase().trim(), _id: { $ne: id } })
        .select("_id")
        .lean(),
      User.findOne({ licenseNo: body.licenseIdNumber, _id: { $ne: id } })
        .select("_id")
        .lean(),
    ]);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "Consultant not found",
      });
    }

    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }
    // Email change check karo
    if (body.email.toLowerCase().trim() !== existingUser.email) {
      return res.status(400).json({
        success: false,
        message: "Email cannot be changed",
      });
    }
    const isPhoneValid = validatePhone(body.phoneNumber);
    if (!isPhoneValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format",
      });
    }
    if (licenseExists) {
      return res.status(400).json({
        success: false,
        message: "License number already exists",
      });
    }

    let languagesArray;
    try {
      languagesArray = JSON.parse(body.languages);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid languages format. Expected JSON array.",
      });
    }

    let imageURL = existingUser.profileImage;
    if (file) {
      const uploadFolder = path.join("uploads", "consultants");

      const ext = path.extname(file.originalname);
      const fileName = `consultant-${Date.now()}${ext}`;
      const filePath = path.join(uploadFolder, fileName);

      // Async FS: writeFileSync blocked the entire event loop for the duration
      // of the write — up to the 2MB multer limit — stalling every other
      // in-flight request and socket event. Same bytes, same path.
      // `mkdir -p` is a no-op when the folder exists, so the existsSync check
      // it replaces was a redundant blocking stat.
      await fs.promises.mkdir(uploadFolder, { recursive: true });
      await fs.promises.writeFile(filePath, file.buffer);
      imageURL = `uploads/consultants/${fileName}`;
    }

    let hashedPassword = existingUser.password;
    if (body.password) {
      if (body.password.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters",
        });
      }
      hashedPassword = await bcrypt.hash(body.password, 10);
    }

    const updatedData = {
      fullname: body.fullName,
      email: body.email.toLowerCase().trim(),
      phone: body.phoneNumber,
      password: hashedPassword,
      profession: body.profession,
      specialization: body.specialization,
      licenseNo: body.licenseIdNumber,
      experience: String(body.yearOfExperience),
      language: languagesArray,
      displayName: body.displayName,
      gender: body.gender,
      houseNumber: body.houseNumber,
      streetArea: body.streetArea,
      landmark: body.landmark,
      address: body.address,
      pincode: body.pincode,
      dateOfBirth: new Date(body.dateOfBirth),
      pan_cardNumber: body.pancardNumber,
      profileImage: imageURL,
      voicePerMinute: body.voicePerMinute,
      videoPerMinute: body.videoPerMinute,
      chatPerMinute: body.chatPerMinute,
    };

    await User.findByIdAndUpdate(id, updatedData, { new: true });
    await invalidateConsultantList(existingUser.shop_id);

    return res.status(200).json({
      success: true,
      message: "Consultant updated successfully",
    });
  } catch (error) {
    console.error("Error in updateConsultantData:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

/**
 * login consultant
 * @param {login} req
 * @param {*} res
 * @returns
 */

const loginConsultant = async (request, response) => {
  try {
    const { email, password } = request.body;
    const find_User = await User.findOne({ email: String(email || "") });
    if (!find_User) {
      return response.status(400).send({
        success: false,
        message: "Incorrect email or password",
      });
    }

    // 2. Check block status
    if (find_User.consultantStatus === false) {
      console.log("Your account is blocked. Please contact administrator");
      return response.status(403).send({
        success: false,
        message: "Your account is blocked. Please contact administrator.",
      });
    }

    // 3. Compare password
    const isMatch = await bcrypt.compare(password, find_User.password);
    if (!isMatch) {
      console.log("Password does not match");
      return response.status(400).send({
        success: false,
        message: "Incorrect email or password",
      });
    }

    const token = jwt.sign(
      { id: find_User._id, role: "consultant" },
      process.env.JWT_SECRET_KEY,
      { expiresIn: "7d" },
    );

    const safeUser = find_User.toObject();
    delete safeUser.password;
    delete safeUser.firebaseToken;

    return response.status(200).send({
      success: true,
      message: "Login successful",
      token,
      userData: safeUser,
    });
  } catch (err) {
    return response.status(500).send({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

// ---------------- Forgot / reset password (consultant) ----------------
// Step 1: email a 6-digit OTP (hashed at rest, 10 min expiry). The response is
// identical whether or not the email exists, to prevent account enumeration.
const forgotConsultantPassword = async (request, response) => {
  const genericResponse = {
    success: true,
    message:
      "If this email is registered, a reset code has been sent. Please check your inbox.",
  };

  try {
    const email = String(request.body?.email || "").toLowerCase().trim();
    if (!email) {
      return response
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const consultant = await User.findOne({
      email,
      userType: "consultant",
    }).select("_id fullname email");

    if (!consultant) {
      return response.status(200).json(genericResponse);
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    consultant.resetPasswordOtpHash = await bcrypt.hash(otp, 10);
    consultant.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);
    consultant.resetPasswordAttempts = 0;
    await consultant.save();

    const {
      sendPasswordResetEmail,
    } = require("../MiddleWare/ShopifyMiddleware/nodemailer");
    const emailResult = await sendPasswordResetEmail({
      to: consultant.email,
      name: consultant.fullname,
      otp,
    });

    if (!emailResult?.sent) {
      console.error(
        "forgotConsultantPassword: email send failed:",
        emailResult?.error,
      );
      return response.status(500).json({
        success: false,
        message: "Could not send the reset email. Please try again later.",
      });
    }

    return response.status(200).json(genericResponse);
  } catch (error) {
    console.error("forgotConsultantPassword error:", error);
    return response
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};

// Step 2: verify the OTP and set the new password.
const resetConsultantPassword = async (request, response) => {
  try {
    const email = String(request.body?.email || "").toLowerCase().trim();
    const otp = String(request.body?.otp || "").trim();
    const newPassword = String(request.body?.newPassword || "");

    if (!email || !otp || !newPassword) {
      return response.status(400).json({
        success: false,
        message: "Email, code and new password are required",
      });
    }
    if (newPassword.length < 6) {
      return response.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const consultant = await User.findOne({
      email,
      userType: "consultant",
    }).select(
      "_id resetPasswordOtpHash resetPasswordExpires resetPasswordAttempts",
    );

    const invalidResponse = () =>
      response.status(400).json({
        success: false,
        message: "Invalid or expired reset code. Please request a new one.",
      });

    if (
      !consultant ||
      !consultant.resetPasswordOtpHash ||
      !consultant.resetPasswordExpires ||
      consultant.resetPasswordExpires < new Date()
    ) {
      return invalidResponse();
    }

    if ((consultant.resetPasswordAttempts || 0) >= 5) {
      consultant.resetPasswordOtpHash = null;
      consultant.resetPasswordExpires = null;
      await consultant.save();
      return response.status(429).json({
        success: false,
        message: "Too many attempts. Please request a new reset code.",
      });
    }

    const otpMatches = await bcrypt.compare(
      otp,
      consultant.resetPasswordOtpHash,
    );
    if (!otpMatches) {
      consultant.resetPasswordAttempts =
        (consultant.resetPasswordAttempts || 0) + 1;
      await consultant.save();
      return invalidResponse();
    }

    consultant.password = await bcrypt.hash(newPassword, 10);
    consultant.resetPasswordOtpHash = null;
    consultant.resetPasswordExpires = null;
    consultant.resetPasswordAttempts = 0;
    await consultant.save();

    return response.status(200).json({
      success: true,
      message: "Password updated. You can now log in with your new password.",
    });
  } catch (error) {
    console.error("resetConsultantPassword error:", error);
    return response
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};

const updateConsultantStatus = async (request, response) => {
  try {
    const { id } = request.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.status(400).json({ message: "Invalid consultant ID" });
    }
    if (!id) {
      return response
        .status(400)
        .json({ message: "Consultant ID is required" });
    }
    const consultant = await User.findById(id);
    if (!consultant) {
      return response.status(404).json({ message: "Consultant not found" });
    }

    if (!(await assertConsultantInAdminShop(request, response, id))) return;

    // Toggle ONLY consultantStatus
    consultant.consultantStatus = !consultant.consultantStatus;
    await consultant.save();
    await invalidateConsultantList(consultant.shop_id);
    return response.status(200).send({
      success: true,
      message: "Status updated successfully",
      status: consultant.consultantStatus,
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ message: "Server error" });
  }
};

const getConsultantById = async (request, response) => {
  try {
    const { id } = request.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.status(400).json({
        message: "Invalid consultant ID",
      });
    }

    const consultant = await User.findOne(
      { _id: id, userType: "consultant" },
      "fullname email displayName profileImage profession specialization experience language voicePerMinute videoPerMinute chatPerMinute isActive isBusy consultantStatus rating shop_id agoraUid phone licenseNo gender houseNumber streetArea landmark address pincode dateOfBirth pan_cardNumber",
    );

    if (!consultant) {
      return response.status(404).json({
        message: "Consultant not found",
      });
    }

    const consultantData = {
      ...consultant._doc,
      profileImage: consultant.profileImage
        ? `${request.protocol}://${request.get("host")}/${consultant.profileImage.replace(/\\/g, "/")}`
        : null,
    };
    return response.status(200).json({
      success: true,
      consultant: consultantData,
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({
      message: "Server error",
    });
  }
};

const getConsultantHistory = async (request, response) => {
  try {
    const { id } = request.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.status(400).json({ message: "Invalid consultant ID" });
    }
    if (!id) {
      return response
        .status(400)
        .json({ message: "Consultant ID is required" });
    }

    if (!(await assertConsultantInAdminShop(request, response, id))) return;

    // Only these six fields are read below; `transcript`/`recordingUrl` can be
    // large, so never pull them over the wire for a list view.
    const history = await Conversation.find({ consultantId: id })
      .select("userId userSnapshot type startTime endTime durationSeconds")
      .lean();
    const userHistory = [];
    for (const item of history) {
      userHistory.push({
        userId: item.userId,
        user: item.userSnapshot,
        type: item.type,
        startTime: item.startTime,
        endTime: item.endTime,
        durationSeconds: item.durationSeconds,
      });
    }
    return response.status(200).send({ success: true, userHistory });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ message: "Server error" });
  }
};

const getConsultantAllUser = async (request, response) => {
  try {
    const { id } = request.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.status(400).json({ message: "Invalid consultant ID" });
    }
    if (!id) {
      return response
        .status(400)
        .json({ message: "Consultant ID is required" });
    }

    if (!(await assertConsultantInAdminShop(request, response, id))) return;

    const consultantUser = await Conversation.find({ consultantId: id })
      .select("userId userSnapshot type startTime endTime durationSeconds")
      .lean();
    const userData = [];
    for (const item of consultantUser) {
      userData.push({
        userId: item.userId,
        user: item.userSnapshot,
        type: item.type,
        startTime: item.startTime,
        endTime: item.endTime,
        durationSeconds: item.durationSeconds,
      });
    }

    if (!consultantUser) {
      return response
        .status(400)
        .json({ message: "Consultant user not found" });
    }
    return response.status(200).send({ success: true, userData });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ message: "Server error" });
  }
};

const getConsultantAllUserHistory = async (request, response) => {
  try {
    const shopDoc = await shopModel.findOne({ shop: request.shop }).select("_id");
    if (!shopDoc) {
      return response.status(404).json({ message: "Shop not found" });
    }

    const shopConsultants = await User.find({
      shop_id: shopDoc._id,
      userType: "consultant",
    })
      .select("_id")
      .lean();
    const consultantIds = shopConsultants.map((c) => c._id);

    const historyConsultantUser = await Conversation.find({
      consultantId: { $in: consultantIds },
    }).lean();
    if (!historyConsultantUser) {
      return response
        .status(400)
        .json({ message: "History consultant user not found" });
    }
    return response.status(200).send({ success: true, historyConsultantUser });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ message: "Server error" });
  }
};

/**
 * delete consultant
 * @param {string} id
 * @returns {Promise<{success: boolean, message: string}>}
 */
const deleteConsultant = async (request, response) => {
  try {
    const { id } = request.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return response.status(400).json({ message: "Invalid consultant ID" });
    }
    if (!id) {
      return response
        .status(400)
        .json({ message: "Consultant ID is required" });
    }

    if (!(await assertConsultantInAdminShop(request, response, id))) return;

    const deleteConsultant = await User.findByIdAndDelete(id);
    // console.log("deleteConsultant", deleteConsultant);
    if (!deleteConsultant) {
      return response.status(400).json({ message: "Consultant not found" });
    }
    // findByIdAndDelete returns the removed doc — read shop_id off it rather
    // than paying an extra lookup just to build the cache key.
    await invalidateConsultantList(deleteConsultant.shop_id);
    return response
      .status(200)
      .send({ success: true, message: "Consultant deleted successfully" });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ message: "Server error" });
  }
};

/**
 * get consultant by shop id and consultant id
 * @param {string} shop_id
 * @returns {Promise<{success: boolean, message: string, consultants: User[]}>}
 */

// Shared query, extracted so the existing REST endpoint below and the new
// App Proxy JSON endpoint (shopifyController.proxyConsultantProfileJson)
// fetch the exact same consultant the exact same way — no second, slightly
// different query. Callers decide what's safe to forward to a browser;
// this returns the full Mongoose document as selected here.
const getConsultantProfileForShop = async (shop_id, consultant_id) => {
  // Only ever selects storefront-plausible fields — never password/
  // firebaseToken/PAN/etc. walletBalance is intentionally selected here
  // (existing admin/consultant-dashboard callers may rely on it) but the
  // App Proxy endpoint strips it before responding — that's the one that
  // reaches an anonymous storefront visitor.
  return User.findOne(
    { _id: consultant_id, shop_id: shop_id, userType: "consultant" },
    "fullname displayName profileImage profession specialization experience language voicePerMinute videoPerMinute chatPerMinute isActive isBusy consultantStatus shop_id agoraUid bio walletBalance",
  );
};

const getConsultantByShopIdAndConsultantId = async (request, response) => {
  try {
    const { shop_id, consultant_id } = request.params;
    console.log("shop_id, consultant_id", shop_id, consultant_id)
    if (!mongoose.Types.ObjectId.isValid(shop_id)) {
      return response.status(400).json({ message: "Invalid shop ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(consultant_id)) {
      return response.status(400).json({ message: "Invalid consultant ID" });
    }
    if (!consultant_id || !shop_id) {
      return response
        .status(400)
        .json({ message: "Consultant Shop  ID is required" });
    }

    const consultant = await getConsultantProfileForShop(shop_id, consultant_id);

    return response.status(200).send({ success: true, consultant });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ message: "Server error" });
  }
};

/**
 * get chat list by shop id and consultant id
 * @param {string} shop_id
 * @param {string} consultant_id
 * @returns {Promise<{success: boolean, message: string, chatList: ChatList[]}>}
 */

const getChatListByShopIdAndConsultantId = async (request, response) => {
  try {
    const { shop_id, consultant_id } = request.params;
    if (!mongoose.Types.ObjectId.isValid(shop_id)) {
      return response.status(400).json({ message: "Invalid shop ID" });
    }

    if (!(await assertConsultantSelf(request, response, consultant_id))) return;
    if (!(await assertAuthenticatedUserShop(request, response, shop_id))) return;

    const chatList = await ChatList.find({
      shop_id: shop_id,
      receiverId: consultant_id,
    })
      .populate("senderId", "fullname profileImage email isActive isChatAccepted")
      .populate("receiverId", "fullname profileImage")
      .populate("shop_id", "shop")
      .sort({ updatedAt: -1 })
      .lean();
    if (!chatList) {
      return response.status(400).json({ message: "Chat list not found" });
    }

    // Per-sender unread counts in ONE aggregate (not N queries) so the
    // consultant's inbox can show which users have new messages.
    const senderObjectIds = chatList
      .map((item) => item.senderId?._id)
      .filter(Boolean);
    const unreadRows = senderObjectIds.length
      ? await MessageModal.aggregate([
        {
          $match: {
            shop_id: new mongoose.Types.ObjectId(String(shop_id)),
            receiverId: new mongoose.Types.ObjectId(String(consultant_id)),
            isRead: false,
            senderId: { $in: senderObjectIds },
          },
        },
        { $group: { _id: "$senderId", count: { $sum: 1 } } },
      ])
      : [];
    const unreadMap = new Map(
      unreadRows.map((row) => [String(row._id), row.count]),
    );

    const payload = chatList.map((item) => {
      return {
        chatListId: item._id,

        sender: {
          id: item.senderId?._id,
          fullname: item.senderId?.fullname,
          profileImage: item.senderId?.profileImage,
          email: item.senderId?.email,
          isActive: item.senderId?.isActive,
        },

        receiver: {
          id: item.receiverId?._id,
          fullname: item.receiverId?.fullname,
          profileImage: item.receiverId?.profileImage,
        },

        shop: {
          id: item.shop_id?._id,
          shop: item.shop_id?.shop,
        },
        isRequest: item.isRequest,
        lastMessage: item.lastMessage,
        isChatAccepted: item.senderId?.isChatAccepted,
        unreadCount: unreadMap.get(String(item.senderId?._id)) || 0,
        updatedAt: item.updatedAt,
        createdAt: item.createdAt,
      };
    });

    return response
      .status(200)
      .send({
        success: true,
        message: "Chat list fetched successfully",
        payload,
      });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ message: "Server error" });
  }
};

// remove chat list  and consultant id from chat list

const removeChatListAndConsultantIdFromChatList = async (req, res) => {
  try {
    const { id, senderId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(senderId)
    ) {
      return res.status(400).json({ message: "Invalid chat list ID" });
    }
    if (!id || !senderId) {
      return res.status(400).json({ message: "Chat list ID is required" });
    }

    const chatList = await ChatList.findById(id);
    if (!chatList) {
      return res.status(404).json({ message: "Chat list not found" });
    }

    const authUserId = req.user?.id ? String(req.user.id) : null;
    const isConsultant = authUserId && String(chatList.receiverId) === authUserId;
    const isCustomer = authUserId && String(chatList.senderId) === authUserId;

    if (!authUserId || (!isConsultant && !isCustomer)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    if (String(chatList.senderId) !== String(senderId)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const updateUserChatRequest = await User.findById(senderId);
    if (!updateUserChatRequest) {
      return res.status(400).json({ message: "User not found" });
    }
    updateUserChatRequest.isChatAccepted = "chatEnd";
    await updateUserChatRequest.save();

    const deletedChatList = await ChatList.findByIdAndDelete(id);
    if (!deletedChatList) {
      return res.status(400).json({ message: "Chat list not found" });
    }
    return res
      .status(200)
      .json({ success: true, message: "Chat list removed successfully" });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ message: "Server error" });
  }
};

const getConsultantAllUsers = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid consultant ID",
      });
    }

    if (!(await assertConsultantSelf(req, res, id))) return;

    const chats = await ConsultantClient.find({
      consultantId: id,
    })
      .populate({
        path: "userId",
        match: { userType: "customer" },
        select: "fullname email phone userType profileImage isActive walletBalance",
      })

      .sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      message: "Consultant users fetched successfully",
      payload: chats,
    });
  } catch (error) {
    console.error("getConsultantAllUsers error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
const updateConsultantProfileStoreFront = async (req, res) => {
  try {
    const { consultantId, shopId, name, email, phone, gender, bio } = req.body;
    const file = req.file;

    if (typeof bio === "string" && bio.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Bio must be 1000 characters or fewer",
      });
    }

    if (
      !consultantId ||
      !mongoose.Types.ObjectId.isValid(consultantId) ||
      !shopId ||
      !mongoose.Types.ObjectId.isValid(shopId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid consultant ID or shop ID",
      });
    }
    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    if (!(await assertConsultantSelf(req, res, consultantId))) return;
    if (!(await assertAuthenticatedUserShop(req, res, shopId))) return;

    const existingConsultant = await User.findById(consultantId);
    if (!existingConsultant) {
      return res.status(404).json({
        success: false,
        message: "Consultant not found",
      });
    }

    // Changing email to one already used by ANOTHER account would hit the
    // unique index (E11000) and surface as a 500 — catch it up front.
    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail !== String(existingConsultant.email || "").toLowerCase()) {
      const emailTaken = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: consultantId },
      })
        .select("_id")
        .lean();
      if (emailTaken) {
        return res.status(400).json({
          success: false,
          message: "This email is already in use by another account.",
        });
      }
    }

    const isphoneNumber = validatePhone(phone)
    if (!isphoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format",
      });
    }


    let imageURL = existingConsultant.profileImage;
    if (file) {
      // BUGFIX: `uploadFolder` was never declared in this function — it only
      // existed as a local in consultantController/updateConsultantData. Any
      // profile update WITH an image threw `ReferenceError: uploadFolder is not
      // defined` and fell into the catch as a 500. Same path the other two
      // upload sites use.
      const uploadFolder = path.join("uploads", "consultants");

      const ext = path.extname(file.originalname);
      const fileName = `consultant-${Date.now()}${ext}`;
      const filePath = path.join(uploadFolder, fileName);

      // Async FS — see updateConsultantData above.
      await fs.promises.mkdir(uploadFolder, { recursive: true });
      await fs.promises.writeFile(filePath, file.buffer);
      imageURL = `uploads/consultants/${fileName}`;
    }
    await User.findByIdAndUpdate(
      consultantId,
      {
        fullname: name,
        email: normalizedEmail,
        phone: phone,
        gender: gender,
        profileImage: imageURL,
        ...(typeof bio === "string" ? { bio: bio.trim() } : {}),
      },
      { new: true },
    );
    await invalidateConsultantList(shopId);

    return res.status(200).json({
      success: true,
      message: "Consultant profile updated successfully",
    });
  } catch (error) {
    console.error("Error in updateConsultantProfileStoreFront:", error);
    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "This email is already in use by another account.",
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

const getUserConversationControllerConsultant = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    if (!(await assertConsultantSelf(req, res, id))) return;

    const conversations = await TransactionHistroy.find({
      $or: [{ senderId: id }, { receiverId: id }],
    })
      .populate("senderId", "fullname email")
      .populate("receiverId", "fullname email")
      .sort({ createdAt: -1 })
      .lean();

    // `.lean()` docs are already plain objects, so the `.toObject()` call this
    // used to make (which hydrated a full Mongoose document per row first) is
    // redundant — the spread produces an identical payload.
    // populate() yields null for deleted users, so both sides must be
    // null-safe or a single orphaned row 500s the whole endpoint.
    const final = conversations
      .map((c) => {
        const senderKey = String(c.senderId?._id || c.senderId || "");
        const user = senderKey === id ? c.receiverId : c.senderId;

        return {
          ...c,
          user: user || null,
        };
      })
      .filter((c) => c.user);

    res.json({ success: true, data: final });
  } catch (error) {
    console.error("find-user-chat-logs failed:", error);
    return res
      .status(500)
      .send({ success: false, message: "Somthing went wrong " });
  }
};
/**
 * Authenticated self-profile for the consultant dashboard. The public
 * storefront endpoint intentionally never exposes walletBalance, so the
 * dashboard reads it from here instead.
 */
const getConsultantSelfOverview = async (req, res) => {
  try {
    const { consultantId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(consultantId)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }
    if (!(await assertConsultantSelf(req, res, consultantId))) return;

    const consultant = await User.findOne({
      _id: consultantId,
      userType: "consultant",
    })
      .select("walletBalance shop_id fullname email phone gender bio profileImage")
      .lean();

    if (!consultant) {
      return res
        .status(404)
        .json({ success: false, message: "Consultant not found" });
    }

    const shopDoc = await shopModel
      .findById(consultant.shop_id)
      .select("currency currencyCode")
      .lean();

    return res.json({
      success: true,
      data: {
        walletBalance: Number(consultant.walletBalance) || 0,
        currency: shopDoc?.currency || shopDoc?.currencyCode || "$",
        fullname: consultant.fullname || "",
        email: consultant.email || "",
        phone: consultant.phone || "",
        gender: consultant.gender || "",
        bio: consultant.bio || "",
        profileImage: consultant.profileImage || null,
      },
    });
  } catch (error) {
    console.error("consultant self overview failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getConsultantWalletHistroy = async (req, res) => {
  try {
    const { userId, shopId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(shopId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    if (!(await assertConsultantSelf(req, res, userId))) return;
    if (!(await assertAuthenticatedUserShop(req, res, shopId))) return;

    const wallet = await WalletHistory.find({
      userId,
      shop_id: shopId,
    })
      .populate("userId", "fullname email")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const WithdrawalRequestController = async (req, res) => {
  try {
    const { consultantId, shopId } = req.params;
    const { amount, note } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(consultantId) ||
      !mongoose.Types.ObjectId.isValid(shopId)
    ) {
      return res.status(400).send({ message: "Invalid Id" });
    }

    if (!(await assertConsultantSelf(req, res, consultantId))) return;
    if (!(await assertAuthenticatedUserShop(req, res, shopId))) return;

    const consultant = await User.findById(consultantId);
    if (!consultant) {
      return res.status(404).send({ message: "Consultant not found" });
    }
    if (consultant.walletBalance < amount) {
      return res.status(400).send({ message: "Insufficient balance" });
    }
    consultant.walletBalance -= amount;
    await consultant.save();
    const reqSave = await WithdrawalRequestSchema.create({
      consultantId,
      shopId,
      note,
      amount,
      status: "pending",
    });

    return res.status(201).send({
      success: true,
      message: "Withdrawal request submitted",
      data: reqSave,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      success: false,
      message: "Server error",
    });
  }
};
const getWithdrawalRequest = async (req, res) => {
  try {
    const { consultantId } = req.params;
    console.log("adminId", consultantId);
    if (!mongoose.Types.ObjectId.isValid(consultantId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertConsultantSelf(req, res, consultantId))) return;

    const widthrawal = await WithdrawalRequestSchema.find({
      consultantId: consultantId,
    })
      .populate("consultantId", "fullname email")
      .sort({ createdAt: -1 })
      .limit(10);

    if (!widthrawal) return;
    return res.status(200).json({
      success: true,
      message: "App status retrieved successfully",
      data: widthrawal,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

//----------------------- get monthly revenu -----------------------------------------

const getMonthlyRevenueController = async (req, res) => {
  try {
    const { shop_id, consultantId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(shop_id)) {
      return res.status(400).json({ message: "Invalid shop ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(consultantId)) {
      return res.status(400).json({ message: "Invalid consultant ID" });
    }

    if (!(await assertConsultantSelf(req, res, consultantId))) return;
    if (!(await assertAuthenticatedUserShop(req, res, shop_id))) return;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const lastMonth = lastMonthDate.getMonth();
    const lastMonthYear = lastMonthDate.getFullYear();

    const transactions = await TransactionHistroy.find({
      shop_id,
      status: "completed",
      $or: [{ senderId: consultantId }, { receiverId: consultantId }],
    }).lean();

    let currentMonthRevenue = 0;
    let lastMonthRevenue = 0;
    let totalIncome = 0;

    transactions.forEach((tx) => {
      const txDate = new Date(tx.createdAt);
      const amount = Number(tx.consultantAmount) || 0; // ✅ IMPORTANT

      // total income (all time)
      totalIncome += amount;

      // current month
      if (
        txDate.getMonth() === currentMonth &&
        txDate.getFullYear() === currentYear
      ) {
        currentMonthRevenue += amount;
      }

      // last month
      if (
        txDate.getMonth() === lastMonth &&
        txDate.getFullYear() === lastMonthYear
      ) {
        lastMonthRevenue += amount;
      }
    });

    const percentageChange =
      lastMonthRevenue === 0
        ? 0
        : ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;

    return res.status(200).json({
      success: true,
      data: {
        currentMonthRevenue: Number(currentMonthRevenue.toFixed(2)),
        lastMonthRevenue: Number(lastMonthRevenue.toFixed(2)),
        totalIncome: Number(totalIncome.toFixed(2)),
        percentageChange: Number(percentageChange.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Monthly revenue error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const tokenVerifyController = async (req, res) => {
  try {
    // Token is already verified by middleware. Return the FULL server-derived
    // identity (not just the JWT payload) so the frontend can restore its
    // session from the backend instead of trusting browser storage.
    const authUserId = await resolveAuthenticatedUserId(req);
    if (!authUserId || !mongoose.Types.ObjectId.isValid(authUserId)) {
      return res.status(401).json({
        success: false,
        message: "Token verification failed",
      });
    }

    const account = await User.findById(authUserId)
      .select("fullname email profileImage userType shop_id")
      .lean();
    if (!account) {
      return res.status(401).json({
        success: false,
        message: "Account not found",
      });
    }

    // This endpoint authenticates the CONSULTANT dashboard. A customer's JWT
    // (stored under the same browser key) must NOT verify here — accepting it
    // caused an infinite login ↔ dashboard redirect loop on the storefront.
    if (account.userType !== "consultant") {
      return res.status(401).json({
        success: false,
        message: "Not a consultant account",
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        ...req.user,
        id: String(account._id),
        shopId: account.shop_id ? String(account.shop_id) : null,
        name: account.fullname || "",
        email: account.email || "",
        role: account.userType || null,
        profileImage: account.profileImage || null,
      },
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      message: "Token verification failed",
    });
  }
};

// Core create logic, parametrized by an already-resolved authUserId — reused
// by both the Bearer-token route below (submitConsultantSupportRequest,
// used by the Consultant Dashboard) and the App-Proxy storefront route
// (proxySubmitSupportRequestJson in shopifyController.js, used by the
// customer-facing My Profile Theme Extension block), so the actual request
// logic/validation/email-send only exists once.
const createSupportRequestCore = async (authUserId, { subject, message, shopId, isDummyAccount }, res) => {
  try {
    const cleanSubject = String(subject || "").trim();
    const cleanMessage = String(message || "").trim();

    if (!cleanSubject || !cleanMessage) {
      return res.status(400).json({
        success: false,
        message: "Subject and message are required",
      });
    }

    if (cleanSubject.length > 200 || cleanMessage.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Subject or message is too long",
      });
    }

    const consultant = await User.findById(authUserId).select(
      "_id fullname email shop_id userType profession",
    );

    // Storefront customers may also raise support requests to the shop admin —
    // same collection, so the admin inbox shows every query in one place.
    if (
      !consultant ||
      !["consultant", "customer"].includes(consultant.userType)
    ) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }
    const requesterType =
      consultant.userType === "customer" ? "user" : "consultant";

    const resolvedShopId = String(shopId || consultant.shop_id || "");
    if (!mongoose.Types.ObjectId.isValid(resolvedShopId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop ID",
      });
    }

    if (!(await userBelongsToShop(authUserId, resolvedShopId))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const shopDoc = await shopModel
      .findById(resolvedShopId)
      .select("shop email");

    if (!shopDoc) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    const { sendSupportEmail } = require("../MiddleWare/ShopifyMiddleware/nodemailer");
    const emailResult = shopDoc.email
      ? await sendSupportEmail({
        to: shopDoc.email,
        consultantName: consultant.fullname,
        consultantEmail: consultant.email,
        shop: shopDoc.shop,
        subject: cleanSubject,
        message: cleanMessage,
        isDummyAccount: Boolean(isDummyAccount),
      })
      : { sent: false, error: "Shop admin email is not configured" };

    await ConsultantSupportRequest.create({
      consultantId: consultant._id,
      shopId: shopDoc._id,
      subject: cleanSubject,
      message: cleanMessage,
      requesterType,
      isDummyAccount: Boolean(isDummyAccount),
      consultantName: consultant.fullname,
      consultantEmail: consultant.email,
      shopDomain: shopDoc.shop,
      adminEmail: shopDoc.email || null,
      emailSent: Boolean(emailResult?.sent),
      emailError: emailResult?.sent ? null : emailResult?.error || null,
      status: "open",
      adminHasUnread: true,
      consultantHasUnreadReply: false,
    });

    if (emailResult?.sent) {
      return res.status(200).json({
        success: true,
        message: "Support request sent to shop admin",
        emailSent: true,
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Support request saved. Admin email could not be sent right now, but your request has been recorded.",
      emailSent: false,
    });
  } catch (error) {
    console.error("submitConsultantSupportRequest error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send support request",
    });
  }
};

// Bearer-token entry point (Consultant Dashboard) — unchanged behavior,
// just delegates to the shared core above.
const submitConsultantSupportRequest = async (req, res) => {
  const authUserId = await resolveAuthenticatedUserId(req);
  if (!authUserId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }
  return createSupportRequestCore(authUserId, req.body || {}, res);
};

// Core list logic, parametrized by an already-resolved authUserId — see
// createSupportRequestCore's comment for why this split exists.
const listSupportRequestsCore = async (authUserId, res) => {
  try {
    const requests = await ConsultantSupportRequest.find({
      consultantId: authUserId,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: requests,
      unreadCount: requests.filter((item) => item.consultantHasUnreadReply).length,
    });
  } catch (error) {
    console.error("getConsultantSupportRequests error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch support requests",
    });
  }
};

// Bearer-token entry point (Consultant Dashboard) — unchanged behavior.
const getConsultantSupportRequests = async (req, res) => {
  const authUserId = await resolveAuthenticatedUserId(req);
  if (!authUserId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  return listSupportRequestsCore(authUserId, res);
};

const getConsultantNotifications = async (request, response) => {
  try {
    const { shop_id, consultant_id } = request.params;

    if (!mongoose.Types.ObjectId.isValid(shop_id)) {
      return response.status(400).json({ message: "Invalid shop ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(consultant_id)) {
      return response.status(400).json({ message: "Invalid consultant ID" });
    }
    if (!(await assertConsultantSelf(request, response, consultant_id))) return;
    if (!(await assertAuthenticatedUserShop(request, response, shop_id))) return;

    const consultantObjectId = new mongoose.Types.ObjectId(consultant_id);
    const shopObjectId = new mongoose.Types.ObjectId(shop_id);

    const [missedCalls, unreadMessageGroups] = await Promise.all([
      missCalled
        .find({
          receiverId: consultant_id,
          isRead: { $ne: true },
        })
        .populate("senderId", "fullname profileImage")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      MessageModal.aggregate([
        {
          $match: {
            receiverId: consultantObjectId,
            shop_id: shopObjectId,
            isRead: false,
          },
        },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$senderId",
            lastMessage: { $first: "$text" },
            createdAt: { $first: "$timestamp" },
            messageId: { $first: "$_id" },
            unreadCount: { $sum: 1 },
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 20 },
      ]),
    ]);

    const senderIds = unreadMessageGroups.map((item) => item._id);
    const senders = senderIds.length
      ? await User.find({ _id: { $in: senderIds } })
        .select("fullname profileImage")
        .lean()
      : [];
    const senderMap = new Map(senders.map((user) => [String(user._id), user]));

    const messageNotifications = unreadMessageGroups.map((item) => {
      const sender = senderMap.get(String(item._id));
      return {
        id: String(item.messageId),
        type: "message",
        userId: String(item._id),
        shopId: shop_id,
        title: sender?.fullname || "User",
        message:
          item.unreadCount > 1
            ? `${item.lastMessage} (${item.unreadCount} unread)`
            : item.lastMessage,
        unreadCount: item.unreadCount,
        createdAt: item.createdAt,
        profileImage: sender?.profileImage || null,
      };
    });

    const callNotifications = missedCalls.map((item) => {
      const callLabel =
        item.type === "video" ? "Missed video call" : "Missed voice call";
      const reasonLabel =
        item.reason === "rejected"
          ? "Call was declined"
          : "Call was not answered";

      return {
        id: String(item._id),
        type: "missed_call",
        userId: String(item.senderId?._id || item.senderId),
        shopId: shop_id,
        title: item.senderId?.fullname || "User",
        message: `${callLabel} · ${reasonLabel}`,
        callType: item.type || "voice",
        reason: item.reason || "timeout",
        createdAt: item.createdAt,
        profileImage: item.senderId?.profileImage || null,
      };
    });

    const notifications = [...messageNotifications, ...callNotifications].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );

    const unreadCount =
      messageNotifications.reduce(
        (total, item) => total + Number(item.unreadCount || 1),
        0,
      ) + callNotifications.length;

    return response.status(200).json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error("getConsultantNotifications error:", error);
    return response.status(500).json({ message: "Server error" });
  }
};

const markConsultantNotificationsRead = async (request, response) => {
  try {
    const { shop_id, consultant_id } = request.params;
    const { type, ids = [], userId, markAll = false } = request.body || {};

    if (!mongoose.Types.ObjectId.isValid(shop_id)) {
      return response.status(400).json({ message: "Invalid shop ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(consultant_id)) {
      return response.status(400).json({ message: "Invalid consultant ID" });
    }
    if (!(await assertConsultantSelf(request, response, consultant_id))) return;
    if (!(await assertAuthenticatedUserShop(request, response, shop_id))) return;

    if (markAll) {
      await Promise.all([
        MessageModal.updateMany(
          {
            receiverId: consultant_id,
            shop_id,
            isRead: false,
          },
          { $set: { isRead: true } },
        ),
        missCalled.updateMany(
          { receiverId: consultant_id, isRead: { $ne: true } },
          { $set: { isRead: true } },
        ),
      ]);
      return response.status(200).json({ success: true });
    }

    if (type === "message") {
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        await MessageModal.updateMany(
          {
            receiverId: consultant_id,
            senderId: userId,
            shop_id,
            isRead: false,
          },
          { $set: { isRead: true } },
        );
      } else if (Array.isArray(ids) && ids.length > 0) {
        await MessageModal.updateMany(
          {
            _id: { $in: ids },
            receiverId: consultant_id,
            shop_id,
          },
          { $set: { isRead: true } },
        );
      }
    }

    if (type === "missed_call" && Array.isArray(ids) && ids.length > 0) {
      await missCalled.updateMany(
        {
          _id: { $in: ids },
          receiverId: consultant_id,
        },
        { $set: { isRead: true } },
      );
    }

    return response.status(200).json({ success: true });
  } catch (error) {
    console.error("markConsultantNotificationsRead error:", error);
    return response.status(500).json({ message: "Server error" });
  }
};

// Core mark-read logic, parametrized by an already-resolved authUserId —
// see createSupportRequestCore's comment for why this split exists.
const markSupportReplyReadCore = async (authUserId, requestId, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid request ID" });
    }

    await ConsultantSupportRequest.findOneAndUpdate(
      { _id: requestId, consultantId: authUserId },
      { $set: { consultantHasUnreadReply: false } },
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("markConsultantSupportReplyRead error:", error);
    return res.status(500).json({ success: false, message: "Failed to update request" });
  }
};

// Bearer-token entry point (Consultant Dashboard) — unchanged behavior.
const markConsultantSupportReplyRead = async (req, res) => {
  const authUserId = await resolveAuthenticatedUserId(req);
  if (!authUserId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  return markSupportReplyReadCore(authUserId, req.params.requestId, res);
};

module.exports = {
  consultantController,
  updateConsultantData,
  updateConsultantStatus,
  getConsultantById,
  getConsultantHistory,
  getConsultantAllUser,
  getConsultantAllUserHistory,
  deleteConsultant,
  getConsultantByShopIdAndConsultantId,
  getConsultantProfileForShop,
  loginConsultant,
  forgotConsultantPassword,
  resetConsultantPassword,
  getChatListByShopIdAndConsultantId,
  removeChatListAndConsultantIdFromChatList,
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
  createSupportRequestCore,
  listSupportRequestsCore,
  markSupportReplyReadCore,
  getConsultantNotifications,
  markConsultantNotificationsRead,
};
