import React from 'react';
import { NavigationMenu } from '@shopify/app-bridge-react';

export default function AppNavigation() {
    return (
        <NavigationMenu
            navigationLinks={[
                {
                    label: "Dashboard",
                    destination: "/dashboard",
                },
                {
                    label: "Consultant List",
                    destination: "/consultant-list",
                },
                {
                    label: "Pricing",
                    destination: "/pricing",
                },
                {
                    label: "FAQ",
                    destination: "/faq",
                },
              
            ]}
        />
    );
}

