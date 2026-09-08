import { Page, EmptyState } from "@shopify/polaris";

export default function NotFound() {
    return (
        <Page>
            <EmptyState
                heading="404 – Page not found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
                <p>Access denied or page does not exist.</p>
            </EmptyState>
        </Page>
    );
}
