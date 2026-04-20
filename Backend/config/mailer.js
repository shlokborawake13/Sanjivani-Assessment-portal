import nodemailer from 'nodemailer'

// ─── SMTP Configuration ─────────────────────────────────────
// Uses Gmail SMTP by default. For production, switch to SendGrid/Resend.
// Required env vars: SMTP_USER, SMTP_PASS (Gmail App Password)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for 587 (STARTTLS)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

// ─── Verify SMTP connection on startup ──────────────────────
export async function verifySmtp() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('⚠️  SMTP not configured — email verification will NOT work.')
    console.warn('   Set SMTP_USER and SMTP_PASS in .env (see email_setup_guide.md)')
    return false
  }
  try {
    await transporter.verify()
    console.log('✅ SMTP connection verified — emails will be sent via', process.env.SMTP_HOST || 'smtp.gmail.com')
    return true
  } catch (err) {
    console.error('❌ SMTP connection failed:', err.message)
    console.error('   Check your SMTP_USER and SMTP_PASS in .env')
    return false
  }
}

// ─── Send Verification Email ────────────────────────────────
export async function sendVerificationEmail(toEmail, confirmationUrl, userName) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ Cannot send verification email — SMTP not configured')
    return false
  }

  const fromName = process.env.SMTP_FROM_NAME || 'Sanjivani Assessment Portal'
  const fromEmail = process.env.SMTP_USER

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    subject: 'Verify your Sanjivani Portal account',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 12px; overflow: hidden;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Sanjivani Assessment Portal</h1>
          <p style="color: #93c5fd; margin: 8px 0 0; font-size: 14px;">Email Verification</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 24px;">
          <p style="color: #1e293b; font-size: 16px; margin: 0 0 8px;">Hello${userName ? ' ' + userName : ''},</p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
            Thank you for registering on the Sanjivani Assessment Portal. Please click the button below to verify your email address and activate your account.
          </p>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="${confirmationUrl}" 
               style="display: inline-block; background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.5px;">
              ✓ Verify My Email
            </a>
          </div>

          <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 24px 0 0;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${confirmationUrl}" style="color: #2563eb; word-break: break-all;">${confirmationUrl}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            If you didn't create this account, you can safely ignore this email.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #f1f5f9; padding: 16px 24px; text-align: center;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">
            © ${new Date().getFullYear()} Sanjivani Assessment Portal. All rights reserved.
          </p>
        </div>
      </div>
    `
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    console.log(`📧 Verification email sent to ${toEmail} (messageId: ${info.messageId})`)
    return true
  } catch (err) {
    console.error(`❌ Failed to send verification email to ${toEmail}:`, err.message)
    return false
  }
}

// ─── Send Password Reset Email ──────────────────────────────
export async function sendPasswordResetEmail(toEmail, resetUrl, userName) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ Cannot send password reset email — SMTP not configured')
    return false
  }

  const fromName = process.env.SMTP_FROM_NAME || 'Sanjivani Assessment Portal'
  const fromEmail = process.env.SMTP_USER

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    subject: 'Reset your Sanjivani Portal password',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 12px; overflow: hidden;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Sanjivani Assessment Portal</h1>
          <p style="color: #93c5fd; margin: 8px 0 0; font-size: 14px;">Password Reset</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 24px;">
          <p style="color: #1e293b; font-size: 16px; margin: 0 0 8px;">Hello${userName ? ' ' + userName : ''},</p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
            We received a request to reset your password. Click the button below to choose a new password. This link will expire in 1 hour.
          </p>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" 
               style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.5px;">
              🔑 Reset My Password
            </a>
          </div>

          <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 24px 0 0;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
          </p>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #f1f5f9; padding: 16px 24px; text-align: center;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">
            © ${new Date().getFullYear()} Sanjivani Assessment Portal. All rights reserved.
          </p>
        </div>
      </div>
    `
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    console.log(`📧 Password reset email sent to ${toEmail} (messageId: ${info.messageId})`)
    return true
  } catch (err) {
    console.error(`❌ Failed to send password reset email to ${toEmail}:`, err.message)
    return false
  }
}

export default transporter
