import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import styles from './LoginForm.module.css';
import axios from 'axios';
import { connectAndRegisterSocket, notifySocketUserReady } from '../Sokect-io/SokectConfig';
import { verifyToken } from '../Redux/slices/authConsultantSlice';
import { redirectToConsultantDashboard } from '../../utils/consultantAuth';
import { prepareSessionLogin, SESSION_TYPES } from '../../utils/browserSession';

const EyeIcon = ({ off }) =>
    off ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );

const Spinner = () => (
    <svg className={styles.spinner} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
);

const LoginForm = () => {
    const dispatch = useDispatch();
    // "login" | "forgot" | "reset"
    const [view, setView] = useState('login');
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');

    // Forgot / reset state
    const [resetEmail, setResetEmail] = useState('');
    const [resetOtp, setResetOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);

    const switchView = (nextView) => {
        setView(nextView);
        setErrors({});
        setFormError('');
        setFormSuccess('');
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const validateForm = () => {
        const newErrors = {};
        if (!formData.email) {
            newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Email is invalid';
        }
        if (!formData.password) {
            newErrors.password = 'Password is required';
        } else if (formData.password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        if (!validateForm()) return;
        setIsLoading(true);

        try {
            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/login-consultant`,
                formData,
            );

            const { userData, token } = response?.data;

            if (response.status === 200 && userData?._id) {
                const params = new URLSearchParams(window.location.search);
                const shopDomain = params.get("shop");

                prepareSessionLogin(SESSION_TYPES.CONSULTANT);
                localStorage.setItem("client_u_Identity", userData._id);
                localStorage.setItem("shop_o_Identity", userData.shop_id);
                if (shopDomain) {
                    localStorage.setItem("shop", shopDomain);
                }
                localStorage.setItem("token", token);

                await dispatch(verifyToken()).unwrap();
                connectAndRegisterSocket();
                notifySocketUserReady();
                redirectToConsultantDashboard();
            } else {
                setFormError("Invalid email or password");
            }
        } catch (err) {
            setFormError(err.response?.data?.message || "Login failed. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setFormSuccess('');
        if (!resetEmail || !/\S+@\S+\.\S+/.test(resetEmail)) {
            setFormError('Please enter a valid email address.');
            return;
        }
        setIsLoading(true);
        try {
            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/forgot-password`,
                { email: resetEmail.trim() },
            );
            setFormSuccess(response.data?.message || 'Reset code sent. Check your email.');
            setView('reset');
        } catch (err) {
            setFormError(
                err.response?.data?.message || 'Could not send the reset code. Please try again.',
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        if (!resetOtp.trim()) {
            setFormError('Please enter the code from your email.');
            return;
        }
        if (!newPassword || newPassword.length < 6) {
            setFormError('New password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setFormError('Passwords do not match.');
            return;
        }
        setIsLoading(true);
        try {
            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/reset-password`,
                {
                    email: resetEmail.trim(),
                    otp: resetOtp.trim(),
                    newPassword,
                },
            );
            setResetOtp('');
            setNewPassword('');
            setConfirmPassword('');
            switchView('login');
            setFormSuccess(
                response.data?.message ||
                'Password updated. You can now log in with your new password.',
            );
            setFormData(prev => ({ ...prev, email: resetEmail.trim(), password: '' }));
        } catch (err) {
            setFormError(
                err.response?.data?.message || 'Could not reset the password. Please try again.',
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.loginPageContainer}>
            <div className={styles.loginContainer}>

                {view === 'login' && (
                    <>
                        <h1 className={styles.loginTitle}>Login</h1>
                        <form className={styles.loginForm} onSubmit={handleSubmit}>
                            {formSuccess && <div className={styles.successBanner}>{formSuccess}</div>}
                            {formError && <div className={styles.errorBanner}>{formError}</div>}

                            <div className={styles.formGroup}>
                                <label htmlFor="email" className={styles.formLabel}>Email</label>
                                <input
                                    type="email"
                                    id="email"
                                    name="email"
                                    className={`${styles.formInput} ${errors.email ? styles.inputError : ''}`}
                                    value={formData.email}
                                    onChange={handleChange}
                                    autoComplete="email"
                                />
                                {errors.email && <span className={styles.errorMessage}>{errors.email}</span>}
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="password" className={styles.formLabel}>Password</label>
                                <div className={styles.passwordInputWrapper}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        id="password"
                                        name="password"
                                        className={`${styles.formInput} ${errors.password ? styles.inputError : ''}`}
                                        value={formData.password}
                                        onChange={handleChange}
                                        autoComplete="current-password"
                                    />
                                    <button
                                        type="button"
                                        className={styles.passwordToggle}
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        <EyeIcon off={showPassword} />
                                    </button>
                                </div>
                                {errors.password && <span className={styles.errorMessage}>{errors.password}</span>}
                            </div>

                            <div className={styles.forgotPasswordContainer}>
                                <button
                                    type="button"
                                    className={styles.linkButton}
                                    onClick={() => {
                                        setResetEmail(formData.email);
                                        switchView('forgot');
                                    }}
                                >
                                    Forgot your password?
                                </button>
                            </div>

                            <button
                                type="submit"
                                className={`${styles.submitButton} ${isLoading ? styles.buttonLoading : ''}`}
                                disabled={isLoading}
                            >
                                {isLoading ? (<><Spinner /> Signing in...</>) : 'Log in'}
                            </button>
                        </form>
                    </>
                )}

                {view === 'forgot' && (
                    <>
                        <h1 className={styles.loginTitle}>Reset your password</h1>
                        <p className={styles.subtitleText}>
                            We will send you an email with a code to reset your password.
                        </p>
                        <form className={styles.loginForm} onSubmit={handleForgotSubmit}>
                            {formError && <div className={styles.errorBanner}>{formError}</div>}

                            <div className={styles.formGroup}>
                                <label htmlFor="reset-email" className={styles.formLabel}>Email</label>
                                <input
                                    type="email"
                                    id="reset-email"
                                    className={styles.formInput}
                                    value={resetEmail}
                                    onChange={(e) => setResetEmail(e.target.value)}
                                    autoComplete="email"
                                />
                            </div>

                            <button
                                type="submit"
                                className={`${styles.submitButton} ${isLoading ? styles.buttonLoading : ''}`}
                                disabled={isLoading}
                            >
                                {isLoading ? (<><Spinner /> Sending...</>) : 'Send reset code'}
                            </button>

                            <div className={styles.backLinkContainer}>
                                <button
                                    type="button"
                                    className={styles.linkButton}
                                    onClick={() => switchView('login')}
                                >
                                    Back to login
                                </button>
                            </div>
                        </form>
                    </>
                )}

                {view === 'reset' && (
                    <>
                        <h1 className={styles.loginTitle}>Enter reset code</h1>
                        <p className={styles.subtitleText}>
                            We sent a 6-digit code to <strong>{resetEmail}</strong>. Enter it below with your new password.
                        </p>
                        <form className={styles.loginForm} onSubmit={handleResetSubmit}>
                            {formSuccess && <div className={styles.successBanner}>{formSuccess}</div>}
                            {formError && <div className={styles.errorBanner}>{formError}</div>}

                            <div className={styles.formGroup}>
                                <label htmlFor="reset-otp" className={styles.formLabel}>Reset code</label>
                                <input
                                    type="text"
                                    id="reset-otp"
                                    inputMode="numeric"
                                    maxLength={6}
                                    className={`${styles.formInput} ${styles.otpInput}`}
                                    value={resetOtp}
                                    onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
                                    autoComplete="one-time-code"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="new-password" className={styles.formLabel}>New password</label>
                                <div className={styles.passwordInputWrapper}>
                                    <input
                                        type={showNewPassword ? 'text' : 'password'}
                                        id="new-password"
                                        className={styles.formInput}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className={styles.passwordToggle}
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                                    >
                                        <EyeIcon off={showNewPassword} />
                                    </button>
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="confirm-password" className={styles.formLabel}>Confirm new password</label>
                                <input
                                    type="password"
                                    id="confirm-password"
                                    className={styles.formInput}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    autoComplete="new-password"
                                />
                            </div>

                            <button
                                type="submit"
                                className={`${styles.submitButton} ${isLoading ? styles.buttonLoading : ''}`}
                                disabled={isLoading}
                            >
                                {isLoading ? (<><Spinner /> Updating...</>) : 'Reset password'}
                            </button>

                            <div className={styles.backLinkContainer}>
                                <button
                                    type="button"
                                    className={styles.linkButton}
                                    onClick={() => switchView('forgot')}
                                >
                                    Didn't get the code? Send again
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
};

export default LoginForm;
