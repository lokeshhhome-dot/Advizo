const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const http = require("http");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const { connectDB } = require("./Utils/db"); dotenv.config();
const { initRedis } = require("./Utils/redis");
connectDB();

initRedis();
const path = require("path");
const app = express();
const PORT = process.env.ADVIZO_BACKEND_PORT
const server = http.createServer(app);
const { ioServer } = require("./server-io");
const shopifyRoute = require("./Routes/shopifyRoute");
const { webHookRoute } = require("./Routes/webHookRoute");

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors https://*.myshopify.com https://admin.shopify.com;"
  );
  next();
});

const CORS_ALLOWLIST = [
  ...String(process.env.APP_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  String(process.env.APP_URL || "").trim().replace(/\/+$/, ""),
  String(process.env.APP_URL || "").trim().replace(/\/+$/, ""),
].filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const clean = origin.replace(/\/+$/, "");
      let host = "";
      try {
        host = new URL(origin).host;
      } catch (_) { }
      const allowed =
        CORS_ALLOWLIST.includes(clean) ||
        /\.myshopify\.com$/.test(host) ||
        host === "admin.shopify.com";
      return cb(null, allowed);
    },
    credentials: true,
  })
);

app.use(cookieParser());

const deepSanitize = (obj) => {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    if (
      key.startsWith("$") ||
      key.includes(".") ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype"
    ) {
      delete obj[key];
      continue;
    }
    const val = obj[key];
    if (val && typeof val === "object") deepSanitize(val);
  }
};

// ---- Rate limiting on brute-force-sensitive auth endpoints ----
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again later." },
});
app.get("/api/health", (req, res) => {

  res.status(200).json({
    success: true,
    message: "Server is healthy",
  });
});
app.use("/api/auth", authLimiter);
app.use("/api/api-consultant/login-consultant", authLimiter);
app.use("/api/api-consultant/forgot-password", authLimiter);
app.use("/api/api-consultant/reset-password", authLimiter);

app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use("/api/webhooks", webHookRoute);


app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks')) return next();
  express.json()(req, res, next);
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks')) return next();
  express.urlencoded({ extended: true })(req, res, next);
});

app.use((req, _res, next) => {
  deepSanitize(req.body);
  deepSanitize(req.params);
  try {
    deepSanitize(req.query);
  } catch (_) {
  }
  next();
});

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "30d",
    immutable: true,
    etag: true,
    lastModified: true,
  })
);
const reactBuildPath = path.join(__dirname, "..", "consultant-app", "build");

app.use("/static", express.static(path.join(reactBuildPath, "static")));
app.use("/consultant-app", express.static(reactBuildPath));

app.use(
  "/sounds",
  express.static(
    path.join(__dirname, "..", "consultant-app", "public", "sounds"),
    {
      setHeaders: (res) => {
        res.setHeader("Content-Type", "audio/mpeg");
      },
    }
  )
);


app.use((req, res, next) => {
  // Never clobber the long-lived cache headers on static uploads.
  if (req.path.startsWith("/uploads")) return next();
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

const { callRoutes } = require("./Routes/videoCallRotes");
const { signinSignupRouter } = require("./Routes/signin-signupRoute");
const { userDetailsRouter } = require("./Routes/userDetailsRoutes");
const { consultantRoute } = require("./Routes/consultantRoute");
const chatRoutes = require("./Routes/chatRoutes");
const firebaseRouter = require("./Routes/firebaseRoutes");
const { shopifyDraftOrderRoute } = require("./Routes/shopifyDraftOrderRoute");
const { userRouter } = require("./Routes/userRoutes");
const { adminRoute } = require("./Routes/adminRoute");
const { adminPrincingRoute } = require("./Routes/adminPrincingRoutes");
const { aiRoute } = require("./Routes/aiRoutes");
const { ratingRoutes } = require("./Routes/ratingRoutes");


app.use("/api/call", callRoutes);
app.use("/api/auth", signinSignupRouter);
app.use("/api/users", userDetailsRouter);
app.use("/api/api-consultant", consultantRoute)

// shopify routes 
app.use("/api/app", shopifyRoute);

/** Chat Routes */
app.use("/api/chat", chatRoutes);
app.use("/api", firebaseRouter);

/** Shopify Draft Order Routes */
app.use("/api/draft-order", shopifyDraftOrderRoute);


/** User Routes */
app.use("/api/users", userRouter);
app.use("/api/admin", adminRoute);
app.use("/api/admin/ai", aiRoute);
app.use("/api/princing", adminPrincingRoute)
app.use("/api/pricing-callback", adminPrincingRoute)
app.use("/api/ratings", ratingRoutes);

ioServer(server);

server.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
 
});


