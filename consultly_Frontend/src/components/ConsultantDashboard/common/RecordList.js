import React, { useEffect, useState } from "react";
import styles from "./RecordList.module.css";

/**
 * A row-based record list — the shared replacement for Polaris <IndexTable>
 * across the consultant-facing pages (Sessions, Earnings transactions,
 * Withdrawals). Polaris's table chrome is Shopify's own admin design
 * language; using it here was a big part of why those pages still read as a
 * generic admin panel, so consultant surfaces render their own rows instead.
 */
export default function RecordList({
  items = [],
  loading = false,
  error = null,
  onRetry,
  emptyIcon,
  emptyTitle = "Nothing here yet",
  emptyText = "",
  pageSize = 8,
  renderItem,
  keyField = "_id",
}) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  if (loading) {
    return (
      <div className={styles.wrap}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.skeletonRow} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorBox}>
        <span>{error}</span>
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        {emptyIcon ? <span className={styles.emptyIcon}>{emptyIcon}</span> : null}
        <div className={styles.emptyTitle}>{emptyTitle}</div>
        {emptyText ? <p className={styles.emptyText}>{emptyText}</p> : null}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return (
    <div className={styles.wrap}>
      <div className={styles.list}>
        {pageItems.map((item, i) => (
          <div className={styles.row} key={item[keyField] || start + i}>
            {renderItem(item, start + i)}
          </div>
        ))}
      </div>

      {totalPages > 1 ? (
        <div className={styles.pagination}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Presentational row primitive shared by every RecordList consumer. */
export function RecordRow({ leading, title, subtitle, trailing }) {
  return (
    <div className={styles.rowInner}>
      {leading ? <div className={styles.rowLeading}>{leading}</div> : null}
      <div className={styles.rowMain}>
        <div className={styles.rowTitle}>{title}</div>
        {subtitle ? <div className={styles.rowSubtitle}>{subtitle}</div> : null}
      </div>
      {trailing ? <div className={styles.rowTrailing}>{trailing}</div> : null}
    </div>
  );
}
