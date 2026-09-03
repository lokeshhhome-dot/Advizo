import { Page } from "@shopify/polaris";
import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import MoneyValue from "../components/Helper/MoneyValue";
import { fetchConsultants, fetchAdminDetails } from "../components/Redux/slices/adminSlice";
import { useDispatch, useSelector } from "react-redux";
import { UserAlert } from "../components/AlertModel/UserAlert";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { Redirect } from "@shopify/app-bridge/actions";
import { usePolarisToast } from "../components/AlertModel/PolariesTostContext";
import { FullPageSpinner } from "../components/loading/PageSkeletons";
import { getAppBridgeToken } from "../utils/getAppBridgeToken";
import styles from "./ConsultantList.module.css";

const PAGE_SIZE = 10;
const AVATAR_COLORS = ["#2E7D32", "#1565C0", "#C2185B", "#6A1B9A", "#E65100", "#00838F"];

function avatarColorFor(name) {
  const str = name || "?";
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsFor(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function Avatar({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        className={styles.avatar}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className={styles.avatarInitials}
      style={{ background: avatarColorFor(name) }}
    >
      {initialsFor(name)}
    </div>
  );
}

function ConsultantList() {
  const app = useAppBridge();
  const dispatch = useDispatch();

  const redirect = useMemo(() => {
    if (!app) return null;
    return Redirect.create(app);
  }, [app]);

  const goToAddConsultant = () => {
    if (!redirect) return;
    redirect.dispatch(Redirect.Action.APP, "/consultant-list/add-consultant");
  };
  const navigate = useNavigate();
  const [queryValue, setQueryValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [isUserAlertVisible, setIsUserAlertVisible] = useState(false);
  const [consultantId, setConsultantId] = useState(null);
  const [adminIdLocal, setAdminIdLocal] = useState(null);
  const { showToast } = usePolarisToast();
  const { consultants, consultantsLoading: consultantLoading } = useSelector(
    (state) => state.admin,
  );
  const { adminDetails_ } = useSelector((state) => state.admin);

  useEffect(() => {
    const id = localStorage.getItem("consultly");
    setAdminIdLocal(id);
  }, []);

  useEffect(() => {
    if (!adminIdLocal) return;
    dispatch(fetchConsultants({ adminIdLocal, app }));
  }, [dispatch, adminIdLocal, app]);

  useEffect(() => {
    if (adminIdLocal) {
      dispatch(fetchAdminDetails({ adminIdLocal, app }));
    }
  }, [adminIdLocal, app]);

  const refreshConsultants = useCallback(() => {
    if (!adminIdLocal) return;
    dispatch(fetchConsultants({ adminIdLocal, app }));
  }, [adminIdLocal, app, dispatch]);

  const consultantsData = consultants?.findConsultant || [];

  const filteredConsultants = useMemo(() => {
    return (consultants?.findConsultant || []).filter((consultant) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && consultant.consultantStatus) ||
        (statusFilter === "inactive" && !consultant.consultantStatus);

      let matchesQuery = true;
      if (queryValue.trim()) {
        const query = queryValue.toLowerCase();
        matchesQuery = [
          consultant.fullname,
          consultant.email,
          consultant.profession,
          consultant.specialization,
        ].some((value) => String(value ?? "").toLowerCase().includes(query));
      }

      return matchesStatus && matchesQuery;
    });
  }, [consultants?.findConsultant, statusFilter, queryValue]);

  // Reset to page 1 whenever the filtered set changes shape, so a search
  // that narrows the results doesn't leave the view on a now-empty page.
  useEffect(() => {
    setPage(1);
  }, [queryValue, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredConsultants.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedConsultants = filteredConsultants.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const handleEdit = useCallback(
    (_id) => {
      navigate(`/consultant-list/add-consultant?id=${_id}`);
    },
    [navigate],
  );

  const handleDeleteClick = useCallback((_id) => {
    setConsultantId(_id);
    setIsUserAlertVisible(true);
  }, []);

  const handleDelete = async () => {
    try {
      const token = await getAppBridgeToken(app);
      if (!token) {
        showToast("Missing Shopify session token. Please refresh and try again.", true);
        return;
      }

      const url = `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/delete-consultant/${consultantId}`;
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        setIsUserAlertVisible(false);
        showToast("Consultant deleted successfully");
        refreshConsultants();
      } else {
        showToast("Failed to delete consultant", true);
      }
    } catch (error) {
      console.error("Error deleting consultant:", error);
    }
  };

  if (adminIdLocal && consultantLoading && !consultantsData?.length) {
    return <FullPageSpinner label="Loading consultants" />;
  }

  return (
    <Fragment>
      <UserAlert
        isUserAlertVisible={isUserAlertVisible}
        setIsUserAlertVisible={setIsUserAlertVisible}
        handleDelete={handleDelete}
        consultantId={consultantId}
      />
      <Page fullWidth>
        <div className={styles.page}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <h1 className={styles.title}>Consultants</h1>
              <p className={styles.subtitle}>
                The experts customers can book for chat, voice, and video sessions.
              </p>
            </div>
            <button type="button" className={styles.addButton} onClick={goToAddConsultant}>
              + Add consultant
            </button>
          </div>

          <div className={styles.card}>
            <div className={styles.toolbar}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  className={styles.searchInput}
                  value={queryValue}
                  onChange={(e) => setQueryValue(e.target.value)}
                  placeholder="Search consultants"
                />
              </div>
              <div className={styles.toolbarRight}>
                <select
                  className={styles.statusSelect}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <span className={styles.resultsCount}>
                  {filteredConsultants.length} result
                  {filteredConsultants.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {pagedConsultants.length === 0 ? (
              <div className={styles.emptyState}>
                {consultantsData.length === 0
                  ? "No consultants added yet."
                  : "No consultants match your search."}
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Consultant</th>
                      <th>Specialization</th>
                      <th>Chat</th>
                      <th>Call</th>
                      <th>Video</th>
                      <th>Wallet</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedConsultants.map((consultant) => {
                      const {
                        _id,
                        fullname,
                        email,
                        specialization,
                        chatPerMinute,
                        voicePerMinute,
                        videoPerMinute,
                        walletBalance,
                        consultantStatus,
                        profileImage,
                      } = consultant;

                      return (
                        <tr key={_id}>
                          <td>
                            <div className={styles.consultantCell}>
                              <Avatar
                                src={
                                  profileImage
                                    ? profileImage.replace(/\\/g, "/")
                                    : null
                                }
                                name={fullname}
                              />
                              <div className={styles.consultantText}>
                                <span className={styles.consultantName}>
                                  {fullname}
                                </span>
                                <span className={styles.consultantEmail}>
                                  {email}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>{specialization || "—"}</td>
                          <td className={styles.amount}>
                            {chatPerMinute ? (
                              <MoneyValue currency={adminDetails_?.currency}>
                                {chatPerMinute}
                              </MoneyValue>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className={styles.amount}>
                            {voicePerMinute ? (
                              <MoneyValue currency={adminDetails_?.currency}>
                                {voicePerMinute}
                              </MoneyValue>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className={styles.amount}>
                            {videoPerMinute ? (
                              <MoneyValue currency={adminDetails_?.currency}>
                                {videoPerMinute}
                              </MoneyValue>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className={styles.amount}>
                            <MoneyValue currency={adminDetails_?.currency}>
                              {walletBalance ? parseFloat(walletBalance).toFixed(2) : "0.00"}
                            </MoneyValue>
                          </td>
                          <td>
                            <span
                              className={`${styles.statusBadge} ${
                                consultantStatus ? styles.statusActive : styles.statusInactive
                              }`}
                            >
                              {consultantStatus ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            <div className={styles.rowActions}>
                              <button
                                type="button"
                                className={styles.iconButton}
                                aria-label="Edit consultant"
                                onClick={() => handleEdit(_id)}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className={`${styles.iconButton} ${styles.deleteButton}`}
                                aria-label="Delete consultant"
                                onClick={() => handleDeleteClick(_id)}
                              >
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className={styles.footer}>
              <span className={styles.footerText}>
                Showing {pagedConsultants.length} of {filteredConsultants.length} consultants
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
    </Fragment>
  );
}

export default ConsultantList;
