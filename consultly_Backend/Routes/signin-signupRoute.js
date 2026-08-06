const express = require("express");
const signinSignupRouter = express.Router();
const { signUp, signIn, authenticateToken } = require("../Auth/signup-signin");

signinSignupRouter.post("/signup", signUp);
signinSignupRouter.post("/signin", signIn);
signinSignupRouter.get("/token-verify", authenticateToken, (req, res) => res.json({ ok: true, user: req.user }));

module.exports = {signinSignupRouter};   