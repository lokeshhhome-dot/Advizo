const express = require("express")
const { pricingCallback } = require("../Controller/adminPrincingController")
const adminPrincingRoute = express.Router()


adminPrincingRoute.get("/admin/princing-callback", pricingCallback)
adminPrincingRoute.get("/2", pricingCallback)
adminPrincingRoute.get("/1", pricingCallback)


module.exports = { adminPrincingRoute }