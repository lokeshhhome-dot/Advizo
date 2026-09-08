const express = require("express");
const callRoutes = express.Router();
const { generateToken, generateVoiceToken, getCaller_Receiver_Details, endActiveCall } = require("../Controller/videoCallController");
const { optionalAuthenticateToken, authenticateToken } = require("../Auth/signup-signin");

callRoutes.post("/generate-token", authenticateToken, generateToken);
callRoutes.post("/generate-voice-token", authenticateToken, generateVoiceToken);
callRoutes.post("/end-session", optionalAuthenticateToken, endActiveCall);
callRoutes.get("/get-caller-receiver-details/:callerId/:receiverId", optionalAuthenticateToken, getCaller_Receiver_Details);

module.exports = { callRoutes };
