const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();

// Templates are functions so the timestamp is generated at SEND time —
// a plain template literal would freeze `new Date()` at server start.
const appInstall = () => `
<div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f6f8; padding: 40px 20px; margin: 0;">
  <table role="presentation" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
    
    <tr>
      <td style="background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 36px 30px; text-align: center;">
        <div style="font-size: 42px; margin-bottom: 10px;">🚀</div>
        <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 600; letter-spacing: 0.3px;">Login Successful</h1>
      </td>
    </tr>

    <tr>
      <td style="padding: 34px 30px;">
        <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">Hi there,</p>
        
        <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
          You have successfully logged into <strong style="color: #4f46e5;">advizo</strong>.
        </p>
        
        <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 26px;">
          We're glad to have you back! 🎉
        </p>

        <table role="presentation" style="width: 100%; background-color: #f5f5ff; border-radius: 10px; border: 1px solid #e0e0fa; margin-bottom: 26px;">
          <tr>
            <td style="padding: 18px 20px;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #555;"><strong style="color: #111;">App:</strong> advizo</p>
              <p style="margin: 0 0 10px; font-size: 14px; color: #555;"><strong style="color: #111;">Status:</strong> <span style="color: #4f46e5; font-weight: 600;">Login Successful</span></p>
              <p style="margin: 0; font-size: 14px; color: #555;"><strong style="color: #111;">Time:</strong> ${new Date().toLocaleString()}</p>
            </td>
          </tr>
        </table>

        <p style="color: #666; font-size: 14px; line-height: 1.7; margin: 0; padding: 14px 16px; background-color: #fef2f2; border-radius: 8px; border-left: 3px solid #ef4444;">
          ⚠️ If this wasn't you, please secure your account immediately.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding: 22px 30px; border-top: 1px solid #eee; text-align: center;">
        <p style="color: #999; font-size: 13px; margin: 0;">Thanks,<br/><strong style="color: #555;">advizo Team</strong></p>
      </td>
    </tr>

  </table>
</div>
`;

const appUninstall = () => `
<div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f6f8; padding: 40px 20px; margin: 0;">
  <table role="presentation" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">

    <tr>
      <td style="background: linear-gradient(135deg, #64748b, #334155); padding: 36px 30px; text-align: center;">
        <div style="font-size: 42px; margin-bottom: 10px;">👋</div>
        <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 600; letter-spacing: 0.3px;">Sorry to See You Go</h1>
      </td>
    </tr>

    <tr>
      <td style="padding: 34px 30px;">
        <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">Hi there,</p>

        <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
          <strong style="color: #4f46e5;">advizo</strong> has been uninstalled from your store.
        </p>

        <p style="color: #333; font-size: 15px; line-height: 1.7; margin: 0 0 26px;">
          Thank you for trying us out — we'd love to know what we could have done better.
        </p>

        <table role="presentation" style="width: 100%; background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 26px;">
          <tr>
            <td style="padding: 18px 20px;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #555;"><strong style="color: #111;">App:</strong> advizo</p>
              <p style="margin: 0 0 10px; font-size: 14px; color: #555;"><strong style="color: #111;">Status:</strong> <span style="color: #dc2626; font-weight: 600;">Uninstalled</span></p>
              <p style="margin: 0; font-size: 14px; color: #555;"><strong style="color: #111;">Time:</strong> ${new Date().toLocaleString()}</p>
            </td>
          </tr>
        </table>

        <p style="color: #666; font-size: 14px; line-height: 1.7; margin: 0 0 20px; padding: 14px 16px; background-color: #eff6ff; border-radius: 8px; border-left: 3px solid #3b82f6;">
          💡 Changed your mind? You can reinstall advizo anytime from the Shopify App Store — your setup can be restored quickly.
        </p>

        <p style="color: #666; font-size: 14px; line-height: 1.7; margin: 0;">
          Have feedback or ran into an issue? Just reply to this email — we read every message.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding: 22px 30px; border-top: 1px solid #eee; text-align: center;">
        <p style="color: #999; font-size: 13px; margin: 0;">Thanks,<br/><strong style="color: #555;">advizo Team</strong></p>
      </td>
    </tr>

  </table>
</div>
`;

const smtpHost = process.env.SMTP_HOST;
const smtpPORT = Number(process.env.SMTP_PORT || 587);
const smtpUSER = process.env.SMTP_USER;
const smtpPASS = process.env.SMTP_PASS;
const fromEmail = process.env.SMTP_FROM_EMAIL;

const isSmtpConfigured = () =>
  Boolean(smtpHost && smtpPORT && smtpUSER && smtpPASS);

let transporter = null;

const getTransporter = () => {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPORT,
      secure: smtpPORT === 465,
      auth: {
        user: smtpUSER,
        pass: smtpPASS,
      },
    });
  }
  return transporter;
};
const sendEmail = async ({ ownerEmail, userInstall }) => {
  try {
    if (!ownerEmail) {
      console.error("sendEmail skipped: ownerEmail is missing");
      return;
    }

    const mailer = getTransporter();
    if (!mailer) {
      console.error("SMTP is not configured");
      return;
    }

    const info = await mailer.sendMail({
      from: fromEmail || smtpUSER,
      to: ownerEmail,
      subject: userInstall ? "Welcome 🎉" : "Sorry to see you go 👋",
      html: userInstall ? appInstall() : appUninstall(),
    });

    console.log("Email sent:", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildSupportEmailHtml = ({
  consultantName,
  consultantEmail,
  shop,
  subject,
  message,
  isDummyAccount,
}) => `
  <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
    <h2 style="color: #2563eb;">Consultant support request</h2>
    <p><strong>Shop:</strong> ${escapeHtml(shop || "N/A")}</p>
    <p><strong>Consultant:</strong> ${escapeHtml(consultantName || "N/A")}</p>
    <p><strong>Email:</strong> ${escapeHtml(consultantEmail || "N/A")}</p>
    <p><strong>Account type:</strong> ${isDummyAccount ? "Demo / dummy consultant" : "Standard consultant"}</p>
    <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
    <div style="margin-top: 16px; padding: 14px; background: #f8fafc; border-radius: 8px;">
      <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
    </div>
  </div>
`;

const sendSupportEmail = async ({
  to,
  consultantName,
  consultantEmail,
  shop,
  subject,
  message,
  isDummyAccount = false,
}) => {
  if (!to) {
    return { sent: false, error: "Admin email is not configured for this shop" };
  }

  const mailer = getTransporter();
  if (!mailer) {
    return { sent: false, error: "SMTP is not configured" };
  }

  try {
    const info = await mailer.sendMail({
      from: fromEmail || smtpUSER,
      to,
      subject: `[Consultant Support] ${subject}`,
      html: buildSupportEmailHtml({
        consultantName,
        consultantEmail,
        shop,
        subject,
        message,
        isDummyAccount,
      }),
      replyTo: consultantEmail || undefined,
    });

    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error("sendSupportEmail error:", error.message || error);
    return {
      sent: false,
      error: error.message || "Failed to send support email",
    };
  }
};

const sendSupportReplyEmail = async ({
  to,
  consultantName,
  shop,
  subject,
  replyMessage,
}) => {
  if (!to) {
    return { sent: false, error: "Consultant email is missing" };
  }

  const mailer = getTransporter();
  if (!mailer) {
    return { sent: false, error: "SMTP is not configured" };
  }

  try {
    const info = await mailer.sendMail({
      from: fromEmail || smtpUSER,
      to,
      subject: `[Support Reply] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2563eb;">Admin replied to your support request</h2>
          <p><strong>Shop:</strong> ${escapeHtml(shop || "N/A")}</p>
          <p><strong>Consultant:</strong> ${escapeHtml(consultantName || "N/A")}</p>
          <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
          <div style="margin-top: 16px; padding: 14px; background: #f8fafc; border-radius: 8px;">
            <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(replyMessage)}</p>
          </div>
        </div>
      `,
    });

    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error("sendSupportReplyEmail error:", error.message || error);
    return {
      sent: false,
      error: error.message || "Failed to send reply email",
    };
  }
};

const sendPasswordResetEmail = async ({ to, name, otp }) => {
  if (!to) {
    return { sent: false, error: "Recipient email is missing" };
  }

  const mailer = getTransporter();
  if (!mailer) {
    return { sent: false, error: "SMTP is not configured" };
  }

  try {
    const info = await mailer.sendMail({
      from: fromEmail || smtpUSER,
      to,
      subject: "Your advizo password reset code",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 480px;">
          <h2 style="margin-top: 0;">Reset your password</h2>
          <p>Hi ${escapeHtml(name || "there")},</p>
          <p>Use the code below to reset your advizo password. It expires in 10 minutes.</p>
          <div style="margin: 20px 0; padding: 16px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; text-align: center;">
            <span style="font-size: 30px; font-weight: 700; letter-spacing: 8px;">${escapeHtml(otp)}</span>
          </div>
          <p style="color: #6b7280; font-size: 13px;">If you did not request this, you can safely ignore this email — your password will stay unchanged.</p>
        </div>
      `,
    });

    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error("sendPasswordResetEmail error:", error.message || error);
    return {
      sent: false,
      error: error.message || "Failed to send password reset email",
    };
  }
};

module.exports = {
  sendEmail,
  sendSupportEmail,
  sendSupportReplyEmail,
  sendPasswordResetEmail,
};
