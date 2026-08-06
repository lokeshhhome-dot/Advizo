import {
  Layout,
  Page,
  Text,
  Button,
  Thumbnail,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { PlusIcon, EditIcon, DeleteIcon } from "@shopify/polaris-icons";
import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import IndexTableList from "../components/consultant-list/IndexTableList";
import MoneyValue from "../components/Helper/MoneyValue";
import { IndexTable } from "@shopify/polaris";
import { fetchConsultants } from "../components/Redux/slices/adminSlice";
import { useDispatch, useSelector } from "react-redux";
import { UserAlert } from "../components/AlertModel/UserAlert";
import { headings, itemStrings } from "../components/FallbackData/FallbackData";
import axios from "axios";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import { Redirect } from "@shopify/app-bridge/actions";
import { fetchAdminDetails } from "../components/Redux/slices/adminSlice";
import { usePolarisToast } from "../components/AlertModel/PolariesTostContext";
import { ImageThumbnail } from "../components/Helper/ImageThumbnail";
import { TablePageSkeleton } from "../components/loading/PageSkeletons";
import { getAppBridgeToken } from "../utils/getAppBridgeToken";

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
  const [selectedTab, setSelectedTab] = useState(0);
  const [queryValue, setQueryValue] = useState("");
  const [sortValue, setSortValue] = useState(["name asc"]);
  const [isUserAlertVisible, setIsUserAlertVisible] = useState(false);
  const [consultantId, setConsultantId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [adminIdLocal, setAdminIdLocal] = useState(null);
  const { showToast } = usePolarisToast();
  const [loading, setLoading] = useState(true);
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

  const refreshConsultants = useCallback(() => {
    if (!adminIdLocal) return;
    dispatch(fetchConsultants({ adminIdLocal, app }));
  }, [adminIdLocal, app, dispatch]);

  const consultantsData = consultants?.findConsultant || [];
  const filteredConsultants = useMemo(() => {
    if (!consultantsData) return [];

    return consultantsData.filter((consultant) => {
      let matchesTab = true;
      if (selectedTab !== 0) {
        const selectedTabLabel = itemStrings[selectedTab].toLowerCase();
        matchesTab = consultant.type?.toLowerCase() === selectedTabLabel;
      }
      let matchesQuery = true;
      if (queryValue.trim()) {
        const query = queryValue.toLowerCase();
        matchesQuery = [
          consultant.fullname,
          consultant.name,
          consultant.email,
          consultant.contact,
          consultant.phone,
          consultant.profession,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(query),
        );
      }

      return matchesTab && matchesQuery;
    });
  }, [consultantsData, selectedTab, queryValue, itemStrings]);

  const sortedConsultants = useMemo(() => {
    if (!filteredConsultants.length || !sortValue[0])
      return filteredConsultants;

    const [field, direction] = sortValue[0].split(" ");
    const sorted = [...filteredConsultants];

    sorted.sort((a, b) => {
      let aValue = a[field];
      let bValue = b[field];

      if (field === "experience" || field === "conversionFees") {
        aValue = parseFloat(aValue) || 0;
        bValue = parseFloat(bValue) || 0;
      } else {
        aValue = String(aValue || "").toLowerCase();
        bValue = String(bValue || "").toLowerCase();
      }
      if (direction === "asc") {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

    return sorted;
  }, [filteredConsultants, sortValue]);

  const handleConsultantClick = useCallback((_id) => {}, []);

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

  useEffect(() => {
    if (adminIdLocal) {
      dispatch(fetchAdminDetails({ adminIdLocal, app }));
    }
  }, [adminIdLocal, app]);

  const handleToggle = useCallback(
    async (id, currentStatus) => {
      if (togglingId) return;

      setTogglingId(id);
      try {
        const token = await getAppBridgeToken(app);
        if (!token) {
          showToast("Missing Shopify session token. Please refresh and try again.", true);
          return;
        }

        const response = await axios.put(
          `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/api-consultant-update-status/${id}`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.status === 200) {
          const nextStatus = response.data?.status ?? !currentStatus;
          showToast(
            response.data?.message ||
              `Consultant ${nextStatus ? "activated" : "deactivated"} successfully`,
          );
          refreshConsultants();
        }
      } catch (err) {
        console.error("Failed to update consultant status:", err);
        showToast(
          err.response?.data?.message || "Failed to update consultant status",
          true,
        );
      } finally {
        setTogglingId(null);
      }
    },
    [app, refreshConsultants, showToast, togglingId],
  );

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

  const renderConsultantRow = useCallback(
    (consultant, index) => {
      const {
        _id,
        fullname,
        profession,
        chatPerMinute,
        consultantStatus,
        voicePerMinute,
        videoPerMinute,
        walletBalance,
      } = consultant;

      return (
        <IndexTable.Row _id={_id} key={_id} position={index}>
          <IndexTable.Cell alignment="start">
            <Text
              as="span"
              alignment="start"
              variant="bodyMd"
              fontWeight="bold"
              numeric
            >
              {index + 1}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell alignment="center">
            <InlineStack align="center">
              <ImageThumbnail
                src={
                  consultant?.profileImage
                    ? consultant.profileImage.replace(/\\/g, "/")
                    : "/images/flag/teamdefault.png"
                }
              />
            </InlineStack>
          </IndexTable.Cell>
          <IndexTable.Cell alignment="center">
            <Text variant="bodyMd" as="span" alignment="center">
              {fullname}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text variant="bodyMd" as="span" alignment="center">
              {profession}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" alignment="center" numeric>
              <Text variant="bodyMd" as="span" alignment="center">
                <MoneyValue currency={adminDetails_?.currency}>
                  {chatPerMinute || "-"}
                </MoneyValue>
              </Text>
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" alignment="center" numeric>
              <Text variant="bodyMd" as="span" alignment="center">
                <MoneyValue currency={adminDetails_?.currency}>
                  {voicePerMinute || "-"}
                </MoneyValue>
              </Text>
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" alignment="center" numeric>
              <Text variant="bodyMd" as="span" alignment="center">
                <MoneyValue currency={adminDetails_?.currency}>
                  {videoPerMinute || "-"}
                </MoneyValue>
              </Text>
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" alignment="center" numeric>
              <Text variant="bodyMd" as="span" alignment="center">
                <MoneyValue currency={adminDetails_?.currency}>
                  {walletBalance ? parseFloat(walletBalance).toFixed(2) : "0.00"}
                </MoneyValue>
              </Text>
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <label
              style={{
                position: "relative",
                display: "flex",
                margin: "auto",
                width: "36px",
                height: "20px",
                cursor: togglingId === _id ? "wait" : "pointer",
                opacity: togglingId === _id ? 0.6 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(consultantStatus)}
                disabled={togglingId === _id}
                onChange={(e) => {
                  e.stopPropagation();
                  handleToggle(_id, consultantStatus);
                }}
                style={{
                  opacity: 0,
                  width: 0,
                  height: 0,
                }}
              />
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: consultantStatus
                    ? "var(--p-color-bg-fill-brand)"
                    : "var(--p-color-bg-fill-selected)",
                  borderRadius: "11px",
                  transition: "background-color 0.2s ease",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    height: "16px",
                    width: "16px",
                    left: consultantStatus ? "18px" : "2px",
                    top: "2px",
                    backgroundColor: "#FFFFFF",
                    borderRadius: "50%",
                    transition: "left 0.2s ease",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
                  }}
                />
              </span>
            </label>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <InlineStack align="center" gap="100">
              <Button
                variant="tertiary"
                icon={EditIcon}
                accessibilityLabel="Edit consultant"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(_id);
                }}
              />
              <Button
                variant="tertiary"
                icon={DeleteIcon}
                tone="critical"
                accessibilityLabel="Delete consultant"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(_id);
                }}
              />
            </InlineStack>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    },
    [
      handleEdit,
      handleDeleteClick,
      handleToggle,
      togglingId,
      adminDetails_?.currency,
    ],
  );

  if (adminIdLocal && consultantLoading && !consultantsData?.length) {
    return <TablePageSkeleton />;
  }

  return (
    <Fragment>
      <UserAlert
        isUserAlertVisible={isUserAlertVisible}
        setIsUserAlertVisible={setIsUserAlertVisible}
        handleDelete={handleDelete}
        consultantId={consultantId}
      />
      <Box paddingBlockStart="400">
      <div style={{ padding: "0 24px" }}>
        <Page
         
            title="Consultant List"

          primaryAction={{
            icon: PlusIcon,
            content: "Add Consultant",
            onAction: goToAddConsultant,
          }}
        >
         
          <Layout>
            <Layout.Section>
              <IndexTableList
                loading={consultantLoading}
                itemStrings={itemStrings}
                sortOptions={[]}
                data={sortedConsultants}
                headings={headings}
                renderRow={renderConsultantRow}
                resourceName={{ singular: "consultant", plural: "consultants" }}
                queryPlaceholder="Search consultants"
                onTabChange={setSelectedTab}
                onQueryChange={setQueryValue}
                onSortChange={setSortValue}
              />
            </Layout.Section>
          </Layout>
          </Page>
        </div>
      </Box>
    </Fragment>
  );
}

export default ConsultantList;
