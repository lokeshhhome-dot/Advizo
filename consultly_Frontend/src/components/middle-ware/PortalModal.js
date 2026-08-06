import { createPortal } from "react-dom";

const PortalModal = ({ children }) => {
    return createPortal(children, document.body);
};

export default PortalModal;
