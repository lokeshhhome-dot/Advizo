import React, { Fragment, useEffect, useState } from 'react'
import MoneyValue from '../components/Helper/MoneyValue'
import { Page } from '@shopify/polaris'
import { fetchWalletHistory, fetchAdminDetails } from '../components/Redux/slices/adminSlice'
import { useDispatch, useSelector } from 'react-redux'
import { useAppBridge } from '../components/createContext/AppBridgeContext'
import UpdateUserDetailsModal from './UpdateUserDetailsModal'
import axios from 'axios'
import { getAppBridgeToken } from '../utils/getAppBridgeToken'
import styles from './AdminTable.module.css'

function ManualDebetCreditBlance() {
    const app = useAppBridge();
    const { walletHistory, loading: walletLoading } = useSelector((state) => state.admin);
    const dispatch = useDispatch();
    const [adminIdLocal, setAdminIdLocal] = useState(null);
    const [userDetails, setUserDetails] = useState({});
    const [page, setPage] = useState(1);
    const [active, setActive] = useState(false);
    const [toastActive, setToastActive] = useState(false);
    const [refresh, setRefresh] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [queryValue, setQueryValue] = useState('');
    const [updateFormData, setUpdateFormData] = useState({
        userId: '',
        mainType: '',
        amount: '',
        description: '',
    });
    const { adminDetails_ } = useSelector((state) => state.admin);

    const limit = 10;
    const openUpdateWalletModal = (userId, fullname) => {
        setActive(true);
        setUserDetails({ userId, fullname });
    }

    useEffect(() => {
        const id = localStorage.getItem('advizo');
        setAdminIdLocal(id);
    }, []);

    useEffect(() => {
        dispatch(fetchWalletHistory({ adminIdLocal, page, limit, app, searchQuery }));
        dispatch(fetchAdminDetails({ adminIdLocal, app }))

    }, [dispatch, adminIdLocal, page, limit, refresh, searchQuery]);

    const updateWallet = async () => {
        if (!updateFormData.mainType || !updateFormData.amount || +updateFormData.amount <= 0) {
            setToastActive(true);
            return;
        }
        const token = await getAppBridgeToken(app);
        try {
            const response = await axios.post(`${process.env.REACT_APP_BACKEND_HOST}/admin/update-wallet/${adminIdLocal}`, {
                ...updateFormData, userId: userDetails.userId,
            }, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (response.data.success === true) {
                setRefresh((prev) => !prev);
            } else {
                setToastActive(true);
            }
        } catch (error) {
            setToastActive(true);
        }
    }

    const formatDate = (iso) =>
        new Date(iso).toLocaleDateString();

    const tableData = walletHistory?.data?.map((item) => ({
        id: item?._id,
        userId: item?.userId?._id,
        fullname: item?.userId?.fullname || '-',
        userType: item?.userId?.userType || '-',
        amount: item?.amount || '-',
        referenceType: item?.referenceType || '-',
        direction: item?.direction || '-',
        status: item?.status || '-',
        description: item?.description || '-',
        updatedAt: formatDate(item?.updatedAt),
    })) || [];

    const handleReset = () => {
        setPage(1);
        setSearchQuery("");
        setQueryValue("");
    };

    const totalItems = walletHistory?.totalItems || walletHistory?.data?.length || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return (
        <Fragment>
            <UpdateUserDetailsModal open={active} onClose={() => setActive(false)} userDetails={userDetails} updateFormData={updateFormData} setUpdateFormData={setUpdateFormData} updateWallet={updateWallet} />
            <Page fullWidth>
                <div className={styles.page}>
                    <div className={styles.header}>
                        <div className={styles.headerLeft}>
                            <h1 className={styles.title}>Wallet Management</h1>
                            <p className={styles.subtitle}>
                                Every manual credit, debit, recharge and refund to a user's wallet.
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
                                        placeholder="Search wallets"
                                    />
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
                                        <th>Name</th>
                                        <th>Type</th>
                                        <th>Amount</th>
                                        <th>Direction</th>
                                        <th>Reference type</th>
                                        <th>Status</th>
                                        <th>Description</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {walletLoading ? (
                                        <tr>
                                            <td colSpan={9}>
                                                <div className={styles.loadingState}>Loading…</div>
                                            </td>
                                        </tr>
                                    ) : tableData.length === 0 ? (
                                        <tr>
                                            <td colSpan={9}>
                                                <div className={styles.emptyState}>No wallet activity found.</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        tableData.map((row, index) => {
                                            const serialNumber = (page - 1) * limit + index + 1;
                                            return (
                                                <tr key={row.id}>
                                                    <td>{serialNumber}</td>
                                                    <td className={styles.cellPrimary}>{row.fullname}</td>
                                                    <td className={styles.cellMuted}>{row.userType}</td>
                                                    <td className={styles.amount}>
                                                        <MoneyValue currency={adminDetails_?.currency}>
                                                            {row.amount !== '-' ? parseFloat(row.amount).toFixed(2) : '0.00'}
                                                        </MoneyValue>
                                                    </td>
                                                    <td>
                                                        <span className={`${styles.badge} ${row.direction === "credit" ? styles.badgeSuccess : styles.badgeCritical}`}>
                                                            {row.direction === "credit" ? "credit" : "debit"}
                                                        </span>
                                                    </td>
                                                    <td className={styles.cellMuted}>{row.referenceType}</td>
                                                    <td>
                                                        <span className={`${styles.badge} ${row.status === "success" ? styles.badgeSuccess : styles.badgeCritical}`}>
                                                            {row.status}
                                                        </span>
                                                    </td>
                                                    <td className={styles.cellWrap}>{row.description}</td>
                                                    <td>
                                                        <div className={styles.rowActions}>
                                                            <button
                                                                type="button"
                                                                className={styles.iconButton}
                                                                title="Edit wallet"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openUpdateWalletModal(row.userId, row.fullname);
                                                                }}
                                                            >
                                                                ✎
                                                            </button>
                                                        </div>
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
                                Showing {tableData.length} of {totalItems} wallets
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

export default ManualDebetCreditBlance
