// Separate build entry (-> consultly-call-engine.js) so the heavy call
// engine — Agora SDK (~1.3MB, ~93% of the previous single-bundle size),
// Socket.IO client, Redux, and callSlice.js — is NOT part of the small
// bootstrap script the theme loads on every page view. This chunk is only
// fetched once the customer actually clicks Call/Video (see index.js's
// ensureEngineLoaded). Same engine.js, same startCustomerCall — only the
// bundling boundary changed, not the call logic.
import { startCustomerCall } from "./engine";

window.ConsultlyCallEngine = { startCustomerCall };
