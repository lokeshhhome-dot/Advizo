import React, { Fragment, useEffect, useState } from 'react'
import { Page } from '@shopify/polaris'
import { fetchActivityHistory, fetchAdminDetails } from '../components/Redux/slices/adminSlice'
import { useDispatch, useSelector } from 'react-redux'
import { useAppBridge } from '../components/createContext/AppBridgeContext'
import { formatNumber } from '../components/Helper/Helper'
import MoneyValue from '../components/Helper/MoneyValue'
import styles from './AdminTable.module.css'

const typeTabs = ['All', 'Chat', 'Voice Call', 'Video Call']

function UserTransHistory() {
    const app = useAppBridge();
    const { activityHistory, loading } = useSelector((state) => state.admin);
    const { adminDetails_ } = useSelector((state) => state.admin);

    const dispatch = useDispatch();
    const [adminIdLocal, setAdminIdLocal] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [queryValue, setQueryValue] = useState("");
    const [page, setPage] = useState(1);
    const [type, setType] = useState(0);
    const limit = 10;

    useEffect(() => {
        const id = localStorage.getItem('consultly');
        setAdminIdLocal(id);
    }, []);
    useEffect(() => {
        if (adminIdLocal) {
            dispatch(fetchAdminDetails({ adminIdLocal, app }))
        }
    }, [dispatch, adminIdLocal, page, limit, type,])
    useEffect(() => {
        if (adminIdLocal) {
            dispatch(fetchActivityHistory({ adminIdLocal, page, limit, type, app, searchQuery }));
        }
    }, [dispatch, adminIdLocal, page, limit, type, searchQuery]);

    const formatDate = (iso) =>
        new Date(iso).toLocaleDateString();

    const formatTime = (iso) =>
        new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const getDuration = (start, end) => {
        if (!start || !end) return "00:00";
        const diffMs = new Date(end) - new Date(start);
        if (diffMs <= 0) return "00:00";
        const diff = Math.floor(diffMs / 1000);
        const m = String(Math.floor(diff / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        return `${m}:${s}`;
    };

    const handleReset = () => {
        setPage(1);
        setSearchQuery("");
        setQueryValue("");
        setType(0);
    };

    const handleTabClick = (index) => {
        setType(index);
        setPage(1);
    };

    const tableData = activityHistory?.data?.map((item) => ({
        id: item._id,
        type: item.type?.toUpperCase() || '',
        date: formatDate(item.createdAt),
        time: formatTime(item.startTime),
        duration: getDuration(item.startTime, item.endTime),
        user: item.senderId?.fullname || '-',
        consultant: item.receiverId?.fullname || '-',
        amount: `${item.amount}`,
        status: item.status
    })) || [];

    const totalItems = activityHistory?.totalItems || activityHistory?.data?.length || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return (
        <Fragment>
            <Page fullWidth>
                <div className={styles.page}>
                    <div className={styles.header}>
                        <div className={styles.headerLeft}>
                            <h1 className={styles.title}>Activity History</h1>
                            <p className={styles.subtitle}>
                                Every chat, voice, and video session across your store.
                            </p>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.toolbar}>
                            <div className={styles.toolbarLeft}>
                                <div className={styles.searchWrap}>
                                    <span className={styles.searchIcon}>🔍</span>
                                    <input
                                        className={styles.searchInput}
                                        value={queryValue}
                                        onChange={(e) => {
                                            setQueryValue(e.target.value);
                                            setSearchQuery(e.target.value);
                                            setPage(1);
                                        }}
                                        placeholder="Search transactions"
                                    />
                                </div>
                                <div className={styles.tabs}>
                                    {typeTabs.map((tab, index) => (
                                        <button
                                            key={tab}
                                            type="button"
                                            className={`${styles.tabButton} ${type === index ? styles.tabButtonActive : ""}`}
                                            onClick={() => handleTabClick(index)}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button type="button" className={styles.resetButton} onClick={handleReset}>
                                Reset
                            </button>
                        </div>

                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Sr. No.</th>
                                        <th>User</th>
                                        <th>Consultant</th>
                                        <th>Date</th>
                                        <th>Time</th>
                                        <th>Type</th>
                                        <th>Duration</th>
                                        <th>Amount</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={9}>
                                                <div className={styles.loadingState}>Loading…</div>
                                            </td>
                                        </tr>
                                    ) : tableData.length === 0 ? (
                                        <tr>
                                            <td colSpan={9}>
                                                <div className={styles.emptyState}>No activity found.</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        tableData.map((row, index) => {
                                            const serialNumber = (page - 1) * limit + index + 1;
                                            return (
                                                <tr key={row.id}>
                                                    <td>{serialNumber}</td>
                                                    <td className={styles.cellPrimary}>{row.user}</td>
                                                    <td>{row.consultant}</td>
                                                    <td className={styles.cellMuted}>{row.date}</td>
                                                    <td className={styles.cellMuted}>{row.time}</td>
                                                    <td>{row.type.charAt(0) + row.type.slice(1).toLowerCase()}</td>
                                                    <td className={styles.cellMuted}>{row.duration}</td>
                                                    <td className={styles.amount}>
                                                        <MoneyValue currency={adminDetails_?.currency}>
                                                            {formatNumber(row.amount, 2)}
                                                        </MoneyValue>
                                                    </td>
                                                    <td>
                                                        <span className={`${styles.badge} ${row.status === "active" ? styles.badgeSuccess : styles.badgeNeutral}`}>
                                                            {row.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className={styles.footer}>
                            <span className={styles.footerText}>
                                Showing {tableData.length} of {totalItems} transactions
                            </span>
                            {totalPages > 1 && (
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button
                                        type="button"
                                        className={styles.pagerButton}
                                        disabled={page <= 1}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    >
                                        ‹
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.pagerButton}
                                        disabled={page >= totalPages}
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    >
                                        ›
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Page>
        </Fragment>
    )
}

export default UserTransHistory
