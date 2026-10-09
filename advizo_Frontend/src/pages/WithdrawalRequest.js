import React, { Fragment, useContext, useEffect, useState } from 'react'
import MoneyValue from '../components/Helper/MoneyValue'
import { Icon, Page } from '@shopify/polaris'
import { fetchWithdrawalRequests, fetchAdminDetails } from '../components/Redux/slices/adminSlice'
import { useDispatch, useSelector } from 'react-redux'
import { useAppBridge } from '../components/createContext/AppBridgeContext'
import axios from 'axios'
import { getAppBridgeToken } from '../utils/getAppBridgeToken'
import WidthrwalRequestApprove from '../components/AlertModel/WidthrwalRequestApprove'
import { ToastContext } from '../components/AlertModel/PolariesTostContext';
import { WidthrawalReqDeclineAlert } from '../components/AlertModel/WidthrawalReqDeclineAlert'
import styles from './AdminTable.module.css'
import {SearchIcon} from '@shopify/polaris-icons';


function WithdrawalRequest() {
    const app = useAppBridge();
    const { showToast } = useContext(ToastContext);
    const dispatch = useDispatch();
    const [adminIdLocal, setAdminIdLocal] = useState(null);
    const [userDetails, setUserDetails] = useState({});
    const [page, setPage] = useState(1);
    const [active, setActive] = useState(false);
    const [refresh, setRefresh] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [queryValue, setQueryValue] = useState('');
    const [isWidthrawalReqDeclineAlertVisible, setIsWidthrawalReqDeclineAlertVisible] = useState(false);
    const [selectedWithdrawalRequestId, setSelectedWithdrawalRequestId] = useState(null);
    const { adminDetails_ } = useSelector((state) => state.admin);
    const [updateFormData, setUpdateFormData] = useState({
        userId: '',
        transactionId: '',
        mainType: '',
        amount: '',
        description: '',
        transactionNumber: '',
    });
    const limit = 10;
    const { withdrawalRequests, loading: withdrawalRequestsLoading } = useSelector((state) => state.admin);
    const openUpdateWalletModal = (userId, fullname, shop_Id, amount, status, description, id) => {
        setActive(true);
        setUserDetails({ userId, fullname, shop_Id, amount, status, description, id });
    }

    useEffect(() => {
        const id = localStorage.getItem('advizo');
        setAdminIdLocal(id);
    }, []);

    useEffect(() => {
        dispatch(fetchAdminDetails({ adminIdLocal, app }))
        dispatch(fetchWithdrawalRequests({ adminIdLocal, page, limit, app, searchQuery }));
    }, [dispatch, adminIdLocal, page, limit, refresh, searchQuery]);

    const updateWallet = async () => {
        const token = await getAppBridgeToken(app);

        try {
            const response = await axios.put(`${process.env.REACT_APP_BACKEND_HOST}/admin/update/widthrwal/req/${adminIdLocal}`, {
                ...updateFormData, userId: userDetails.userId,
            }, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (response.data.success === true) {
                setRefresh((prev) => !prev);
                setActive(false);
                showToast(response.data?.message);
            } else {
                setActive(false);
                showToast(response.data?.message, true);
            }
        } catch (error) {

            showToast(error.response.data.message, true);
        }
    }

    const openDeclineModal = (withdrawalRequestId) => {
        setSelectedWithdrawalRequestId(withdrawalRequestId);
        setIsWidthrawalReqDeclineAlertVisible(true);
    };

    const handleDecline = async (withdrawalRequestId) => {
        const token = await getAppBridgeToken(app);
        try {
            const response = await axios.put(`${process.env.REACT_APP_BACKEND_HOST}/admin/declin/widthrwal/req/${withdrawalRequestId}`, {

            }, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (response.data.success === true) {
                setIsWidthrawalReqDeclineAlertVisible(false);
                showToast(response.data.message);
                setRefresh((prev) => !prev);
            } else {
                setIsWidthrawalReqDeclineAlertVisible(false);
                showToast(response.data.message, true);
            }
        } catch (error) {
            setIsWidthrawalReqDeclineAlertVisible(false);
            showToast(error.response.data.message, true);
        }
    };

    const formatDate = (iso) =>
        new Date(iso).toLocaleDateString();

    const tableData = withdrawalRequests?.data?.map((item) => ({
        id: item?._id,
        userId: item?.consultantId?._id,
        shop_id: item?.shopId || '-',
        fullname: item?.consultantId?.fullname || '-',
        userType: item?.consultantId?.userType || '-',
        amount: item?.amount || '-',
        status: item?.status || '-',
        description: item?.note || '-',
        updatedAt: formatDate(item?.createdAt),
    })) || [];

    const handleReset = () => {
        setPage(1);
        setSearchQuery("");
        setQueryValue("");
    };

    const totalItems = withdrawalRequests?.totalItems || withdrawalRequests?.data?.length || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return (
        <Fragment>
            <WidthrawalReqDeclineAlert
                isWidthrawalReqDeclineAlertVisible={isWidthrawalReqDeclineAlertVisible}
                setIsWidthrawalReqDeclineAlertVisible={setIsWidthrawalReqDeclineAlertVisible}
                handleDecline={handleDecline}
                withdrawalRequestId={selectedWithdrawalRequestId}
            />
            <WidthrwalRequestApprove open={active} onClose={() => setActive(false)} userDetails={userDetails} updateFormData={updateFormData} setUpdateFormData={setUpdateFormData} updateWallet={updateWallet} />
            <Page fullWidth>
                <div className={styles.page}>
                    <div className={styles.header}>
                        <div className={styles.headerLeft}>
                            <h1 className={styles.title}>Withdrawal Requests</h1>
                            <p className={styles.subtitle}>
                                Consultant payout requests waiting for approval.
                            </p>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.toolbar_end}>
                            <div className={styles.toolbarLeft}>
                                <div className={styles.searchWrap}>
                                    <span className={styles.searchIcon}><Icon source={SearchIcon} /></span>
                                    <input
                                        className={styles.searchInput}
                                        value={queryValue}
                                        onChange={(e) => {
                                            setQueryValue(e.target.value);
                                            setSearchQuery(e.target.value);
                                            setPage(1);
                                        }}
                                        placeholder="Search withdrawal requests"
                                    />
                                </div>
                            </div>
                            {/* <button type="button" className={styles.resetButton} onClick={handleReset}>
                                Reset
                            </button> */}
                        </div>

                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Sr. No.</th>
                                        <th>Name</th>
                                        <th>Amount</th>
                                        <th>Status</th>
                                        <th>Description</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {withdrawalRequestsLoading ? (
                                        <tr>
                                            <td colSpan={6}>
                                                <div className={styles.loadingState}>Loading…</div>
                                            </td>
                                        </tr>
                                    ) : tableData.length === 0 ? (
                                        <tr>
                                            <td colSpan={6}>
                                                <div className={styles.emptyState}>No withdrawal requests found.</div>
                                            </td>
                                        </tr>
                                    ) : (
                                        tableData.map((row, index) => {
                                            const serialNumber = (page - 1) * limit + index + 1;
                                            return (
                                                <tr key={row.id}>
                                                    <td>{serialNumber}</td>
                                                    <td className={styles.cellPrimary}>{row.fullname}</td>
                                                    <td className={styles.amount}>
                                                        <MoneyValue currency={adminDetails_?.currency}>
                                                            {row.amount !== '-' ? parseFloat(row.amount).toFixed(2) : '0.00'}
                                                        </MoneyValue>
                                                    </td>
                                                    <td>
                                                        <span className={`${styles.badge} ${row.status === "paid" ? styles.badgeSuccess : styles.badgeNeutral}`}>
                                                            {row.status}
                                                        </span>
                                                    </td>
                                                    <td className={styles.cellWrap}>{row.description}</td>
                                                    <td>
                                                        <div className={styles.rowActions}>
                                                            <button
                                                                type="button"
                                                                className={styles.iconButton}
                                                                title="Mark paid"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openUpdateWalletModal(row.userId, row.fullname, row.shop_id, row.amount, row.status, row.description, row.id);
                                                                }}
                                                            >
                                                                💳
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`${styles.iconButton} ${styles.deleteButton}`}
                                                                title="Decline"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    openDeclineModal(row.id);
                                                                }}
                                                            >
                                                                ✕
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
                                Showing {tableData.length} of {totalItems} withdrawal requests
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

export default WithdrawalRequest
