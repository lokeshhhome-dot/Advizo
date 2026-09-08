import { Toast, Frame, Page, Button } from '@shopify/polaris';
import { useState, useCallback } from 'react';

export function ToastModel({ active, setActive, toastContent }) {


    const tostClosed = () => {
        setActive(false);
    }
    const toastMarkup = active ? (
        <Toast content={toastContent} onDismiss={tostClosed} />
    ) : null;


    return (
        // <div style={{ height: '250px' }}>
        //     <Frame>
        <Page >
            {toastMarkup}
        </Page>
        //     </Frame>
        // </div>
    );
}