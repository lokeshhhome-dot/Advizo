import React, { Fragment, useState, useCallback, useEffect, useMemo } from 'react'
import { Icon, Page } from '@shopify/polaris'
import MoneyValue from '../components/Helper/MoneyValue'
import { useAppBridge } from '../components/createContext/AppBridgeContext'
import { Redirect } from '@shopify/app-bridge/actions'
import { useDispatch, useSelector } from 'react-redux'
import { fetchAdminDetails } from '../components/Redux/slices/adminSlice'
import { VoucherDeleteAlert } from '../components/AlertModel/VoucherDeleteAlert'
import axios from 'axios'
import { usePolarisToast } from '../components/AlertModel/PolariesTostContext'
import { getAppBridgeToken } from '../utils/getAppBridgeToken'
import styles from './VoucherTable.module.css'

const PAGE_SIZE = 10;
const ICON_COLORS = ["#2E7D32", "#1565C0", "#C2185B", "#6A1B9A", "#E65100", "#00838F"];

function iconColorFor(code) {
  const str = code || "?";
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return ICON_COLORS[Math.abs(hash) % ICON_COLORS.length];
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const EMPTY_FORM = { voucherCode: "", totalCoin: "", extraCoin: "" };

function VoucherTable() {
    const app = useAppBridge();
    const dispatch = useDispatch();
    const { showToast } = usePolarisToast();
    const redirect = useMemo(() => {
        if (!app) return null;
        return Redirect.create(app);
    }, [app]);

    // Add voucher stays its own page (VoucherSettings.js) — only editing an
    // existing voucher opens in a modal here.
    const goToAddVoucher = useCallback(() => {
        if (!redirect) return;
        redirect.dispatch(Redirect.Action.APP, '/voucher-management/voucher');
    }, [redirect]);

    const [queryValue, setQueryValue] = useState("");
    const [page, setPage] = useState(1);
    const [adminIdLocal, setAdminIdLocal] = useState(null);
    const [isUserAlertVisible, setIsUserAlertVisible] = useState(false);
    const [voucherId, setVoucherId] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [reLoadApi, setReLoadApi] = useState(false);
    const { adminDetails_, loading: adminDetailsLoading } = useSelector((state) => state.admin);

    // Add/Edit voucher modal
    const [modalOpen, setModalOpen] = useState(false);
    const [editingVoucher, setEditingVoucher] = useState(null);
    const [modalForm, setModalForm] = useState(EMPTY_FORM);
    const [modalErrors, setModalErrors] = useState({});
    const [modalSubmitting, setModalSubmitting] = useState(false);

    useEffect(() => {
        const id = localStorage.getItem('advizo');
        setAdminIdLocal(id);
    }, [])

    useEffect(() => {
        if (adminIdLocal) {
            dispatch(fetchAdminDetails({ adminIdLocal, app }))
        }
    }, [dispatch, adminIdLocal, app, reLoadApi])

    const vouchers = useMemo(() => {
        if (!Array.isArray(adminDetails_?.vouchers)) return [];
        return adminDetails_.vouchers.map((voucher, index) => ({
            id: voucher._id || voucher.id || index + 1,
            voucherCode: voucher.voucherCode || "",
            totalCoin: voucher.totalCoin?.$numberDecimal
                ? parseFloat(voucher.totalCoin.$numberDecimal)
                : Number(voucher.totalCoin) || 0,
            extraCoin: voucher.extraCoin?.$numberDecimal
                ? parseFloat(voucher.extraCoin.$numberDecimal)
                : Number(voucher.extraCoin) || 0,
            createdAt: voucher.createdAt,
        }));
    }, [adminDetails_?.vouchers]);

    const filteredVouchers = useMemo(() => {
        if (!queryValue.trim()) return vouchers;
        const q = queryValue.toLowerCase();
        return vouchers.filter((v) => v.voucherCode.toLowerCase().includes(q));
    }, [vouchers, queryValue]);

    useEffect(() => {
        setPage(1);
    }, [queryValue]);

    const totalPages = Math.max(1, Math.ceil(filteredVouchers.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pagedVouchers = filteredVouchers.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
    );

    //-------------------------- delete -------------------

    const handleOpenDeleteModal = (id) => {
        setVoucherId(id);
        setIsUserAlertVisible(true);
    };

    const handleConfirmDelete = async (id) => {
        const token = await getAppBridgeToken(app);
        setDeleteLoading(true);
        try {
            const response = await axios.delete(`${process.env.REACT_APP_BACKEND_HOST}/admin/delete/voucher/${adminIdLocal}/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.status === 200) {
                showToast(response.data?.message);
                setReLoadApi(prev => !prev);
                setIsUserAlertVisible(false);
                setVoucherId(null);
            } else {
                showToast(response.data?.message || 'Failed to delete voucher', true);
            }
        } catch (error) {
            console.error("Error deleting voucher:", error);
            showToast(error.response?.data?.message || 'Failed to delete voucher', true);
        } finally {
            setDeleteLoading(false);
        }
    }

    //-------------------------- edit modal -------------------

    const openEditModal = useCallback((voucher) => {
        setEditingVoucher(voucher);
        setModalForm({
            voucherCode: voucher.voucherCode || "",
            totalCoin: String(voucher.totalCoin ?? ""),
            extraCoin: String(voucher.extraCoin ?? ""),
        });
        setModalErrors({});
        setModalOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        if (modalSubmitting) return;
        setModalOpen(false);
    }, [modalSubmitting]);

    const handleModalFieldChange = useCallback((field) => (value) => {
        setModalForm((prev) => ({ ...prev, [field]: value }));
        setModalErrors((prev) => ({ ...prev, [field]: "" }));
    }, []);

    const validateModalForm = useCallback(() => {
        const errs = {};
        if (!modalForm.voucherCode.trim()) {
            errs.voucherCode = "Voucher code is required";
        }
        if (modalForm.totalCoin === "" || isNaN(Number(modalForm.totalCoin)) || Number(modalForm.totalCoin) < 0) {
            errs.totalCoin = "Enter a valid amount";
        }
        if (modalForm.extraCoin !== "" && (isNaN(Number(modalForm.extraCoin)) || Number(modalForm.extraCoin) < 0)) {
            errs.extraCoin = "Enter a valid amount";
        }
        setModalErrors(errs);
        return Object.keys(errs).length === 0;
    }, [modalForm]);

    const handleModalSubmit = useCallback(async () => {
        if (!editingVoucher || !validateModalForm()) return;
        setModalSubmitting(true);
        try {
            const token = await getAppBridgeToken(app);
            const payload = {
                voucherCode: modalForm.voucherCode.trim(),
                totalCoin: Number(modalForm.totalCoin),
                extraCoin: Number(modalForm.extraCoin) || 0,
            };

            const response = await axios.put(
                `${process.env.REACT_APP_BACKEND_HOST}/admin/admin/voucher-updates/${adminIdLocal}/${editingVoucher.id}`,
                payload,
                { headers: { Authorization: `Bearer ${token}` } },
            );

            if (response.status === 200) {
                showToast(response.data?.message || "Voucher updated successfully.");
                setModalOpen(false);
                setReLoadApi((prev) => !prev);
            } else {
                showToast(response.data?.message || "Failed to update voucher", true);
            }
        } catch (error) {
            console.error("Error updating voucher:", error);
            showToast(error.response?.data?.message || "Failed to update voucher", true);
        } finally {
            setModalSubmitting(false);
        }
    }, [modalForm, editingVoucher, adminIdLocal, app, showToast, validateModalForm]);

    return (
        <Fragment>
            <VoucherDeleteAlert
                isUserAlertVisible={isUserAlertVisible}
                setIsUserAlertVisible={setIsUserAlertVisible}
                handleDelete={handleConfirmDelete}
                voucherId={voucherId}
                adminIdLocal={adminIdLocal}
                loading={deleteLoading}
            />

            <Page fullWidth>
                <div className={styles.page}>
                    <div className={styles.header}>
                        <div className={styles.headerLeft}>
                            <h1 className={styles.title}>Vouchers</h1>
                            <p className={styles.subtitle}>
                                Codes that top up a shopper's wallet.
                            </p>
                        </div>
                        <button type="button" className={styles.addButton} onClick={goToAddVoucher}>
                            + Add voucher
                        </button>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.toolbar}>
                            <div className={styles.searchWrap}>
                                <span className={styles.searchIcon}><Icon source={SearchIcon} /></span>
                                <input
                                    className={styles.searchInput}
                                    value={queryValue}
                                    onChange={(e) => setQueryValue(e.target.value)}
                                    placeholder="Search vouchers"
                                />
                            </div>
                            <span className={styles.resultsCount}>
                                {filteredVouchers.length} result{filteredVouchers.length === 1 ? "" : "s"}
                            </span>
                        </div>

                        {adminDetailsLoading && vouchers.length === 0 ? (
                            <div className={styles.emptyState}>Loading vouchers…</div>
                        ) : pagedVouchers.length === 0 ? (
                            <div className={styles.emptyState}>
                                {vouchers.length === 0
                                    ? "No vouchers created yet."
                                    : "No vouchers match your search."}
                            </div>
                        ) : (
                            <div className={styles.tableWrap}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Voucher code</th>
                                            <th>Customer pays</th>
                                            <th>Bonus credit</th>
                                            <th>Value</th>
                                            <th>Created</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagedVouchers.map((voucher) => (
                                            <tr key={voucher.id}>
                                                <td>
                                                    <div className={styles.codeCell}>
                                                        <span
                                                            className={styles.codeIcon}
                                                            style={{ background: iconColorFor(voucher.voucherCode) }}
                                                        >
                                                            🎟
                                                        </span>
                                                        <span className={styles.codeText}>
                                                            {voucher.voucherCode || "—"}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className={styles.amount}>
                                                    <MoneyValue currency={adminDetails_?.currency}>
                                                        {voucher.totalCoin}
                                                    </MoneyValue>
                                                </td>
                                                <td className={styles.bonusAmount}>
                                                    +<MoneyValue currency={adminDetails_?.currency}>
                                                        {voucher.extraCoin}
                                                    </MoneyValue>
                                                </td>
                                                <td className={styles.valueAmount}>
                                                    <MoneyValue currency={adminDetails_?.currency}>
                                                        {voucher.totalCoin + voucher.extraCoin}
                                                    </MoneyValue>
                                                </td>
                                                <td className={styles.createdAt}>
                                                    {formatDate(voucher.createdAt)}
                                                </td>
                                                <td>
                                                    <div className={styles.rowActions}>
                                                        <button
                                                            type="button"
                                                            className={styles.iconButton}
                                                            aria-label="Edit voucher"
                                                            onClick={() => openEditModal(voucher)}
                                                        >
                                                            ✎
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`${styles.iconButton} ${styles.deleteButton}`}
                                                            aria-label="Delete voucher"
                                                            onClick={() => handleOpenDeleteModal(voucher.id)}
                                                        >
                                                            🗑
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className={styles.footer}>
                            <span className={styles.footerText}>
                                Showing {pagedVouchers.length} of {filteredVouchers.length} vouchers
                            </span>
                            {totalPages > 1 && (
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button
                                        type="button"
                                        className={styles.pagerButton}
                                        disabled={currentPage <= 1}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    >
                                        ‹
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.pagerButton}
                                        disabled={currentPage >= totalPages}
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

            {modalOpen && (
                <div className={styles.modalOverlay} onClick={closeModal}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>Edit voucher</h3>
                            <button type="button" className={styles.modalClose} onClick={closeModal}>
                                ×
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>Voucher code *</label>
                                <input
                                    className={`${styles.input} ${modalErrors.voucherCode ? styles.inputError : ""}`}
                                    value={modalForm.voucherCode}
                                    onChange={(e) => handleModalFieldChange("voucherCode")(e.target.value.toUpperCase())}
                                    placeholder="WELCOME50"
                                />
                                {modalErrors.voucherCode ? (
                                    <span className={styles.fieldError}>{modalErrors.voucherCode}</span>
                                ) : (
                                    <span className={styles.fieldHint}>
                                        Customers enter this code to top up their wallet
                                    </span>
                                )}
                            </div>

                            <div className={styles.fieldRow}>
                                <div className={styles.field}>
                                    <label className={styles.fieldLabel}>Customer pays</label>
                                    <div className={styles.amountField}>
                                        <span className={styles.amountPrefix}>
                                            {adminDetails_?.currency || "₹"}
                                        </span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className={`${styles.input} ${modalErrors.totalCoin ? styles.inputError : ""}`}
                                            value={modalForm.totalCoin}
                                            onChange={(e) => handleModalFieldChange("totalCoin")(e.target.value)}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    {modalErrors.totalCoin && (
                                        <span className={styles.fieldError}>{modalErrors.totalCoin}</span>
                                    )}
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.fieldLabel}>Bonus credit added</label>
                                    <div className={styles.amountField}>
                                        <span className={styles.amountPrefix}>
                                            {adminDetails_?.currency || "₹"}
                                        </span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className={`${styles.input} ${modalErrors.extraCoin ? styles.inputError : ""}`}
                                            value={modalForm.extraCoin}
                                            onChange={(e) => handleModalFieldChange("extraCoin")(e.target.value)}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    {modalErrors.extraCoin ? (
                                        <span className={styles.fieldError}>{modalErrors.extraCoin}</span>
                                    ) : (
                                        <span className={styles.fieldHint}>Extra wallet balance as a gift</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            <button type="button" className={styles.cancelButton} onClick={closeModal} disabled={modalSubmitting}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={styles.submitButton}
                                onClick={handleModalSubmit}
                                disabled={modalSubmitting}
                            >
                                {modalSubmitting ? "Saving…" : "Update voucher"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Fragment>
    )
}

export default VoucherTable
