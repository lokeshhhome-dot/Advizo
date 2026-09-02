const express = require("express");
const ratingRoutes = express.Router();
const {
  submitRating,
  getRatingForConsultation,
} = require("../Controller/ratingController");
const { authenticateToken } = require("../Auth/signup-signin");

// Both require a real authenticated customer — never an anonymous/optional
// token — since a rating is always tied to a specific identity.
ratingRoutes.post("/", authenticateToken, submitRating);
ratingRoutes.get("/consultation/:consultationId", authenticateToken, getRatingForConsultation);

module.exports = { ratingRoutes };
