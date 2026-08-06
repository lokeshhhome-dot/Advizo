const express = require('express');
const { createOrderController, verifyPaymentController } = require('../Controller/razerPayController');
const { authenticateToken } = require('../Auth/signup-signin');
const razerPayRoute = express.Router();


razerPayRoute.post("/create-order", authenticateToken, createOrderController);
razerPayRoute.post("/verify-payment", authenticateToken, verifyPaymentController);

module.exports = { razerPayRoute };