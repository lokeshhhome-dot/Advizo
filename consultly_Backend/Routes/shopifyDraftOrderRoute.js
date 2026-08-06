const express = require('express');
const { createDraftOrder } = require('../Controller/shopifyDraftOrderController');
const { optionalAuthenticateToken } = require('../Auth/signup-signin');
const shopifyDraftOrderRoute = express.Router();

shopifyDraftOrderRoute.post('/create-draft-order', optionalAuthenticateToken, createDraftOrder);

module.exports = { shopifyDraftOrderRoute };
