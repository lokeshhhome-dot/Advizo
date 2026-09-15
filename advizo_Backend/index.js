const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const http = require("http");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");

dotenv.config();

const { connectDB } = require("./Utils/db");
const { initRedis } = require("./Utils/redis");

connectDB();
initRedis();

const path = require("path");

const app = express();
const PORT = process.env.ADVIZO_BACKEND_PORT;

const server = http.createServer(app);

const { ioServer } = require("./server-io");

const shopifyRoute = require("./Routes/shopifyRoute");
const { webHookRoute } = require("./Routes/webHookRoute");

app.set("trust proxy", 1);

/* =========================================================
   SECURITY HEADERS
========================================================= */

app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

/*
 * Allow Shopify storefront/admin pages to embed Advizo
 * where required by the application.
 */
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors https://*.myshopify.com https://admin.shopify.com;"
  );

  next();
});

/* =========================================================
   CORS
========================================================= */
/* =========================================================
   CORS
========================================================= */

const CORS_ALLOWLIST = [
  ...String(process.env.APP_URL || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean),

  // Current Advizo frontend from the CORS error
  "https://advizo.fossilapps.com",
];

const corsOptions = {
  origin(origin, callback) {
    // Requests without an Origin header
    if (!origin) {
      return callback(null, true);
    }

    const cleanOrigin = origin.replace(/\/+$/, "");

    let hostname = "";

    try {
      hostname = new URL(cleanOrigin).hostname;
    } catch (error) {
      console.warn("[CORS] Invalid origin:", origin);
      return callback(new Error("Invalid CORS origin"));
    }

    const isAllowed =
      // Explicit domains from APP_URL
      CORS_ALLOWLIST.includes(cleanOrigin) ||

      // All Shopify storefronts
      hostname.endsWith(".myshopify.com") ||

      // Shopify Admin
      hostname === "admin.shopify.com";

    if (isAllowed) {
      console.log("[CORS] Allowed:", cleanOrigin);
      return callback(null, true);
    }

    console.warn("[CORS] Blocked origin:", origin);
    return callback(new Error("Not allowed by CORS"));
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
  ],

  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

/*
 * Explicitly handle browser OPTIONS preflight requests.
 *
 * This is important for requests such as:
 *
 * Shopify storefront
 *      ↓
 * OPTIONS /api/users/shopify/users/checked-balance/...
 *      ↓
 * Advizo backend
 */


/* =========================================================
   COOKIES
========================================================= */

app.use(cookieParser());

/* =========================================================
   REQUEST SANITIZATION
========================================================= */

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

    if (val && typeof val === "object") {
      deepSanitize(val);
    }
  }
};

/* =========================================================
   RATE LIMITING
========================================================= */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
  });
});

/* =========================================================
   AUTH RATE LIMITERS
========================================================= */

app.use("/api/auth", authLimiter);

app.use(
  "/api/api-consultant/login-consultant",
  authLimiter
);

app.use(
  "/api/api-consultant/forgot-password",
  authLimiter
);

app.use(
  "/api/api-consultant/reset-password",
  authLimiter
);

/* =========================================================
   SHOPIFY WEBHOOKS
========================================================= */

/*
 * Shopify webhooks require the raw request body,
 * so this must stay before express.json().
 */
app.use(
  "/api/webhooks",
  express.raw({
    type: "application/json",
  })
);

app.use(
  "/api/webhooks",
  webHookRoute
);

/* =========================================================
   BODY PARSING
========================================================= */

app.use((req, res, next) => {
  if (req.path.startsWith("/api/webhooks")) {
    return next();
  }

  express.json()(req, res, next);
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/webhooks")) {
    return next();
  }

  express.urlencoded(
    {
      extended: true,
    }
  )(req, res, next);
});

/* =========================================================
   REQUEST SANITIZATION MIDDLEWARE
========================================================= */

app.use((req, res, next) => {
  deepSanitize(req.body);
  deepSanitize(req.params);

  try {
    deepSanitize(req.query);
  } catch (_) {
    // Ignore query sanitization errors
  }

  next();
});

/* =========================================================
   STATIC UPLOADS
========================================================= */

app.use(
  "/uploads",
  express.static(
    path.join(__dirname, "uploads"),
    {
      maxAge: "30d",
      immutable: true,
      etag: true,
      lastModified: true,
    }
  )
);

/* =========================================================
   CONSULTANT REACT BUILD
========================================================= */

const reactBuildPath = path.join(
  __dirname,
  "..",
  "consultant-app",
  "build"
);

app.use(
  "/static",
  express.static(
    path.join(reactBuildPath, "static")
  )
);

app.use(
  "/consultant-app",
  express.static(reactBuildPath)
);

/* =========================================================
   CALL / NOTIFICATION SOUNDS
========================================================= */

app.use(
  "/sounds",
  express.static(
    path.join(
      __dirname,
      "..",
      "consultant-app",
      "public",
      "sounds"
    ),
    {
      setHeaders: (res) => {
        res.setHeader(
          "Content-Type",
          "audio/mpeg"
        );
      },
    }
  )
);

/* =========================================================
   CACHE CONTROL
========================================================= */

app.use((req, res, next) => {
  /*
   * Never overwrite long-lived cache headers
   * for static uploads.
   */
  if (req.path.startsWith("/uploads")) {
    return next();
  }

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private"
  );

  res.setHeader(
    "Pragma",
    "no-cache"
  );

  res.setHeader(
    "Expires",
    "0"
  );

  next();
});

/* =========================================================
   ROUTE IMPORTS
========================================================= */

const { callRoutes } = require("./Routes/videoCallRotes");

const {
  signinSignupRouter,
} = require("./Routes/signin-signupRoute");

const {
  userDetailsRouter,
} = require("./Routes/userDetailsRoutes");

const {
  consultantRoute,
} = require("./Routes/consultantRoute");

const chatRoutes = require("./Routes/chatRoutes");

const firebaseRouter = require("./Routes/firebaseRoutes");

const {
  shopifyDraftOrderRoute,
} = require("./Routes/shopifyDraftOrderRoute");

const {
  userRouter,
} = require("./Routes/userRoutes");

const {
  adminRoute,
} = require("./Routes/adminRoute");

const {
  adminPrincingRoute,
} = require("./Routes/adminPrincingRoutes");

const {
  aiRoute,
} = require("./Routes/aiRoutes");

const {
  ratingRoutes,
} = require("./Routes/ratingRoutes");

/* =========================================================
   API ROUTES
========================================================= */

/* Call Routes */
app.use(
  "/api/call",
  callRoutes
);

/* Authentication */
app.use(
  "/api/auth",
  signinSignupRouter
);

/* User Details */
app.use(
  "/api/users",
  userDetailsRouter
);

/* Consultant */
app.use(
  "/api/api-consultant",
  consultantRoute
);

/* =========================================================
   SHOPIFY ROUTES
========================================================= */

app.use(
  "/api/app",
  shopifyRoute
);

/* =========================================================
   CHAT ROUTES
========================================================= */

app.use(
  "/api/chat",
  chatRoutes
);

/* =========================================================
   FIREBASE
========================================================= */

app.use(
  "/api",
  firebaseRouter
);

/* =========================================================
   SHOPIFY DRAFT ORDERS
========================================================= */

app.use(
  "/api/draft-order",
  shopifyDraftOrderRoute
);

/* =========================================================
   USER ROUTES
========================================================= */

app.use(
  "/api/users",
  userRouter
);

/* =========================================================
   ADMIN
========================================================= */

app.use(
  "/api/admin",
  adminRoute
);

/* =========================================================
   ADMIN AI
========================================================= */

app.use(
  "/api/admin/ai",
  aiRoute
);

/* =========================================================
   ADMIN PRICING
========================================================= */

app.use(
  "/api/princing",
  adminPrincingRoute
);

app.use(
  "/api/pricing-callback",
  adminPrincingRoute
);

/* =========================================================
   RATINGS
========================================================= */

app.use(
  "/api/ratings",
  ratingRoutes
);

/* =========================================================
   SOCKET.IO
========================================================= */

ioServer(server);

/* =========================================================
   START SERVER
========================================================= */

server.listen(PORT, () => {
  console.log(
    `Advizo backend server running on port ${PORT}`
  );
});