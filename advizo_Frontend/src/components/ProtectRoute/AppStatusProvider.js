import axios from 'axios';
import { notifySocketUserReady } from '../Sokect-io/SokectConfig';
import { createContext, useContext, useEffect, useState } from 'react';
import {
    prepareSessionLogin,
    SESSION_TYPES,
    isConsultantAppSurface,
    getActiveSession,
} from '../../utils/browserSession';

const AppStatusContext = createContext();

export const AppStatusProvider = ({ children }) => {
    const [loading, setLoading] = useState(true);
    const [appEnabled, setAppEnabled] = useState(false);
    const [resolvedShopId, setResolvedShopId] = useState(null);
    const params = new URLSearchParams(window.location.search);
    const shop = params.get('shop');
    const shop_id = params.get('shopid');
    const user_id = params.get('customerId');
    const authToken = params.get('authToken');

    useEffect(() => {
        // Never run customer/user session bootstrap on consultant surfaces.
        // This was wiping client_u_Identity / token after consultant login.
        if (isConsultantAppSurface()) return;
        if (getActiveSession() === SESSION_TYPES.CONSULTANT && !user_id) return;

        if (shop || user_id || shop_id) {
            if (user_id) {
                prepareSessionLogin(SESSION_TYPES.USER);
                localStorage.setItem('client_u_Identity', user_id);
                if (authToken) {
                    localStorage.setItem('token', authToken);
                }
                notifySocketUserReady();
            }
            if (shop_id) localStorage.setItem('shop_o_Identity', shop_id);
        }
    }, [shop, user_id, shop_id, authToken]);

    useEffect(() => {
        const checkAppStatus = async () => {
            try {
                const resolvedShop =
                    shop ||
                    localStorage.getItem('shop') ||
                    new URLSearchParams(window.location.search).get('shop');
                const resolvedShopId =
                    shop_id || localStorage.getItem('shop_o_Identity');

                const response = await axios.get(
                    `${process.env.REACT_APP_BACKEND_HOST}/users/app-status-verify-app-status`,
                    {
                        params: {
                            shop: resolvedShop,
                            adminIdLocal: resolvedShopId,
                        },
                    },
                );

                setAppEnabled(Boolean(response.data?.data));

                const shopIdFromApi = response.data?.shopId;
                if (shopIdFromApi) {
                    setResolvedShopId(shopIdFromApi);
                    // Do not overwrite consultant shop id with a different storefront shop.
                    if (getActiveSession() !== SESSION_TYPES.CONSULTANT) {
                        localStorage.setItem('shop_o_Identity', shopIdFromApi);
                    } else if (!localStorage.getItem('shop_o_Identity')) {
                        localStorage.setItem('shop_o_Identity', shopIdFromApi);
                    }
                }
            } catch (error) {
                console.error('App status check failed:', error);
                setAppEnabled(true);
            } finally {
                setLoading(false);
            }
        };
        checkAppStatus();
    }, [shop, shop_id]);

    return (
        <AppStatusContext.Provider value={{ loading, appEnabled, shopId: resolvedShopId }}>
            {children}
        </AppStatusContext.Provider>
    );
};

export const useAppStatus = () => useContext(AppStatusContext);
