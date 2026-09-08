const { firebaseGetToken } = require("../Controller/firebaseController");
const express = require("express");
const { optionalAuthenticateToken } = require("../Auth/signup-signin");
const firebaseRouter = express.Router();

firebaseRouter.post("/save-fcm-token", optionalAuthenticateToken, firebaseGetToken);

module.exports = firebaseRouter;
