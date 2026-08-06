import React, { useState, useMemo } from 'react';
import styles from '../../components/ConsultantDashboard/UsersPage.module.css';

const UsersPage = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');

    // Sample user data
    const users = [
        { id: 1, name: 'Sarah Johnson', email: 'sarah.johnson@example.com', role: 'Senior Consultant', status: 'Active', joinDate: '2023-01-15', consultations: 45, rating: 4.9, avatar: 'SJ' },
       
    ];

    const getStatusBadge = (status) => {
        const badges = {
            'Active': { class: styles.badgeSuccess, text: 'Active' },
            'Inactive': { class: styles.badgeSecondary, text: 'Inactive' },
            'Pending': { class: styles.badgeWarning, text: 'Pending' }
        };
        return badges[status] || { class: styles.badgeSecondary, text: status };
    };

    // Filter and search users
    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const matchesSearch = 
                user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                user.role.toLowerCase().includes(searchQuery.toLowerCase());
            
            return matchesSearch;
        });
    }, [searchQuery]);

    // Sort users
    const sortedUsers = useMemo(() => {
        return [...filteredUsers].sort((a, b) => {
            let aValue = a[sortField];
            let bValue = b[sortField];

            if (sortField === 'name' || sortField === 'email' || sortField === 'role') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            if (sortDirection === 'asc') {
                return aValue > bValue ? 1 : -1;
            } else {
                return aValue < bValue ? -1 : 1;
            }
        });
    }, [filteredUsers, sortField, sortDirection]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const SortIcon = ({ field }) => {
        if (sortField !== field) {
            return (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.3, marginLeft: '4px' }}>
                    <path d="M8 9l4-4 4 4" />
                    <path d="M8 15l4 4 4-4" />
                </svg>
            );
        }
        return sortDirection === 'asc' ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '4px' }}>
                <path d="M8 9l4-4 4 4" />
            </svg>
        ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '4px' }}>
                <path d="M8 15l4 4 4-4" />
            </svg>
        );
    };

    return (
        <div className={styles.pageContainer}>
            {/* Header Section */}
            <div className={styles.headerSection}>
                <h1 className={styles.pageTitle}>
                    User Management
                </h1>
                <p className={styles.pageDescription}>
                    Manage consultants, track performance, and monitor user activity.
                </p>
            </div>

            {/* Search and Filter Section */}
            <div className={styles.searchCard}>
                <div className={styles.searchCardBody}>
                    {/* Search Bar */}
                    <div className={styles.searchInputWrapper}>
                        <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.35-4.35" />
                        </svg>
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder="Search users by name, email, or role..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Results Count */}
                    <div className={styles.resultsCount}>
                        <div className={styles.resultsText}>
                            Showing <strong>{sortedUsers.length}</strong> of <strong>{users.length}</strong> users
                        </div>
                    </div>
                </div>
            </div>

            {/* Users Table */}
            <div className={styles.tableCard}>
                <div className={styles.tableCardBody}>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead className={styles.tableHead}>
                                <tr>
                                    <th 
                                        className={styles.tableHeadCell}
                                        onClick={() => handleSort('name')}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            User
                                            <SortIcon field="name" />
                                        </div>
                                    </th>
                                    <th 
                                        className={styles.tableHeadCell}
                                        onClick={() => handleSort('role')}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            Role
                                            <SortIcon field="role" />
                                        </div>
                                    </th>
                                    <th 
                                        className={styles.tableHeadCell}
                                        onClick={() => handleSort('status')}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            Status
                                            <SortIcon field="status" />
                                        </div>
                                    </th>
                                    <th className={styles.tableHeadCell}>
                                        Consultations
                                    </th>
                                    <th className={styles.tableHeadCell}>
                                        Rating
                                    </th>
                                    <th 
                                        className={styles.tableHeadCell}
                                        onClick={() => handleSort('joinDate')}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            Join Date
                                            <SortIcon field="joinDate" />
                                        </div>
                                    </th>
                                    <th className={`${styles.tableHeadCell} ${styles.tableHeadCellRight}`}>
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className={styles.emptyState}>
                                            <div>
                                                <svg className={styles.emptyIcon} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                                    <circle cx="9" cy="7" r="4" />
                                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                                </svg>
                                                <p className={styles.emptyText}>No users found</p>
                                                <p className={styles.emptySubtext}>Try adjusting your search or filter criteria</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    sortedUsers.map((user) => {
                                        const statusBadge = getStatusBadge(user.status);
                                        return (
                                            <tr key={user.id} className={styles.tableRow}>
                                                <td className={styles.tableCell}>
                                                    <div className={`${styles.userInfo} ${styles.flex} ${styles.flexCenter}`}>
                                                        <div className={styles.userAvatar}>
                                                            {user.avatar}
                                                        </div>
                                                        <div>
                                                            <div className={styles.userName}>
                                                                {user.name}
                                                            </div>
                                                            <div className={styles.userEmail}>
                                                                {user.email}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className={styles.tableCell} style={{ fontSize: '14px', color: '#212529' }}>
                                                    {user.role}
                                                </td>
                                                <td className={styles.tableCell}>
                                                    <span className={`${styles.badge} ${statusBadge.class}`}>
                                                        {statusBadge.text}
                                                    </span>
                                                </td>
                                                <td className={styles.tableCell} style={{ fontSize: '14px', color: '#212529', fontWeight: '500' }}>
                                                    {user.consultations}
                                                </td>
                                                <td className={styles.tableCell}>
                                                    {user.rating > 0 ? (
                                                        <div className={`${styles.starRating} ${styles.flex} ${styles.flexCenter}`}>
                                                            <div className={styles.stars}>
                                                                {[...Array(5)].map((_, i) => (
                                                                    <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i < Math.floor(user.rating) ? "#ffc107" : "#e9ecef"} stroke={i < Math.floor(user.rating) ? "#ffc107" : "#e9ecef"} style={{ marginRight: '1px' }}>
                                                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                                                    </svg>
                                                                ))}
                                                            </div>
                                                            <span className={styles.ratingValue}>
                                                                {user.rating}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className={styles.textMuted} style={{ fontSize: '13px' }}>No ratings</span>
                                                    )}
                                                </td>
                                                <td className={styles.tableCell} style={{ fontSize: '14px', color: '#6c757d' }}>
                                                    {new Date(user.joinDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </td>
                                                <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                                                    <button 
                                                        className={styles.button}
                                                        title="View Details"
                                                    >
                                                        <svg className={styles.buttonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                            <circle cx="12" cy="12" r="3" />
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {sortedUsers.length > 0 && (
                        <div className={styles.pagination}>
                            <div className={styles.paginationInfo}>
                                Showing <strong>1</strong> to <strong>{sortedUsers.length}</strong> of <strong>{sortedUsers.length}</strong> results
                            </div>
                            <nav>
                                <ul className={styles.paginationNav}>
                                    <li className={styles.paginationItem}>
                                        <span className={`${styles.paginationLink} ${styles.paginationLinkDisabled}`}>
                                            Previous
                                        </span>
                                    </li>
                                    <li className={styles.paginationItem}>
                                        <span className={`${styles.paginationLink} ${styles.paginationLinkActive}`}>
                                            1
                                        </span>
                                    </li>
                                    <li className={styles.paginationItem}>
                                        <span className={styles.paginationLink}>
                                            2
                                        </span>
                                    </li>
                                    <li className={styles.paginationItem}>
                                        <span className={styles.paginationLink}>
                                            Next
                                        </span>
                                    </li>
                                </ul>
                            </nav>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UsersPage;
