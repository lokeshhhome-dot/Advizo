// mongoose
const mongoose = require("mongoose")
require("dotenv").config()

const url = process.env.MONGO_DB_URL

// Tuned for a single PM2 process talking to Atlas.
// maxPoolSize governs how many operations can be in flight at once; the driver
// default of 100 is far more than one Node process can usefully saturate and
// just adds connection churn on the Atlas side. minPoolSize keeps warm sockets
// so the first request after an idle period doesn't pay TCP+TLS setup (~100ms+
// to Atlas). Values are env-overridable so they can be tuned without a deploy.
const connectionOptions = {
   maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 50),
   minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 5),

   // Fail fast instead of hanging a request for 30s when the primary is
   // unreachable — the socket handler and Express both surface errors sooner.
   serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
   socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000),

   // Drop sockets that have been idle long enough that a NAT/LB has likely
   // silently dropped them, rather than discovering it mid-query.
   maxIdleTimeMS: Number(process.env.MONGO_MAX_IDLE_TIME_MS || 60000),

   // Wire-protocol compression. Payloads here are mostly text (names, chat
   // messages, transaction docs) which compress well, so this cuts bytes over
   // the wire to Atlas at negligible CPU cost.
   compressors: ["zlib"],
}

const connectDB = () => {
   if (!url) {
      console.error("MongoDB URL not found in environment variables");
      return;
   }
   return mongoose.connect(url, connectionOptions)
      .then(() => {
         console.log("MongoDB connected successfully");
      })
      .catch(err => {
         console.error("MongoDB connection error:", err);
         process.exit(1);
      });
}

module.exports = { connectDB }
