import {
    Modal,
    Form,
    FormLayout,
    TextField,
    Select,
    Button,
    InlineGrid,
} from '@shopify/polaris';
import { useEffect, useState } from 'react';

export default function WidthrwalRequestApprove({ open, onClose, userDetails, updateFormData, setUpdateFormData, updateWallet }) {
    const { userId, fullname, shop_Id, amount, status, description, id } = userDetails;
    const [user, setUser] = useState('');


    useEffect(() => {
        setUpdateFormData({
            userId: userId,
            transactionId: id,
            fullname: fullname,
            amount: amount,
            description: description,
            transactionNumber: '',
        });
    }, [userDetails]);

    const handleChange = (field) => {
        return (value) => {
            setUpdateFormData((prev) => ({
                ...prev,
                [field]: value,
            }));
        };
    };

    const mainTypeOptions = [
        { label: 'Please Select Main Type', value: '' },
        { label: ' Paid', value: 'paid' },
    ];

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Approve Withdrawal Request"
            primaryAction={{
                content: 'Save',
                onAction: () => {
                    updateWallet();
                    // onClose();
                },
            }}
            secondaryActions={[
                {
                    content: 'Back to list',
                    onAction: onClose,
                },
            ]}
        >

            <Modal.Section>
                <Form>
                    <FormLayout>

                        {/* Select User */}
                        <TextField
                            label="User"
                            value={fullname}
                            onChange={(value) => setUser(value)}
                        />

                        <InlineGrid columns={2} gap="400">
                            <Select
                                label="Main Type"
                                options={mainTypeOptions}
                                value={updateFormData.mainType}
                                onChange={handleChange('mainType')}
                            />

                            <TextField
                                label="Amount"
                                type="number"
                                value={amount}
                                onChange={handleChange('amount')}
                                autoComplete="off"
                            />
                        </InlineGrid>

                        <TextField
                            label="Transaction Number"
                            value={updateFormData.transactionNumber}
                            onChange={handleChange('transactionNumber')}
                        />

                        {/* Description */}
                        <TextField
                            label="Description"
                            value={description}
                            onChange={handleChange('description')}
                            multiline={4}
                            placeholder="history description"
                        />

                    </FormLayout>
                </Form>
            </Modal.Section>
        </Modal>
    );
}
