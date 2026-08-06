import React, { Fragment, useState, useCallback, useEffect } from 'react'
import { Page, Layout, IndexTable, Text, Button, ButtonGroup, InlineStack } from '@shopify/polaris'
import IndexTableList from '../components/consultant-list/IndexTableList'
import MoneyValue from '../components/Helper/MoneyValue'
import { useAppBridge } from '../components/createContext/AppBridgeContext'
import { useMemo } from 'react'
import { DeleteIcon, EditIcon, PlusIcon } from '@shopify/polaris-icons'
import { Redirect } from '@shopify/app-bridge/actions'
import { useDispatch, useSelector } from 'react-redux'
import { fetchAdminDetails } from '../components/Redux/slices/adminSlice'
import { VoucherDeleteAlert } from '../components/AlertModel/VoucherDeleteAlert'
import axios from 'axios'
import { ToastContext, usePolarisToast } from '../components/AlertModel/PolariesTostContext'
import { getAppBridgeToken } from '../utils/getAppBridgeToken'


function VoucherTable() {
    const app = useAppBridge();
    const dispatch = useDispatch();
    const redirect = useMemo(() => {
        if (!app) return null;
        return Redirect.create(app);
    }, [app]);

    const goToAddVoucher = () => {
        if (!redirect) return;
        redirect.dispatch(Redirect.Action.APP, '/voucher-management/voucher');
    }
    const updateVoucherPlan = (id, totalCoin, extraCoin) => {
        if (!redirect) return;
        redirect.dispatch(Redirect.Action.APP, `/voucher-management/voucher?id=${id}&totalCoin=${totalCoin}&extraCoin=${extraCoin}`);
    }
    const [data, setData] = useState([])
    const [headings, setHeadings] = useState([
        { title: 'Sr. No.', alignment: 'start' },
        { title: 'Voucher Code', alignment: 'center' },
        { title: 'Total Amount', alignment: 'center' },
        { title: 'Extra Amount', alignment: 'center' },
        { title: 'Action', alignment: 'center' }
    ])
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(10)
    const [totalItems, setTotalItems] = useState(0)
    const [adminIdLocal, setAdminIdLocal] = useState(null)
    const [isUserAlertVisible, setIsUserAlertVisible] = useState(false)
    const [voucherId, setVoucherId] = useState(null)
    const [loading, setLoading] = useState(false)
    const [reLoadApi, setReLoadApi] = useState(false)
    const { adminDetails_, loading: adminDetailsLoading } = useSelector((state) => state.admin);
    const { showToast } = usePolarisToast();
    useEffect(() => {
        const id = localStorage.getItem('consultly');
        setAdminIdLocal(id);
    }, [])


    useEffect(() => {
        if (adminIdLocal) {
            dispatch(fetchAdminDetails({ adminIdLocal, app }))
        }
    }, [dispatch, adminIdLocal, app, reLoadApi])

    useEffect(() => {
        if (adminDetails_ && adminDetails_.vouchers && Array.isArray(adminDetails_.vouchers)) {
            const mappedVouchers = adminDetails_?.vouchers?.map((voucher, index) => ({
                id: voucher._id || voucher.id || index + 1,
                voucherCode: voucher.voucherCode || `VCH${String(index + 1).padStart(3, '0')}`,
                totalCoin: voucher.totalCoin?.$numberDecimal ? parseFloat(voucher.totalCoin.$numberDecimal) : voucher.totalCoin || 0,
                extraCoin: voucher.extraCoin?.$numberDecimal ? parseFloat(voucher.extraCoin.$numberDecimal) : voucher.extraCoin || 0,
                status: voucher.status || 'Active'
            }));
            setData(mappedVouchers);
            setTotalItems(mappedVouchers.length);
        }
    }, [adminDetails_])
   
    const handleOpenDeleteModal = (id) => {
        setVoucherId(id);
        setIsUserAlertVisible(true);
    };

    const handleConfirmDelete = async (id) => {
        const token = await getAppBridgeToken(app);
        setLoading(true);
        try {
            const response = await axios.delete(`${process.env.REACT_APP_BACKEND_HOST}/admin/delete/voucher/${adminIdLocal}/${id}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (response.status === 200) {
                showToast(response.data?.message);
                setReLoadApi(prev => !prev);
                setIsUserAlertVisible(false);
                setVoucherId(null);
                setLoading(false);
            } else {
                showToast(response.data?.message || 'Failed to delete voucher', true);
            }
        } catch (error) {
            console.error("Error deleting voucher:", error);
            showToast(error.response?.data?.message || 'Failed to delete voucher', true);
        } finally {
            setLoading(false);
        }
    }

    const renderVoucherRow = useCallback((voucher, index) => {
        const { id, voucherCode, totalCoin, extraCoin, status } = voucher;

        return (
            <IndexTable.Row id={id} key={id || index} position={index}>
                <IndexTable.Cell>
                    <Text as="span" alignment="start" variant="bodyMd" fontWeight="bold" numeric>
                        {index + 1}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text variant="bodyMd" as="span" alignment="center">
                        {voucherCode || 'N/A'}
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text as="span" alignment="center" numeric>
                        <MoneyValue currency={adminDetails_?.currency}>{totalCoin}</MoneyValue>
                    </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    <Text as="span" alignment="center" numeric>
                        <MoneyValue currency={adminDetails_?.currency}>{extraCoin}</MoneyValue>
                    </Text>
                </IndexTable.Cell>

                <IndexTable.Cell>
                <InlineStack align="center"  gap="100">
                        <Button
                            variant="tertiary"
                            icon={EditIcon}
                            accessibilityLabel="Edit voucher"
                            onClick={(e) => {
                                e.stopPropagation();
                                updateVoucherPlan(id, totalCoin, extraCoin);
                            }}
                        />
                        <Button
                            variant="tertiary"
                            icon={DeleteIcon}
                            tone="critical"
                            accessibilityLabel="Delete voucher"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDeleteModal(id);
                            }}
                        />
                    </InlineStack>
                </IndexTable.Cell>
            </IndexTable.Row>
        );
    }, [adminDetails_?.currency]);

    return (
        <Fragment>
            <VoucherDeleteAlert
                isUserAlertVisible={isUserAlertVisible}
                setIsUserAlertVisible={setIsUserAlertVisible}
                handleDelete={handleConfirmDelete}
                voucherId={voucherId}
                adminIdLocal={adminIdLocal}
                loading={loading}
            />
            <Page
                title="Voucher Management"
                primaryAction={{
                    icon: PlusIcon,
                    content: 'Add Voucher',
                    onAction: goToAddVoucher,
                }}

            >

                <Layout>
                    <Layout.Section>
                        <IndexTableList
                            hideFilters
                            data={data}
                            headings={headings}
                            renderRow={renderVoucherRow}
                            page={page}
                            setPage={setPage}
                            limit={limit}
                            totalItems={totalItems}
                            loading={adminDetailsLoading}
                        />
                    </Layout.Section>
                </Layout>
            </Page>
        </Fragment>
    )
}

export default VoucherTable