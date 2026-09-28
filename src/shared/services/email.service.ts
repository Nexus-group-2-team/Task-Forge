import { Resend } from "resend";
import { env } from "../config/env.js";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export class EmailService {
  /**
   * Sends a password reset email via Resend.
   * Returns the Resend message id on success.
   * Throws with the Resend error details on failure (Resend returns
   * `{ data, error }` instead of throwing, so we must check explicitly).
   */
  static async sendPasswordResetEmail(to: string, resetLink: string, userName?: string): Promise<string> {
    const greeting = userName ? `Hi ${userName},` : "Hello,";

    if (!resend) {
      console.warn("[EmailService] RESEND_API_KEY not configured. Password reset link:", resetLink);
      throw new Error("RESEND_API_KEY is not configured");
    }

    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject: "Reset your TaskForge password",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>${greeting}</p>
          <p>You recently requested to reset the password for your TaskForge account. Click the button below to reset it:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" 
               style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">This link is valid for <strong>15 minutes</strong>. If you did not make this request, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px;">If the button does not work, copy and paste this link into your browser:<br/><a href="${resetLink}">${resetLink}</a></p>
        </div>
      `,
    });

    if (error) {
      console.error("[EmailService] Resend send failed:", JSON.stringify(error));
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }

    console.log(`[EmailService] Password reset email accepted by Resend -> id=${data?.id} to=${to}`);
    return data?.id ?? "";
  }
}
