import React, { useEffect } from 'react';
import './ReactToast.css';

const ReactToast = ({ show, message, onClose, duration = 3000 }) => {
    useEffect(() => {
        if (show) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [show, duration, onClose]);

    if (!show) return null;

    return (
        <div className="react-toast">
            <div className="react-toast-content">
                <span className="react-toast-message">{message}</span>
                <button className="react-toast-close" onClick={onClose}>×</button>
            </div>
        </div>
    );
};

export default ReactToast;
