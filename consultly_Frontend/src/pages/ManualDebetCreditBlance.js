import React, { Fragment, useCallback, useEffect, useState } from 'react'
import IndexTableList from '../components/consultant-list/IndexTableList'
import MoneyValue from '../components/Helper/MoneyValue'
import { Page, Layout, Spinner, ButtonGroup, Button, Toast, Badge, InlineStack } from '@shopify/polaris'
import { DuplicateIcon, EditIcon, PlusIcon } from '@shopify/polaris-icons'
import { IndexTable, Text } from '@shopify/polaris'
import { fetchWalletHistory,fetchAdminDetails } from '../components/Redux/slices/adminSlice'
import { useDispatch, useSelector } from 'react-redux'
import { useAppBridge } from '../components/createContext/AppBridgeContext'
import UpdateUserDetailsModal from './UpdateUserDetailsModal'
import axios from 'axios'
import { ToastModel } from '../components/AlertModel/Tost'
import { getAppBridgeToken } from '../utils/getAppBridgeToken'


const walletManagementHeadings = [
    { title: 'Sr. No.', alignment: 'start' },
    { title: 'Name', alignment: 'center' },
    { title: " Type", alignment: 'center' },
    { title: 'Amount', alignment: 'center' },
    { title: "Direction", alignment: 'center' },
    { title: " Reference Type", alignment: 'center' },
    { title: "Status", alignment: 'center' },
    { title: "Description", alignment: 'center' },
    { title: " Action", alignment: 'center' },
];

function ManualDebetCreditBlance() {
    const app = useAppBridge();
    const { walletHistory, loading: walletLoading } = useSelector((state) => state.admin);
    const dispatch = useDispatch();
    const [adminIdLocal, setAdminIdLocal] = useState(null);
    const [userDetails, setUserDetails] = useState({});
    const [page, setPage] = useState(1);
    const [type, setType] = useState(0);
    const [active, setActive] = useState(false);
    const [toastActive, setToastActive] = useState(false);
    const [refresh, setRefresh] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [updateFormData, setUpdateFormData] = useState({
        userId: '',
        mainType: '',
        amount: '',
        description: '',
    });
    const { adminDetails_, loading: adminDetailsLoading } = useSelector((state) => state.admin);

    const limit = 10;
    const openUpdateWalletModal = (userId, fullname) => {
        setActive(true);
        setUserDetails({ userId, fullname });
    }

    useEffect(() => {
        const id = localStorage.getItem('consultly');
        setAdminIdLocal(id);
    }, []);

    useEffect(() => {
        dispatch(fetchWalletHistory({ adminIdLocal, page, limit, app, searchQuery }));
        dispatch(fetchAdminDetails({adminIdLocal,app}))

    }, [dispatch, adminIdLocal, page, limit, refresh, searchQuery]);


    /** 
     * Update Wallet
     * 
     */
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
        shop_id: item?.shop_id,
        fullname: item?.userId?.fullname || '-',
        userType: item?.userId?.userType || '-',
        amount: item?.amount || '-',
        transactionType: item?.transactionType || '-',
        referenceType: item?.referenceType || '-',
        direction: item?.direction || '-',
        status: item?.status || '-',
        description: item?.description || '-',
        updatedAt: formatDate(item?.updatedAt),
    })) || [];
    const onHandleCancel = () => {
        setPage(1);
        setSearchQuery("");
        setType(0);
        return true;
    };

    const renderWalletRow = useCallback((wallet, index) => {
        const { id, userId, shop_Id, fullname, userType, amount, referenceType, direction, status, description } = wallet
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
                <IndexTable.Cell>
                    <Text variant="bodyMd" as="span" alignment="center">
                        {userType}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell alignment="center">
                    <Text variant="bodyMd" as="span" alignment="center" numeric>
                    <MoneyValue currency={adminDetails_?.currency}>
                        {amount ? parseFloat(amount).toFixed(2) : "0.0"}
                    </MoneyValue>
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell alignment="center">
                    <InlineStack align="center">
                        <Badge tone={direction === "credit" ? "success" : "critical"}>
                            {direction === "credit" ? "credit" : "debit"}
                        </Badge>
                    </InlineStack>
                </IndexTable.Cell>

                <IndexTable.Cell alignment="center">
                    <Text variant="bodyMd" as="span" alignment="center">
                        {referenceType}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell alignment="center">
                    <InlineStack align="center">
                        <Badge tone={status === "success" ? "success" : "critical"}>
                            {status}
                        </Badge>
                    </InlineStack>
                </IndexTable.Cell>

                <IndexTable.Cell alignment="center">
                    <Text variant="bodyMd" as="span" alignment="center">
                        {description}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <InlineStack align="center" gap="100">
                        <Button
                            variant="tertiary"
                            icon={EditIcon}
                            accessibilityLabel="Edit wallet"
                            onClick={(e) => {
                                e.stopPropagation();
                                openUpdateWalletModal(userId, fullname, shop_Id);
                                // handleEdit(_id);
                            }}
                        />

                    </InlineStack>
                </IndexTable.Cell>

            </IndexTable.Row>
        )
    }, [page, limit,adminDetails_?.currency])

    return (
        <Fragment>
            <UpdateUserDetailsModal open={active} onClose={() => setActive(false)} userDetails={userDetails} updateFormData={updateFormData} setUpdateFormData={setUpdateFormData} updateWallet={updateWallet} />
            <Page
                title="Wallet Management"
            >
                <Layout>
                    <Layout.Section>
                        <IndexTableList
                            itemStrings={[]}
                            sortOptions={[]}
                            data={tableData}
                            headings={walletManagementHeadings}
                            renderRow={renderWalletRow}
                            resourceName={{ singular: 'wallet', plural: 'wallets' }}
                            queryPlaceholder="Search wallets"
                            onTabChange={(value) => setType(value)}
                            onQueryChange={(value) => { setSearchQuery(value); setPage(1); }}
                            onSortChange={() => { }}
                            page={page}
                            setPage={setPage}
                            setType={setType}
                            limit={limit}
                            totalItems={walletHistory?.totalItems || walletHistory?.data?.length || 0}
                            loading={walletLoading}
                            onHandleCancel={onHandleCancel}
                        />
                    </Layout.Section>
                </Layout>
            </Page>

        </Fragment>
    )
}

export default ManualDebetCreditBlance