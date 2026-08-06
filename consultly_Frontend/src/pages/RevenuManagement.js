import React, { Fragment, useCallback, useEffect, useState } from 'react'
import IndexTableList from '../components/consultant-list/IndexTableList'
import { Page, Layout, SkeletonBodyText, Spinner } from '@shopify/polaris'
import { PlusIcon } from '@shopify/polaris-icons'
import { IndexTable, Text } from '@shopify/polaris'
import { fetchActivityHistory,fetchAdminDetails } from '../components/Redux/slices/adminSlice'
import { useDispatch, useSelector } from 'react-redux'
import { useAppBridge } from '../components/createContext/AppBridgeContext'
import { formatAmountHelper, formatNumber } from '../components/Helper/Helper'
import MoneyValue from '../components/Helper/MoneyValue'



const transactionHeadings = [
    { title: 'Sr. No.', alignment: 'start' },
    { title: 'User', alignment: 'center' },
    { title: 'Consultant', alignment: 'center' },
    { title: 'Type', alignment: 'center' },
    { title: 'Duration', alignment: 'center' },
    { title: 'Amount', alignment: 'center' },
    { title: 'Consultant Share', alignment: 'center' },
    { title: 'Admin Share', alignment: 'center' },
    { title: 'Date', alignment: 'center' }
]

const transactionItemStrings = ['All', 'Chat', 'Voice Call', 'Video Call',]

function RevenuManagement() {
    const app = useAppBridge();
    const { activityHistory, loading } = useSelector((state) => state.admin);
    const { adminDetails_, loading: adminDetailsLoading } = useSelector((state) => state.admin);
    const dispatch = useDispatch();
    const [adminIdLocal, setAdminIdLocal] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const [type, setType] = useState(0);
    const limit = 10;
    useEffect(() => {
        const id = localStorage.getItem('consultly');
        setAdminIdLocal(id);
    }, []);
    useEffect(() => {
        if (adminIdLocal) {
            dispatch(fetchActivityHistory({ adminIdLocal, page, limit, type, app, searchQuery }));
            dispatch(fetchAdminDetails({adminIdLocal,app}))

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
    const onHandleCancel = () => {
        setPage(1);
        setSearchQuery("");
        setType(0);
        return true;
    };


    const tableData = activityHistory?.data?.map((item) => ({
        id: item._id,
        type: item.type?.toUpperCase(),
        date: formatDate(item.createdAt),
        time: formatTime(item.startTime),
        duration: getDuration(item.startTime, item.endTime),
        user: item.senderId?.fullname,
        consultant: item.receiverId?.fullname,
        amount: `${item.amount}`,
        status: item.status,
        consultantAmount: `${item.consultantAmount}`,
        adminAmount: `${item.adminAmount}`
    })) || [];
    const renderTransactionRow = useCallback((transaction, index) => {
        const { id, user, type, date, time, duration, consultantAmount, adminAmount, consultant, amount, } = transaction
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
                        {user}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text variant="bodyMd" as="span" alignment="center">
                        {consultant}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <div style={{ textTransform: 'lowercase' }}>
                        <Text variant="bodyMd" as="span" alignment="center">
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                        </Text>
                    </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text variant="bodyMd" as="span" alignment="center">
                        {duration}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text as="span" alignment="center" numeric>
                     <MoneyValue currency={adminDetails_?.currency} amount={amount} />
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text variant="bodyMd" as="span" alignment="center">
                        {
                            consultantAmount ? (
                                <MoneyValue currency={adminDetails_?.currency}>
                                    {formatNumber(consultantAmount)}
                                </MoneyValue>
                            ) : "-"
                        }
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text variant="bodyMd" as="span" alignment="center">
                        {adminAmount ? (
                            <MoneyValue currency={adminDetails_?.currency}>
                                {formatNumber(adminAmount)}
                            </MoneyValue>
                        ) : "-"}
                    </Text>
                </IndexTable.Cell>


                <IndexTable.Cell>
                    <Text variant="bodyMd" as="span" alignment="center">
                        {date},{time}
                    </Text>
                </IndexTable.Cell>




            </IndexTable.Row >
        )
    }, [page, limit,adminDetails_?.currency])

    return (
        <Fragment>


            <Page
                title="Revenue Management"
            >
                <Layout>
                    <Layout.Section>
                        <IndexTableList
                            itemStrings={transactionItemStrings}
                            sortOptions={[]}
                            data={tableData}
                            headings={transactionHeadings}
                            renderRow={renderTransactionRow}
                            resourceName={{ singular: 'transaction', plural: 'transactions' }}
                            queryPlaceholder="Search transactions"
                            onTabChange={() => { }}
                            onHandleCancel={onHandleCancel}
                            onQueryChange={(value) => {
                                setSearchQuery(value);
                                setPage(1);
                            }}
                            onSortChange={() => { }}
                            page={page}
                            setPage={setPage}
                            setType={setType}
                            limit={limit}
                            totalItems={activityHistory?.totalItems || activityHistory?.data?.length || 0}
                            loading={loading}
                        />
                    </Layout.Section>
                </Layout>
            </Page>
        </Fragment>
    )
}

export default RevenuManagement