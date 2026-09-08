import {
    Modal,
    Form,
    FormLayout,
    TextField,
    Select,
    Button,
    InlineGrid,
} from '@shopify/polaris';
import { useState } from 'react';

export default function UpdateUserDetailsModal({ open, onClose, userDetails, updateFormData, setUpdateFormData, updateWallet }) {
    const { userId, fullname } = userDetails;
    const [user, setUser] = useState('');



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
        { label: 'Manual Credit', value: 'manual_credit' },
        { label: 'Manual Debit', value: 'manual_debit' },
        { label: 'Recharge', value: 'recharge' },
        { label: 'Refund', value: 'refund' },
    ];

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Update Wallet"
            primaryAction={{
                content: 'Save',
                onAction: () => {
                    updateWallet();
                    onClose();
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
                                value={updateFormData.amount}
                                onChange={handleChange('amount')}
                                autoComplete="off"
                            />
                        </InlineGrid>

                        {/* Description */}
                        <TextField
                            label="Description"
                            value={updateFormData.description}
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
