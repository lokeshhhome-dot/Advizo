import { useNavigate } from "react-router-dom";
import styles from "./Footer.module.css";

function Footer() {
    const year = new Date().getFullYear();
    const navigate = useNavigate();

    return (
        <footer className={styles.footer}>
            <p className={styles.copyright}>
                © {year} <span className={styles.brand}>Consultly</span>. All rights
                reserved.
            </p>
            <div className={styles.links}>
                <a
                    href="/faq"
                    className={styles.link}
                    onClick={(e) => {
                        e.preventDefault();
                        navigate("/faq");
                    }}
                >
                    Help &amp; FAQ
                </a>
                <span className={styles.divider} aria-hidden="true">·</span>
                <a
                    href="mailto:support@consultly.com"
                    className={styles.link}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Contact support
                </a>
            </div>
        </footer>
    );
}

export default Footer;
