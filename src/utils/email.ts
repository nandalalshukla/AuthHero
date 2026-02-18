import { transporter } from "../config/email";
import { env } from "../config/env";
import { AppError } from "../lib/AppError";
import { INTERNAL_SERVER_ERROR } from "../config/http";

const emailWrapper = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AuthHero</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background-color:#ffffff;border-radius:12px;border:1px solid #E5E7EB;box-shadow:0 12px 30px rgba(15,23,42,0.06);">
          <!-- Header -->
          <tr>
            <td style="padding:24px 28px 20px 28px;border-bottom:1px solid #E5E7EB;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:18px;font-weight:700;color:#111827;">
                    AuthHero
                  </td>
                  <td align="right" style="font-size:12px;color:#6B7280;">
                    Your authentication partner
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px 28px 28px 28px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 28px 24px 28px;border-top:1px solid #E5E7EB;text-align:center;background-color:#F9FAFB;">
              <p style="margin:0 0 4px 0;font-size:12px;color:#6B7280;">
                © ${new Date().getFullYear()} AuthHero. All rights reserved.
              </p>
              <p style="margin:4px 0 0 0;font-size:11px;color:#9CA3AF;">
                You are receiving this email because you use AuthHero.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

async function sendEmail(to: string, subject: string, html: string) {
  try {
    const mailData = {
      from: env.EMAIL_USER,
      to,
      subject,
      html: emailWrapper(html),
    };

    const info = await new Promise((resolve, reject) => {
      transporter.sendMail(mailData, (err, info) => {
        if (err) {
          reject(err);
        } else {
          resolve(info);
        }
      });
    });
    console.log(`✅ Email sent successfully to: ${to}`);
    console.log(`📬 Message ID: ${(info as any).messageId}`);
    return info;
  } catch (error: any) {
    console.error(`❌ Failed to send email to: ${to}`);
    console.error(`❌ Error details:`, error.message);
    throw new AppError(INTERNAL_SERVER_ERROR, "Failed to send email");
  }
}

export { sendEmail };
