import { getSessionToken } from '@shopify/app-bridge-utils';

export const getAppBridgeToken = async (app) => {
    if (!app) return null;
    return await getSessionToken(app);
};
