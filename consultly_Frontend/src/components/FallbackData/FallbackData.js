export const sortOptions = [
    { label: 'Name', value: 'name asc', directionLabel: 'A-Z' },
    { label: 'Name', value: 'name desc', directionLabel: 'Z-A' },
    { label: 'Email _id', value: 'email asc', directionLabel: 'A-Z' },
    { label: 'Email _id', value: 'email desc', directionLabel: 'Z-A' },
    { label: 'Contact', value: 'contact asc', directionLabel: 'Ascending' },
    { label: 'Contact', value: 'contact desc', directionLabel: 'Descending' },
    { label: 'Profession', value: 'profession asc', directionLabel: 'A-Z' },
    { label: 'Profession', value: 'profession desc', directionLabel: 'Z-A' },
    { label: 'Experience', value: 'experience asc', directionLabel: 'Ascending' },
    { label: 'Experience', value: 'experience desc', directionLabel: 'Descending' },
    { label: 'Conversion Fees', value: 'conversionFees asc', directionLabel: 'Ascending' },
    { label: 'Conversion Fees', value: 'conversionFees desc', directionLabel: 'Descending' },
    { label: 'Status', value: 'status asc', directionLabel: 'A-Z' },
    { label: 'Status', value: 'status desc', directionLabel: 'Z-A' },
];


export const headings = [
    { title: 'Sr. No.', alignment: 'start' },
    { title: 'Image', alignment: 'center' },
    { title: 'Name', alignment: 'center' },
    { title: 'Profession', alignment: 'center' },
    { title: 'Chats', alignment: 'center' },
    { title: 'Voice Calls', alignment: 'center' },
    { title: 'Video Calls', alignment: 'center' },
    { title: 'Wallet Balance', alignment: 'center' },
    { title: 'Status', alignment: 'center' },
    { title: 'Action', alignment: 'center' },
];

export const itemStrings = [


];


export const apps = [
    {
        name: "Easy Language Translate",
        image: "./images/apps-img/app1.png",
    },
    {
        name: "Blokr Country Redirect & Block",
        image: "./images/apps-img/app2.png",
    },
    {
        name: "Smart Zipcode Validator",
        image: "./images/apps-img/app3.png",
    },
    {
        name: "Badgio: Product Label & Badges",
        image: "./images/apps-img/app4.png",
    },
    {
        name: "Jobo Bundle",
        image: "./images/apps-img/app5.png",
    },
    {
        name: "Stylo Store: Theme Sections",
        image: "./images/apps-img/app6.png",
    },
    {
        name: "AptBook : Appointment Booking",
        image: "./images/apps-img/app7.png",
    },
];


export const availableTags = ['English', 'French', 'Hindi', 'Japanese', 'Russian', 'Shona', 'Sesotho', 'Spanish', 'Tajik'];

export const genderOptions = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
];




export const DashboardIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
);

export const UsersIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

export const ChatIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
);

export const ITEMS = ({ validation }) => [
    // {
    //     id: 0,
    //     title: "App Status Configuration",
    //     description:
    //         "Go to the top of the dashboard page and click the Enable/Disable button to activate or deactivate the consultant management system.",
    //     complete: validation?.appStatus === true,
    //     primaryButton: {
    //         content: "Go to Dashboard",
    //         props: {
    //             external: true,
    //         },
    //     },
    // },
    {
        id: 1,
        title: "Add Your First Consultant",
        description:
            "Navigate to the Consultant List page and click on 'Add Consultant' button. Fill in all the required details including name, email, contact, profession, experience, and conversion fees.",
        complete: validation?.consultantCount > 0,
        primaryButton: {
            content: "Add Consultant",
            props: {
                external: true,
            },
        },
    },




];

