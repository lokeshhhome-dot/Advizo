import { Icon, Page } from "@shopify/polaris";
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  Fragment,
} from "react";
import { useNavigate } from "react-router-dom";

import MoneyValue from "../components/Helper/MoneyValue";

import {
  fetchConsultants,
  fetchAdminDetails,
} from "../components/Redux/slices/adminSlice";

import { useDispatch, useSelector } from "react-redux";

import { UserAlert } from "../components/AlertModel/UserAlert";

import { useAppBridge } from "../components/createContext/AppBridgeContext";

import { Redirect } from "@shopify/app-bridge/actions";

import { usePolarisToast } from "../components/AlertModel/PolariesTostContext";

import { FullPageSpinner } from "../components/loading/PageSkeletons";

import { getAppBridgeToken } from "../utils/getAppBridgeToken";

import styles from "./ConsultantList.module.css";

import { SearchIcon } from "@shopify/polaris-icons";


const PAGE_SIZE = 10;


/* =========================================================
   AVATAR COLORS
========================================================= */

const AVATAR_COLORS = [
  "#2E7D32",
  "#1565C0",
  "#C2185B",
  "#6A1B9A",
  "#E65100",
  "#00838F",
];


function avatarColorFor(name) {
  const str = name || "?";

  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}


function initialsFor(name) {
  const parts = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";

  return (
    parts[0][0] +
    (parts[1]?.[0] || "")
  ).toUpperCase();
}


/* =========================================================
   AVATAR
========================================================= */

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
      style={{
        background: avatarColorFor(name),
      }}
    >
      {initialsFor(name)}
    </div>
  );
}


/* =========================================================
   SPECIALIZATION HELPERS
========================================================= */

/*
  Supports:

  specialization: "Vedic Astrology"

  OR

  specialization:
  "Vedic Astrology, Numerology, Tarot"

  OR

  specialization:
  ["Vedic Astrology", "Numerology", "Tarot"]
*/

function normalizeSpecializations(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === "string") {
          return item.split(",");
        }

        return [item];
      })
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}


/* =========================================================
   SPECIALIZATION ICON
========================================================= */

function SpecializationIcon({ category }) {
  const value = String(category || "").toLowerCase();

  /*
    Simple inline SVG icons are used instead of another icon
    package, so this page does not add another dependency.
  */

  if (
    value.includes("vedic") ||
    value.includes("astrology") ||
    value.includes("zodiac")
  ) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="8.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M12 3.5v17M3.5 12h17M6.1 6.1l11.8 11.8M17.9 6.1 6.1 17.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <circle
          cx="12"
          cy="12"
          r="2"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (value.includes("tarot")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect
          x="6"
          y="3"
          width="12"
          height="18"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <circle
          cx="12"
          cy="9"
          r="2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M9 16h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (value.includes("numerology")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="8.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M9 8h3v8M9 16h6M15 8h-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (value.includes("palm")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M8 20c-1.8-2.3-3.1-4.8-3.1-7.4V8.3a1.4 1.4 0 0 1 2.8 0v3.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M7.7 11V5.5a1.35 1.35 0 0 1 2.7 0v5.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M10.4 10V4.7a1.35 1.35 0 0 1 2.7 0v5.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M13.1 10V6a1.35 1.35 0 0 1 2.7 0v5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M15.8 11V8.3a1.35 1.35 0 0 1 2.7 0v5.2c0 4-2.2 6.5-5.7 6.5H9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (value.includes("vastu")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 10.5 12 4l8 6.5v8.5H4z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M9 19v-5h6v5M12 7.5v4M10 9.5h4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (value.includes("reiki") || value.includes("healing")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M12 8v6M9 11h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (
    value.includes("spiritual") ||
    value.includes("meditation")
  ) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 4c4.5 1.8 6.5 5.2 5.2 9.1C16 17 12 20 8 19.7c-.7-3.8.5-7.2 3.7-9.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M12 4c-2.3 1.5-3.3 3.7-2.9 6.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (
    value.includes("psychic") ||
    value.includes("intuition")
  ) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 4.2a7.8 7.8 0 0 0-4.8 14l.8 1.6h8l.8-1.6a7.8 7.8 0 0 0-4.8-14Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M9 12a3 3 0 0 1 6 0M10 16h4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (
    value.includes("angel") ||
    value.includes("oracle")
  ) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="m12 4 1.4 4.2L18 10l-4.6 1.8L12 16l-1.4-4.2L6 10l4.6-1.8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="m18.5 15 .6 1.8 1.9.7-1.9.7-.6 1.8-.6-1.8-1.9-.7 1.9-.7ZM6 4l.5 1.4L8 6l-1.5.6L6 8l-.5-1.4L4 6l1.5-.6Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  /* Default category icon */
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8.5 12h7M12 8.5v7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}


/* =========================================================
   CATEGORY CHIP
========================================================= */

function CategoryChip({ category, index }) {
  return (
    <span
      className={`${styles.categoryChip} ${
        styles[`categoryTone${index % 5}`]
      }`}
    >
      <span className={styles.categoryIcon}>
        <SpecializationIcon category={category} />
      </span>

      <span className={styles.categoryName}>
        {category}
      </span>
    </span>
  );
}


/* =========================================================
   CONSULTANT LIST
========================================================= */

function ConsultantList() {
  const app = useAppBridge();

  const dispatch = useDispatch();

  const navigate = useNavigate();


  /* ---------------------------------------------------------
     REDIRECT
  --------------------------------------------------------- */

  const redirect = useMemo(() => {
    if (!app) return null;

    return Redirect.create(app);
  }, [app]);


  const goToAddConsultant = useCallback(() => {
    if (!redirect) return;

    redirect.dispatch(
      Redirect.Action.APP,
      "/consultants/add-consultant"
    );
  }, [redirect]);


  /* ---------------------------------------------------------
     STATE
  --------------------------------------------------------- */

  const [queryValue, setQueryValue] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");

  const [page, setPage] = useState(1);

  const [isUserAlertVisible, setIsUserAlertVisible] =
    useState(false);

  const [consultantId, setConsultantId] =
    useState(null);

  const [adminIdLocal, setAdminIdLocal] =
    useState(null);


  const { showToast } = usePolarisToast();


  const {
    consultants,
    consultantsLoading: consultantLoading,
  } = useSelector((state) => state.admin);


  const { adminDetails_ } =
    useSelector((state) => state.admin);


  /* ---------------------------------------------------------
     ADMIN ID
  --------------------------------------------------------- */

  useEffect(() => {
    const id = localStorage.getItem("advizo");

    setAdminIdLocal(id);
  }, []);


  /* ---------------------------------------------------------
     FETCH CONSULTANTS
  --------------------------------------------------------- */

  useEffect(() => {
    if (!adminIdLocal) return;

    dispatch(
      fetchConsultants({
        adminIdLocal,
        app,
      })
    );
  }, [
    dispatch,
    adminIdLocal,
    app,
  ]);


  /* ---------------------------------------------------------
     FETCH ADMIN DETAILS
  --------------------------------------------------------- */

  useEffect(() => {
    if (!adminIdLocal) return;

    dispatch(
      fetchAdminDetails({
        adminIdLocal,
        app,
      })
    );
  }, [
    adminIdLocal,
    app,
    dispatch,
  ]);


  /* ---------------------------------------------------------
     REFRESH CONSULTANTS
  --------------------------------------------------------- */

  const refreshConsultants = useCallback(() => {
    if (!adminIdLocal) return;

    dispatch(
      fetchConsultants({
        adminIdLocal,
        app,
      })
    );
  }, [
    adminIdLocal,
    app,
    dispatch,
  ]);


  /* ---------------------------------------------------------
     CONSULTANT DATA
  --------------------------------------------------------- */

  const consultantsData =
    consultants?.findConsultant || [];


  /* ---------------------------------------------------------
     SEARCH + STATUS FILTER
  --------------------------------------------------------- */

  const filteredConsultants = useMemo(() => {
    return consultantsData.filter((consultant) => {
      const matchesStatus =
        statusFilter === "all" ||
        (
          statusFilter === "active" &&
          consultant.consultantStatus
        ) ||
        (
          statusFilter === "inactive" &&
          !consultant.consultantStatus
        );


      let matchesQuery = true;


      if (queryValue.trim()) {
        const query =
          queryValue.trim().toLowerCase();


        const specializationText =
          Array.isArray(
            consultant.specialization
          )
            ? consultant.specialization.join(" ")
            : consultant.specialization;


        matchesQuery = [
          consultant.fullname,
          consultant.email,
          consultant.profession,
          specializationText,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(query)
        );
      }


      return matchesStatus && matchesQuery;
    });
  }, [
    consultantsData,
    statusFilter,
    queryValue,
  ]);


  /* ---------------------------------------------------------
     RESET PAGE
  --------------------------------------------------------- */

  useEffect(() => {
    setPage(1);
  }, [
    queryValue,
    statusFilter,
  ]);


  /* ---------------------------------------------------------
     PAGINATION
  --------------------------------------------------------- */

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredConsultants.length / PAGE_SIZE
    )
  );


  const currentPage = Math.min(
    page,
    totalPages
  );


  const pagedConsultants =
    filteredConsultants.slice(
      (currentPage - 1) * PAGE_SIZE,
      currentPage * PAGE_SIZE
    );


  /* ---------------------------------------------------------
     EDIT
  --------------------------------------------------------- */

  const handleEdit = useCallback(
    (_id) => {
      navigate(
        `/consultants/add-consultant?id=${_id}`
      );
    },
    [navigate]
  );


  /* ---------------------------------------------------------
     DELETE - OPEN CONFIRMATION
  --------------------------------------------------------- */

  const handleDeleteClick =
    useCallback((_id) => {
      setConsultantId(_id);
      setIsUserAlertVisible(true);
    }, []);


  /* ---------------------------------------------------------
     DELETE CONSULTANT
  --------------------------------------------------------- */

  const handleDelete = async () => {
    try {
      const token =
        await getAppBridgeToken(app);


      if (!token) {
        showToast(
          "Missing Shopify session token. Please refresh and try again.",
          true
        );

        return;
      }


      const url =
        `${process.env.REACT_APP_BACKEND_HOST}` +
        `/api-consultant/delete-consultant/${consultantId}`;


      const response =
        await fetch(url, {
          method: "DELETE",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },
        });


      if (response.ok) {
        setIsUserAlertVisible(false);

        setConsultantId(null);

        showToast(
          "Consultant deleted successfully"
        );

        refreshConsultants();
      } else {
        showToast(
          "Failed to delete consultant",
          true
        );
      }
    } catch (error) {
      console.error(
        "Error deleting consultant:",
        error
      );

      showToast(
        "Failed to delete consultant",
        true
      );
    }
  };


  /* ---------------------------------------------------------
     LOADING
  --------------------------------------------------------- */

  if (
    adminIdLocal &&
    consultantLoading &&
    !consultantsData?.length
  ) {
    return (
      <FullPageSpinner
        label="Loading consultants"
      />
    );
  }


  /* =========================================================
     UI
  ========================================================= */

  return (
    <Fragment>

      <UserAlert
        isUserAlertVisible={
          isUserAlertVisible
        }

        setIsUserAlertVisible={
          setIsUserAlertVisible
        }

        handleDelete={handleDelete}

        consultantId={consultantId}
      />


      <Page fullWidth>

        <div className={styles.page}>

          {/* =================================================
              HEADER
          ================================================= */}

          <div className={styles.header}>

            <div className={styles.headerLeft}>

              <div className={styles.titleRow}>

                <h1 className={styles.title}>
                  Consultants
                </h1>

                <span className={styles.directoryCount}>
                  {filteredConsultants.length}
                </span>

              </div>


              <p className={styles.subtitle}>
                Manage your experts, services,
                specializations and availability.
              </p>

            </div>


            <button
              type="button"
              className={styles.addButton}
              onClick={goToAddConsultant}
            >

              <span className={styles.addIcon}>
                +
              </span>

              Add consultant

            </button>

          </div>


          {/* =================================================
              DIRECTORY
          ================================================= */}

          <div className={styles.directory}>

            {/* =================================================
                TOOLBAR
            ================================================= */}

            <div className={styles.toolbar}>

              <div className={styles.searchWrap}>

                <span
                  className={styles.searchIcon}
                >
                  <Icon
                    size="small"
                    source={SearchIcon}
                  />
                </span>


                <input
                  className={
                    styles.searchInput
                  }

                  value={queryValue}

                  onChange={(e) =>
                    setQueryValue(
                      e.target.value
                    )
                  }

                  placeholder="Search by name, email, profession or specialization"
                />

              </div>


              <div
                className={
                  styles.toolbarRight
                }
              >

                <div
                  className={
                    styles.filterGroup
                  }
                >

                  <span
                    className={
                      styles.filterLabel
                    }
                  >
                    Status
                  </span>


                  <select
                    className={
                      styles.statusSelect
                    }

                    value={statusFilter}

                    onChange={(e) =>
                      setStatusFilter(
                        e.target.value
                      )
                    }
                  >

                    <option value="all">
                      All
                    </option>

                    <option value="active">
                      Active
                    </option>

                    <option value="inactive">
                      Inactive
                    </option>

                  </select>

                </div>


                <div
                  className={
                    styles.resultPill
                  }
                >

                  <span
                    className={
                      styles.resultNumber
                    }
                  >
                    {filteredConsultants.length}
                  </span>

                  <span>
                    {filteredConsultants.length === 1
                      ? "consultant"
                      : "consultants"}
                  </span>

                </div>

              </div>

            </div>


            {/* =================================================
                DIRECTORY INTRO BAR
            ================================================= */}

            {pagedConsultants.length > 0 && (
              <div
                className={
                  styles.directoryBar
                }
              >

                <div
                  className={
                    styles.directoryBarLeft
                  }
                >

                  <span
                    className={
                      styles.directoryBarTitle
                    }
                  >
                    Expert directory
                  </span>

                  <span
                    className={
                      styles.directoryBarDescription
                    }
                  >
                    Profiles and service rates
                  </span>

                </div>


                <div
                  className={
                    styles.directoryLegend
                  }
                >

                  <span
                    className={
                      styles.legendItem
                    }
                  >
                    <span
                      className={`${styles.legendDot} ${styles.legendActive}`}
                    />
                    Active
                  </span>


                  <span
                    className={
                      styles.legendItem
                    }
                  >
                    <span
                      className={`${styles.legendDot} ${styles.legendInactive}`}
                    />
                    Inactive
                  </span>

                </div>

              </div>
            )}


            {/* =================================================
                EMPTY STATE
            ================================================= */}

            {pagedConsultants.length === 0 ? (

              <div
                className={
                  styles.emptyState
                }
              >

                <div
                  className={
                    styles.emptyIcon
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      cx="12"
                      cy="8"
                      r="3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />

                    <path
                      d="M5 20c.7-3.7 3.1-5.5 7-5.5s6.3 1.8 7 5.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>


                <div
                  className={
                    styles.emptyTitle
                  }
                >
                  {consultantsData.length === 0
                    ? "No consultants added yet."
                    : "No consultants found"}
                </div>


                <div
                  className={
                    styles.emptyDescription
                  }
                >
                  {consultantsData.length === 0
                    ? "Add your first consultant to start offering expert sessions."
                    : "Try changing your search or status filter."}
                </div>

              </div>

            ) : (

              /* =================================================
                 CONSULTANT DIRECTORY
              ================================================= */

              <div
                className={
                  styles.consultantList
                }
              >

                {pagedConsultants.map(
                  (consultant) => {

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


                    const categories =
                      normalizeSpecializations(
                        specialization
                      );


                    return (

                      <div
                        className={
                          styles.consultantRow
                        }

                        key={_id}
                      >

                        {/* STATUS RAIL */}

                        <div
                          className={`${styles.rowIndicator} ${
                            consultantStatus
                              ? styles.rowIndicatorActive
                              : styles.rowIndicatorInactive
                          }`}
                        />


                        {/* =================================================
                            PROFILE
                        ================================================= */}

                        <div
                          className={
                            styles.consultantInfo
                          }
                        >

                          <div
                            className={
                              styles.avatarWrap
                            }
                          >

                            <Avatar
                              src={
                                profileImage
                                  ? profileImage.replace(
                                      /\\/g,
                                      "/"
                                    )
                                  : null
                              }

                              name={fullname}
                            />


                            <span
                              className={`${styles.onlineIndicator} ${
                                consultantStatus
                                  ? styles.online
                                  : styles.offline
                              }`}
                            />

                          </div>


                          <div
                            className={
                              styles.consultantText
                            }
                          >

                            <div
                              className={
                                styles.nameLine
                              }
                            >

                              <span
                                className={
                                  styles.consultantName
                                }
                              >
                                {fullname}
                              </span>


                              {consultant.profession && (
                                <span
                                  className={
                                    styles.professionTag
                                  }
                                >
                                  {consultant.profession}
                                </span>
                              )}

                            </div>


                            <span
                              className={
                                styles.consultantEmail
                              }
                            >
                              {email}
                            </span>


                            <span
                              className={
                                styles.profileMeta
                              }
                            >
                              Expert profile
                            </span>

                          </div>

                        </div>


                        {/* =================================================
                            SPECIALIZATION
                        ================================================= */}

                        <div
                          className={
                            styles.specializationCell
                          }
                        >

                          <span
                            className={
                              styles.sectionMiniLabel
                            }
                          >
                            SPECIALIZATION
                          </span>


                          {categories.length > 0 ? (

                            <div
                              className={
                                styles.categoryList
                              }
                            >

                              {categories
                                .slice(0, 3)
                                .map(
                                  (
                                    category,
                                    index
                                  ) => (
                                    <CategoryChip
                                      key={`${category}-${index}`}
                                      category={
                                        category
                                      }
                                      index={
                                        index
                                      }
                                    />
                                  )
                                )}


                              {categories.length > 3 && (

                                <span
                                  className={
                                    styles.moreCategories
                                  }
                                >
                                  +{categories.length - 3}
                                </span>

                              )}

                            </div>

                          ) : (

                            <span
                              className={
                                styles.noCategory
                              }
                            >
                              No specialization
                            </span>

                          )}

                        </div>


                        {/* =================================================
                            SERVICES
                        ================================================= */}

                        <div
                          className={
                            styles.serviceMetrics
                          }
                        >

                          {/* CHAT */}

                          <div
                            className={`${styles.metric} ${styles.metricChat}`}
                          >

                            <div
                              className={
                                styles.metricIcon
                              }
                            >
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  d="M5 5.5h14v10H9l-4 3v-13Z"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinejoin="round"
                                />

                                <path
                                  d="M8 9h8M8 12h5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.3"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </div>


                            <div
                              className={
                                styles.metricContent
                              }
                            >

                              <span
                                className={
                                  styles.metricLabel
                                }
                              >
                                Chat
                              </span>


                              <span
                                className={
                                  styles.metricValue
                                }
                              >
                                {chatPerMinute ? (
                                  <MoneyValue
                                    currency={
                                      adminDetails_?.currency
                                    }
                                  >
                                    {chatPerMinute}
                                  </MoneyValue>
                                ) : (
                                  "—"
                                )}
                              </span>


                              <span
                                className={
                                  styles.metricSuffix
                                }
                              >
                                / min
                              </span>

                            </div>

                          </div>


                          {/* CALL */}

                          <div
                            className={`${styles.metric} ${styles.metricCall}`}
                          >

                            <div
                              className={
                                styles.metricIcon
                              }
                            >
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  d="M7.2 4.5 9.5 4l2 4-2 1.5c.8 1.7 2.1 3 3.8 3.8l1.5-2 4 2-.5 2.3c-.3 1.4-1.6 2.4-3 2.4C9 18 6 15 6 8.7c0-1.5 1-3 2.2-4.2Z"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>


                            <div
                              className={
                                styles.metricContent
                              }
                            >

                              <span
                                className={
                                  styles.metricLabel
                                }
                              >
                                Call
                              </span>


                              <span
                                className={
                                  styles.metricValue
                                }
                              >
                                {voicePerMinute ? (
                                  <MoneyValue
                                    currency={
                                      adminDetails_?.currency
                                    }
                                  >
                                    {voicePerMinute}
                                  </MoneyValue>
                                ) : (
                                  "—"
                                )}
                              </span>


                              <span
                                className={
                                  styles.metricSuffix
                                }
                              >
                                / min
                              </span>

                            </div>

                          </div>


                          {/* VIDEO */}

                          <div
                            className={`${styles.metric} ${styles.metricVideo}`}
                          >

                            <div
                              className={
                                styles.metricIcon
                              }
                            >
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <rect
                                  x="4"
                                  y="7"
                                  width="12"
                                  height="10"
                                  rx="2"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                />

                                <path
                                  d="m16 10 4-2v8l-4-2"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>


                            <div
                              className={
                                styles.metricContent
                              }
                            >

                              <span
                                className={
                                  styles.metricLabel
                                }
                              >
                                Video
                              </span>


                              <span
                                className={
                                  styles.metricValue
                                }
                              >
                                {videoPerMinute ? (
                                  <MoneyValue
                                    currency={
                                      adminDetails_?.currency
                                    }
                                  >
                                    {videoPerMinute}
                                  </MoneyValue>
                                ) : (
                                  "—"
                                )}
                              </span>


                              <span
                                className={
                                  styles.metricSuffix
                                }
                              >
                                / min
                              </span>

                            </div>

                          </div>


                          {/* WALLET */}

                          <div
                            className={`${styles.metric} ${styles.metricWallet}`}
                          >

                            <div
                              className={
                                styles.metricIcon
                              }
                            >
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <rect
                                  x="3.5"
                                  y="6"
                                  width="17"
                                  height="12"
                                  rx="2"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                />

                                <path
                                  d="M16 11h4v3h-4a1.5 1.5 0 0 1 0-3Z"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                />
                              </svg>
                            </div>


                            <div
                              className={
                                styles.metricContent
                              }
                            >

                              <span
                                className={
                                  styles.metricLabel
                                }
                              >
                                Wallet
                              </span>


                              <span
                                className={
                                  styles.metricValue
                                }
                              >
                                <MoneyValue
                                  currency={
                                    adminDetails_?.currency
                                  }
                                >
                                  {walletBalance
                                    ? parseFloat(
                                        walletBalance
                                      ).toFixed(2)
                                    : "0.00"}
                                </MoneyValue>
                              </span>


                              <span
                                className={
                                  styles.metricSuffix
                                }
                              >
                                balance
                              </span>

                            </div>

                          </div>

                        </div>


                        {/* =================================================
                            STATUS
                        ================================================= */}

                        <div
                          className={
                            styles.statusCell
                          }
                        >

                          <span
                            className={`${styles.statusBadge} ${
                              consultantStatus
                                ? styles.statusActive
                                : styles.statusInactive
                            }`}
                          >

                            <span
                              className={
                                styles.statusDot
                              }
                            />

                            {consultantStatus
                              ? "Active"
                              : "Inactive"}

                          </span>

                        </div>


                        {/* =================================================
                            ACTIONS
                        ================================================= */}

                        <div
                          className={
                            styles.rowActions
                          }
                        >

                          <button
                            type="button"
                            className={
                              styles.editButton
                            }

                            aria-label="Edit consultant"

                            onClick={() =>
                              handleEdit(_id)
                            }
                          >

                            <span
                              className={
                                styles.actionIcon
                              }
                            >
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  d="m15.5 5.5 3 3M5 19l1-4 9.5-9.5a2.1 2.1 0 0 1 3 3L9 18l-4 1Z"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>

                            <span
                              className={
                                styles.actionText
                              }
                            >
                              Edit
                            </span>

                          </button>


                          <button
                            type="button"

                            className={
                              styles.deleteButton
                            }

                            aria-label="Delete consultant"

                            onClick={() =>
                              handleDeleteClick(
                                _id
                              )
                            }
                          >

                            <span
                              className={
                                styles.actionIcon
                              }
                            >
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <path
                                  d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M6 7l1 13h10l1-13"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>

                            <span
                              className={
                                styles.actionText
                              }
                            >
                              Delete
                            </span>

                          </button>

                        </div>

                      </div>
                    );
                  }
                )}

              </div>

            )}


            {/* =================================================
                FOOTER / PAGINATION
            ================================================= */}

            <div
              className={
                styles.footer
              }
            >

              <span
                className={
                  styles.footerText
                }
              >
                Showing{" "}
                <strong>
                  {pagedConsultants.length}
                </strong>{" "}
                of{" "}
                <strong>
                  {filteredConsultants.length}
                </strong>{" "}
                consultants
              </span>


              {totalPages > 1 && (

                <div
                  className={
                    styles.pagination
                  }
                >

                  <button
                    type="button"

                    className={
                      styles.pagerButton
                    }

                    disabled={
                      currentPage <= 1
                    }

                    onClick={() =>
                      setPage((p) =>
                        Math.max(
                          1,
                          p - 1
                        )
                      )
                    }

                    aria-label="Previous page"
                  >
                    ‹
                  </button>


                  <span
                    className={
                      styles.pageIndicator
                    }
                  >
                    Page{" "}
                    <strong>
                      {currentPage}
                    </strong>{" "}
                    of{" "}
                    <strong>
                      {totalPages}
                    </strong>
                  </span>


                  <button
                    type="button"

                    className={
                      styles.pagerButton
                    }

                    disabled={
                      currentPage >=
                      totalPages
                    }

                    onClick={() =>
                      setPage((p) =>
                        Math.min(
                          totalPages,
                          p + 1
                        )
                      )
                    }

                    aria-label="Next page"
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