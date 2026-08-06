import { useSelector, useDispatch } from "react-redux";
import { useEffect, useState } from "react";


export default function InsufficientBalanceModal({ show, setShow, insufficientBalance }) {

    const handleClose = () => {
        setShow(false);
        // dispatch(clearError());
    };

    return (
        <>
            <div
                className={`modal fade ${show ? "show d-block" : ""}`}
                style={{ background: "rgba(0,0,0,0.5)" }}
            >
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content" style={{ borderRadius: "12px" }}>

                        {/* Header */}
                        <div className="modal-header" style={{ borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h5 className="modal-title">Insufficient Balance</h5>
                            <button
                                className="btn"
                                onClick={handleClose}
                                style={{
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    padding: "0px",
                                    borderRadius: "50%",
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer"
                                }}
                            >
                                <svg 
                                    width="24" 
                                    height="24" 
                                    viewBox="0 0 24 24" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="2.5" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round"
                                >
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>

                        </div>

                        {/* Body */}
                        <div className="modal-body">
                            <p>Insufficient wallet balance</p>

                            <p className="mb-1">
                                Your Balance: <b>₹{insufficientBalance?.available}</b>
                            </p>

                            <p>
                                Required: <b>₹{insufficientBalance?.required}</b>
                            </p>
                        </div>

                        {/* Footer */}
                        <div
                            className="modal-footer"
                            style={{ borderTop: "1px solid #eee",  }}
                        >
                            <button className="btn btn-light" onClick={handleClose}>
                                Close
                            </button>

                            <button className="btn"
                                style={{
                                    backgroundColor: "#ff6d2d",
                                    color: "white",
                                    padding: "6px 18px",
                                    borderRadius: "6px"
                                }}>
                                Add Money
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {show && <div className="modal-backdrop fade show"></div>}
        </>
    );
}
