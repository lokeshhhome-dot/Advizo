import React, { Fragment, useCallback, useContext, useEffect, useState } from 'react'
import IndexTableList from '../components/consultant-list/IndexTableList'
import MoneyValue from '../components/Helper/MoneyValue'
import { Page, Layout, ButtonGroup, Button, Badge, InlineStack, Tooltip } from '@shopify/polaris'
import { IndexTable, Text } from '@shopify/polaris'
import { fetchWithdrawalRequests, fetchAdminDetails } from '../components/Redux/slices/adminSlice'
import { useDispatch, useSelector } from 'react-redux'
import { useAppBridge } from '../components/createContext/AppBridgeContext'
import axios from 'axios'
import { getAppBridgeToken } from '../utils/getAppBridgeToken'
import { MdOutlinePayments } from "react-icons/md";
import WidthrwalRequestApprove from '../components/AlertModel/WidthrwalRequestApprove'
import { RxCross2 } from "react-icons/rx";
import { ToastContext } from '../components/AlertModel/PolariesTostContext';
import { WidthrawalReqDeclineAlert } from '../components/AlertModel/WidthrawalReqDeclineAlert'
import {
    XCircleIcon
} from '@shopify/polaris-icons';
import {
    PaymentIcon
} from '@shopify/polaris-icons';



const withdrawalRequestHeadings = [
    { title: 'Sr. No.', alignment: 'start' },
    { title: 'Name', alignment: 'center' },
    { title: 'Amount', alignment: 'center' },
    { title: "Status", alignment: 'center' },
    { title: "Description", alignment: 'center' },
    { title: " Action", alignment: 'center' },
];



function WithdrawalRequest() {
    const app = useAppBridge();
    const { showToast } = useContext(ToastContext);
    const dispatch = useDispatch();
    const [adminIdLocal, setAdminIdLocal] = useState(null);
    const [userDetails, setUserDetails] = useState({});
    const [page, setPage] = useState(1);
    const [type, setType] = useState(0);
    const [active, setActive] = useState(false);
    const [refresh, setRefresh] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isWidthrawalReqDeclineAlertVisible, setIsWidthrawalReqDeclineAlertVisible] = useState(false);
    const [selectedWithdrawalRequestId, setSelectedWithdrawalRequestId] = useState(null);
    const { adminDetails_, loading: adminDetailsLoading } = useSelector((state) => state.admin);
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
        const id = localStorage.getItem('consultly');
        setAdminIdLocal(id);
    }, []);

    useEffect(() => {
        dispatch(fetchAdminDetails({ adminIdLocal, app }))
        dispatch(fetchWithdrawalRequests({ adminIdLocal, page, limit, app, searchQuery }));
    }, [dispatch, adminIdLocal, page, limit, refresh, searchQuery]);



    /** 
     * Update Wallet
     * 
     */


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
    const onHandleCancel = () => {
        setPage(1);
        setSearchQuery("");
        setType(0);
        return true;
    };

    const renderWalletRow = useCallback((withdrawal, index) => {
        const { id, userId, shop_Id, fullname, amount, status, description } = withdrawal
        const serialNumber = (page - 1) * limit + index + 1;

        return (
            <IndexTable.Row id={id} key={id} position={index}>
                <IndexTable.Cell>
                    <Text as="span" alignment="start" variant="bodyMd" fontWeight="bold" numeric>
                        {serialNumber}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text variant="bodyMd" as="span" alignment="center">
                        {fullname}
                    </Text>
                </IndexTable.Cell>

                <IndexTable.Cell alignment="start">
                    <Text variant="bodyMd" as="span" alignment="center" numeric>
                        <MoneyValue currency={adminDetails_?.currency}>
                            {amount ? parseFloat(amount).toFixed(2) : "0.0"}
                        </MoneyValue>
                    </Text>
                </IndexTable.Cell>


                <IndexTable.Cell>
                    <InlineStack align="center">
                        <Badge progress="complete" variant="outline" tone={status === "paid" ? "success" : ""}>
                            {status}
                        </Badge>
                    </InlineStack>
                </IndexTable.Cell>

                <IndexTable.Cell alignment="start">
                    <Text variant="bodyMd" as="span" alignment="center">
                        {description}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <InlineStack align="center" gap="100">
                        <Tooltip
                            content="Paid"
                            hoverDelay={300}
                        >
                            <Button
                                variant="tertiary"
                                icon={PaymentIcon}
                                accessibilityLabel="Withdrawal Request"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openUpdateWalletModal(userId, fullname, shop_Id, amount, status, description, id);
                                    // handleEdit(_id);
                                }}
                            />
                        </Tooltip>
                        <Tooltip
                            content="Decline"
                            hoverDelay={300}
                        >
                            <Button
                                variant="tertiary"
                                tone="critical"
                                icon={XCircleIcon}
                                accessibilityLabel="Decline Withdrawal Request"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openDeclineModal(id);
                                }}
                            />
                        </Tooltip>
                    </InlineStack>
                </IndexTable.Cell>

            </IndexTable.Row>
        )
    }, [page, limit, adminDetails_?.currency])


    return (
        <Fragment>
            <WidthrawalReqDeclineAlert
                isWidthrawalReqDeclineAlertVisible={isWidthrawalReqDeclineAlertVisible}
                setIsWidthrawalReqDeclineAlertVisible={setIsWidthrawalReqDeclineAlertVisible}
                handleDecline={handleDecline}
                withdrawalRequestId={selectedWithdrawalRequestId}
            />
            <WidthrwalRequestApprove open={active} onClose={() => setActive(false)} userDetails={userDetails} updateFormData={updateFormData} setUpdateFormData={setUpdateFormData} updateWallet={updateWallet} />
            <Page
                title="Withdrawal Request"

            >
                <Layout>
                    <Layout.Section>
                        <IndexTableList
                            itemStrings={[]}
                            sortOptions={[]}
                            data={tableData}
                            headings={withdrawalRequestHeadings}
                            renderRow={renderWalletRow}
                            resourceName={{ singular: 'withdrawal request', plural: 'withdrawal requests' }}
                            queryPlaceholder="Search wallets"
                            onTabChange={(value) => setType(value)}
                            onQueryChange={(value) => { setSearchQuery(value); setPage(1); }}
                            onSortChange={() => { }}
                            page={page}
                            setPage={setPage}
                            setType={setType}
                            limit={limit}
                            totalItems={withdrawalRequests?.totalItems || withdrawalRequests?.data?.length || 0}
                            loading={withdrawalRequestsLoading}
                            onHandleCancel={onHandleCancel}
                        />
                    </Layout.Section>
                </Layout>
            </Page>

        </Fragment>
    )
}

export default WithdrawalRequest