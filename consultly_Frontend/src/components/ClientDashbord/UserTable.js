import React, { useState } from "react";
import { Spinner } from "@shopify/polaris";
import styles from "./UserTable.module.css";

const UserTable = ({ columns, data, title, loading }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const indexOfLast = currentPage * rowsPerPage;
    const indexOfFirst = indexOfLast - rowsPerPage;
    const currentRows = data.slice(indexOfFirst, indexOfLast);
    const totalPages = Math.ceil(data.length / rowsPerPage);

    const getVisiblePages = () => {
        const pages = [];
        const start = Math.max(1, currentPage - 1);
        const end = Math.min(totalPages, currentPage + 1);

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }

        return pages;
    };

    return (
        <div className={styles.tableWrapper}>
            <div className={styles.tableHeader}>
                <h5 className={styles.tableTitle}>{title}</h5>
                <select
                    className={styles.rowsSelect}
                    value={rowsPerPage}
                    onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                    }}
                >
                    <option value={5}>5 rows</option>
                    <option value={10}>10 rows</option>
                </select>
            </div>

            <div className={styles.tableCard}>
                <div className={styles.tableScroll}>
                    <table className={styles.dataTable}>
                        <thead>
                            <tr>
                                <th>#</th>
                                {columns.map((col) => (
                                    <th key={col.key}>{col.label}</th>
                                ))}
                            </tr>
                        </thead>

                        {loading ? (
                            <tbody>
                                <tr>
                                    <td
                                        colSpan={columns.length + 1}
                                        className={styles.stateCell}
                                    >
                                        <Spinner accessibilityLabel="Loading table data" />
                                    </td>
                                </tr>
                            </tbody>
                        ) : (
                            <tbody>
                                {currentRows.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={columns.length + 1}
                                            className={styles.stateCell}
                                        >
                                            <p className={styles.emptyText}>
                                                No records found
                                            </p>
                                        </td>
                                    </tr>
                                ) : (
                                    currentRows.map((row, index) => (
                                        <tr key={index}>
                                            <td className={styles.indexCell}>
                                                {indexOfFirst + index + 1}
                                            </td>

                                            {columns.map((col) => (
                                                <td key={col.key}>
                                                    {col.render
                                                        ? col.render(row)
                                                        : row[col.key]}
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        )}
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {!loading && data.length > 0 && (
                <div className={styles.paginationBar}>
                    <span className={styles.paginationInfo}>
                        Showing {indexOfFirst + 1}–
                        {Math.min(indexOfLast, data.length)} of {data.length}
                    </span>
                    <ul className={styles.pagination}>
                        <li>
                            <button
                                className={styles.pageBtn}
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(currentPage - 1)}
                            >
                                Prev
                            </button>
                        </li>
                        {getVisiblePages().map((page) => (
                            <li key={page}>
                                <button
                                    className={`${styles.pageBtn} ${
                                        currentPage === page
                                            ? styles.pageBtnActive
                                            : ""
                                    }`}
                                    onClick={() => setCurrentPage(page)}
                                >
                                    {page}
                                </button>
                            </li>
                        ))}
                        <li>
                            <button
                                className={styles.pageBtn}
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(currentPage + 1)}
                            >
                                Next
                            </button>
                        </li>
                    </ul>
                </div>
            )}
        </div>
    );
};

export default UserTable;
