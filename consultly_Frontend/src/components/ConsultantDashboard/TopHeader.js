import React, { useState, useEffect, useRef } from 'react';

import { useLocation, useNavigate } from 'react-router-dom';

import styles from '../../components/ConsultantDashboard/TopHeadercss.module.css';

import { useDispatch } from 'react-redux';

import { logout } from '../Redux/slices/authConsultantSlice';

import { clearConsultantSession, redirectToConsultantLogin } from '../../utils/consultantAuth';

import { handleProfileImageError, getProfileImageUrl } from '../../utils/getProfileImageUrl';

import { useConsultantNotifications } from './useConsultantNotifications';

// Image assets are DEFAULT imports — a named import ({ appLogo }) resolves to
// undefined and renders a broken/empty logo.
import appLogo from "../../assets/image.png";


const formatNotificationTime = (value) => {

    if (!value) return '';

    try {

        return new Date(value).toLocaleString([], {

            month: 'short',

            day: 'numeric',

            hour: '2-digit',

            minute: '2-digit',

        });

    } catch (error) {

        return '';

    }

};



const TopHeader = ({

    onMenuToggle,

    isSidebarOpen,

    profile,

    userName,

    userEmail,

    shop,

    isOnline = false,

    onOpenProfile,

    onOpenInbox,

}) => {

    const location = useLocation();

    const navigate = useNavigate();

    const [searchValue, setSearchValue] = useState('');

    const [profileOpen, setProfileOpen] = useState(false);

    const [notificationsOpen, setNotificationsOpen] = useState(false);

    const profileRef = useRef(null);

    const notificationsRef = useRef(null);

    const dispatch = useDispatch();

    const {

        notifications,

        unreadCount,

        loading: notificationsLoading,

        markAsRead,

        markAllAsRead,

    } = useConsultantNotifications();



    const handleLogout = () => {

        dispatch(logout());

        clearConsultantSession();

        redirectToConsultantLogin();

    };



    useEffect(() => {

        const handleClickOutside = (event) => {

            if (profileRef.current && !profileRef.current.contains(event.target)) {

                setProfileOpen(false);

            }

            if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {

                setNotificationsOpen(false);

            }

        };



        document.addEventListener('mousedown', handleClickOutside);

        return () => {

            document.removeEventListener('mousedown', handleClickOutside);

        };

    }, []);



    const handleNotificationClick = async (notification) => {

        await markAsRead(notification);

        setNotificationsOpen(false);



        if (notification?.userId) {

            localStorage.setItem('consultly_pending_chat_user', notification.userId);

        }



        if (notification?.type === 'missed_call') {

            navigate('/consultant-dashboard/call-chat-logs');

            return;

        }



        navigate('/consultant-dashboard/chats');

        onOpenInbox?.();

    };



    const isVideoCallPage = location.pathname === '/video-call' || location.pathname.startsWith('/video-call');

    if (isVideoCallPage) return null;



    return (

        <header className={styles.topHeader}>

            <div className={styles.headerInner}>

                <div className={styles.headerLeft}>

                    <div className={styles.logo}>

                        <div className={styles.logoIcon}>

                            <span className={styles.logoLetter}><img src={appLogo} alt="Consultly" /></span>

                        </div>

                        {/* <span className={styles.brandName}>Consultly</span> */}

                    </div>

                    <button

                        type="button"

                        className={styles.hamburgerBtn}

                        onClick={onMenuToggle}

                        aria-label="Toggle menu"

                    >

                        {isSidebarOpen ? (

                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">

                                <line x1="18" y1="6" x2="6" y2="18" />

                                <line x1="6" y1="6" x2="18" y2="18" />

                            </svg>

                        ) : (

                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">

                                <line x1="3" y1="12" x2="21" y2="12" />

                                <line x1="3" y1="6" x2="21" y2="6" />

                                <line x1="3" y1="18" x2="21" y2="18" />

                            </svg>

                        )}

                    </button>

                </div>



                <div className={styles.headerRight}>

                    {/* <div className={styles.searchBox}>

                        <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">

                            <circle cx="11" cy="11" r="8" />

                            <path d="m21 21-4.35-4.35" />

                        </svg>

                        <input

                            type="text"

                            className={styles.searchInput}

                            placeholder="Search here..."

                            value={searchValue}

                            onChange={(e) => setSearchValue(e.target.value)}

                            aria-label="Search"

                        />

                    </div> */}



                    <button

                        type="button"

                        className={styles.iconBtn}

                        aria-label="Messages"

                        onClick={() => {

                            setNotificationsOpen(false);

                            onOpenInbox?.();

                            navigate('/consultant-dashboard/chats');

                        }}

                    >

                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">

                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />

                            <polyline points="22,6 12,13 2,6" />

                        </svg>

                    </button>



                    <div className={styles.notificationWrapper} ref={notificationsRef}>

                        <button

                            type="button"

                            className={`${styles.iconBtn} ${notificationsOpen ? styles.iconBtnActive : ''}`}

                            aria-label="Notifications"

                            aria-expanded={notificationsOpen}

                            onClick={() => {

                                setProfileOpen(false);

                                setNotificationsOpen((open) => !open);

                            }}

                        >

                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">

                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />

                                <path d="M13.73 21a2 2 0 0 1-3.46 0" />

                            </svg>

                            {unreadCount > 0 && (

                                <span className={styles.badge}>

                                    {unreadCount > 9 ? '9+' : unreadCount}

                                </span>

                            )}

                        </button>



                        {notificationsOpen && (

                            <div className={styles.notificationDropdown}>

                                <div className={styles.notificationHeader}>

                                    <div>

                                        <h3 className={styles.notificationTitle}>Notifications</h3>

                                        <p className={styles.notificationSubtitle}>

                                            Missed calls and unread messages

                                        </p>

                                    </div>

                                    {unreadCount > 0 && (

                                        <button

                                            type="button"

                                            className={styles.markAllReadBtn}

                                            onClick={markAllAsRead}

                                        >

                                            Mark all read

                                        </button>

                                    )}

                                </div>



                                <div className={styles.notificationList}>

                                    {notificationsLoading ? (

                                        <div className={styles.notificationEmpty}>Loading...</div>

                                    ) : notifications.length === 0 ? (

                                        <div className={styles.notificationEmpty}>

                                            No new notifications

                                        </div>

                                    ) : (

                                        notifications.map((notification) => (

                                            <button

                                                key={`${notification.type}-${notification.id}`}

                                                type="button"

                                                className={styles.notificationItem}

                                                onClick={() => handleNotificationClick(notification)}

                                            >

                                                <div className={styles.notificationAvatar}>

                                                    <img

                                                        src={getProfileImageUrl(notification.profileImage)}

                                                        alt={notification.title}

                                                        onError={handleProfileImageError}

                                                    />

                                                </div>

                                                <div className={styles.notificationContent}>

                                                    <div className={styles.notificationItemTop}>

                                                        <span className={styles.notificationName}>

                                                            {notification.title}

                                                        </span>

                                                        <span className={styles.notificationTime}>

                                                            {formatNotificationTime(notification.createdAt)}

                                                        </span>

                                                    </div>

                                                    <span

                                                        className={`${styles.notificationType} ${

                                                            notification.type === 'missed_call'

                                                                ? styles.notificationTypeCall

                                                                : styles.notificationTypeMessage

                                                        }`}

                                                    >

                                                        {notification.type === 'missed_call'

                                                            ? 'Missed call'

                                                            : 'New message'}

                                                    </span>

                                                    <p className={styles.notificationMessage}>

                                                        {notification.message}

                                                    </p>

                                                </div>

                                            </button>

                                        ))

                                    )}

                                </div>

                            </div>

                        )}

                    </div>



                    <div className={styles.userProfileWrapper} ref={profileRef}>

                        <button

                            type="button"

                            className={`${styles.userProfile} ${profileOpen ? styles.userProfileActive : ''}`}

                            onClick={() => {

                                setNotificationsOpen(false);

                                setProfileOpen((open) => !open);

                            }}

                            aria-haspopup="true"

                            aria-expanded={profileOpen}

                        >

                            <div className={styles.avatarWrapper}>

                                <div className={styles.avatar}>

                                    <img

                                        src={profile}

                                        alt={userName || "Profile"}

                                        className={styles.avatarImage}

                                        onError={handleProfileImageError}

                                    />

                                </div>

                                <span

                                    className={`${styles.headerOnlineIndicator} ${

                                        isOnline ? styles.headerOnlineIndicatorActive : styles.headerOnlineIndicatorInactive

                                    }`}

                                    title={isOnline ? "You are online" : "You are offline"}

                                />

                            </div>

                            <div className={styles.userInfo}>

                                <span className={styles.userName}>{userName}</span>

                                <span className={styles.userRole}>{userEmail}</span>

                                <span

                                    className={`${styles.userOnlineStatus} ${

                                        isOnline ? styles.userOnlineStatusActive : styles.userOnlineStatusInactive

                                    }`}

                                >

                                    {isOnline ? "Online" : "Offline"}

                                </span>

                            </div>

                        </button>



                        {profileOpen && (

                            <div className={styles.profileDropdown}>

                                <div className={styles.profileDropdownHeader}>

                                    <div className={styles.profileDropdownAvatar}>

                                        <img

                                            src={profile}

                                            alt={userName || "Profile"}

                                            className={styles.profileDropdownAvatarImage}

                                            onError={handleProfileImageError}

                                        />

                                    </div>

                                    <div className={styles.profileDropdownInfo}>

                                        <span className={styles.profileDropdownName}>{userName}</span>

                                        <span className={styles.profileDropdownRole}>{userEmail}</span>

                                        <span

                                            className={`${styles.userOnlineStatus} ${

                                                isOnline ? styles.userOnlineStatusActive : styles.userOnlineStatusInactive

                                            }`}

                                        >

                                            {isOnline ? "Online" : "Offline"}

                                        </span>

                                    </div>

                                </div>



                                <div className={styles.profileDropdownList}>

                                    <button

                                        type="button"

                                        className={styles.profileDropdownItem}

                                        onClick={() => {

                                            setProfileOpen(false);

                                            onOpenProfile?.();

                                        }}

                                    >

                                        <span className={`${styles.profileDropdownIcon} ${styles.profileDropdownIconProfile}`}>

                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">

                                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />

                                                <circle cx="12" cy="7" r="4" />

                                            </svg>

                                        </span>

                                        <span className={styles.profileDropdownLabel}>Profile</span>

                                    </button>



                                    <button

                                        type="button"

                                        className={styles.profileDropdownItem}

                                        onClick={() => {

                                            setProfileOpen(false);

                                            onOpenInbox?.();

                                            navigate('/consultant-dashboard/chats');

                                        }}

                                    >

                                        <span className={`${styles.profileDropdownIcon} ${styles.profileDropdownIconInbox}`}>

                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">

                                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />

                                                <polyline points="22,6 12,13 2,6" />

                                            </svg>

                                        </span>

                                        <span className={styles.profileDropdownLabel}>Inbox</span>

                                    </button>



                                    <button type="button" className={styles.profileDropdownItem} onClick={handleLogout}>

                                        <span className={`${styles.profileDropdownIcon} ${styles.profileDropdownIconLogout}`}>

                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">

                                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />

                                                <polyline points="16 17 21 12 16 7" />

                                                <line x1="21" y1="12" x2="9" y2="12" />

                                            </svg>

                                        </span>

                                        <span className={styles.profileDropdownLabel}>Logout</span>

                                    </button>

                                </div>

                            </div>

                        )}

                    </div>

                </div>

            </div>

        </header>

    );

};



export default TopHeader;

