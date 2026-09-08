import React from "react";
import styles from "./PageHeader.module.css";

/**
 * Every workspace page renders its own header inline in the canvas — there is
 * no shell-level top bar any more. Keeping this as one shared component (not
 * copy-pasted per page) is what keeps that consistent without duplicating CSS.
 */
export default function PageHeader({ title, description, actions, tabs }) {
  return (
    <div className={styles.header}>
      <div className={styles.top}>
        <div className={styles.text}>
          <h1 className={styles.title}>{title}</h1>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
    </div>
  );
}
