import axios from 'axios';
import { getAppBridgeToken } from './getAppBridgeToken';

const apiInterCepter = axios.create({
    baseURL: process.env.REACT_APP_BACKEND_HOST,
});

// We will inject `app` later
export const setupInterceptor = (app) => {
    apiInterCepter.interceptors.request.use(
        async (config) => {
            const token = await getAppBridgeToken(app);

            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }

            return config;
        },
        (error) => Promise.reject(error)
    );
};

export default apiInterCepter;
