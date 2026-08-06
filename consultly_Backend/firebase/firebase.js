const admin = require("firebase-admin");

const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDqegpi1dztgZXH\nmSIQoI7eeeQEts1ZAFT7xFxu4+kL4jZw5ApjfHAtewte6LtQX+PeP9R2mVseJtJg\nZG5buUnB2m0qXdKMFuZkT86BXqF8uUKmtNlBKD/EKatSNiglnyEeo9EDL2GCsUme\n+vqsXtCMlEiW4g8VxtW3UfldLVUhldXDWgbMbTSu8nN2eABZmJDNQzFzjLIx4WE0\n1cYoLSINCSxqnQsCgwCNSZZTOIF8IlS4825DdCWECPKMYr0DRyVU81J4HWzGi6rJ\n7Y9oQEUvdHx6H2dDpWo9dNO+3n3EebOKDGfj9naYQ3Uh7B6jI3VYxh2U2JR1Yktj\nMvbess3vAgMBAAECggEAPcGI7MEhIBjqRxjJBRIUrvnxmWBAM3nH6EuugLJcVfnt\nlswpBEzpCsGGnCe19hRbYtTy842ulwFolWS+QEBL8dfCus7dPnJlmfP/EsnGxJ/S\nsy+crPGZ4eOLsOp8pnQD+BrzWOBo0VA6cLnvveh3Cx+fAsZlbLni3hakE+t1qZNZ\nGzZ4mTR5FxegUQxYPq1nSJSCd7a3oH+/Ix8OpsHhprP5mKsVC7EA94+Gp2VoLc+n\nH8mHOKNBn0xtxF/UrvzwKJhdJ6Q38+aS5vUVruIf/Uenrx/8sKhNb8Ux+Viuh/Tx\nABP+ejg36NquZcrum0ducgOYXEwRrJ7ddsdxZVsMyQKBgQD2j0tJVXGsp6y5L1fJ\nk+cf80VGn0G2CIJLHVrwntDDBkORgH6fAWlW3+njx+zadCc8y2azI6e7tnzY44Wm\nfP1WPz2/sENibMyCOdQZtMZUQm14jS0sVZj+UMNHO90xrO5URY3pgteD7jY9Xktf\nn0+6eR02qyc36GVGM61SbpiAFQKBgQDzdE/wxTsBElcxUTdNOeo+nmdKrfOjtKFQ\nCfNxtgY2DeGtDutsAfWwBD9JywYhZkeUGjYd+J9WcKjAw8m/UfwME8nOhTW/TabL\nOQawW8/6dM/FGqzpir1L0GqC96CV1nGRDir04HrxhWzBlS/Q6blGfLxPdYOnBbxA\nYcVxd2DS8wKBgA2gYcLNzBiEs9EQQsPLPszPPxbmGlWbJshL+QivXk5I/FcASP80\nrsO0YFLMa9Su8rQzcZuY7t46+a9q86n94mpv2FPNxAueg7b2xzgce5GQkkhFVSfM\nG0aC5Cf9sP3b1tgld/Bd4NdTxP+jRHsmbNubcffhgatfVqmIlZ2mqxr5AoGAHRYq\nbuPBlvEwBa5kYw+mUvDt+lgqIcb09vEZat6Kg27JJboAmpjpV6xKO3DMPLVRm/o9\nuPr5XoR7RPyfYAJVkMPUep4ju8V1RhZ8HBn8ETpfkHcNbaGr2CEAeMFJKF3El8YP\nj846Ih0Ez2QZoGYsQqWogf3SSuQ+h5qm0lWm9c0CgYEAyFeBk+PVzqmI7jDEZQWS\nid1q7qwSOHrlqMgsQMrJuVFemYfd+IHQ4meYR/QwmSVMlETQPImJ1e/z9Tys+vO0\nr63clByJc9Td+0sRr0VjmUSBRlTpToQ/4gEiLpYkIQtOdD+o8ZcX3kuUNCYyUphD\nglc2plrL+TbyEybnee9Dq+4=\n-----END PRIVATE KEY-----\n";

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || "consultant-app-24ceb",
        clientEmail:
            process.env.FIREBASE_CLIENT_EMAIL ||
            "firebase-adminsdk-fbsvc@consultant-app-24ceb.iam.gserviceaccount.com",
        privateKey,
    }),
});

module.exports = admin;
