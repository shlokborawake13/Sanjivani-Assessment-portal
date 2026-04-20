# 📧 Email Verification Setup Guide

## The Problem
Supabase's `admin.generateLink()` generates a verification URL but does NOT send an email. 
We now use **nodemailer** to send the email ourselves via Gmail SMTP.

---

## Step-by-Step Setup

### 1. Enable 2-Factor Authentication on Gmail
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google", click **2-Step Verification**
3. Follow the prompts to enable it

### 2. Generate a Gmail App Password
1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
2. Select **"Mail"** as the app
3. Select **"Windows Computer"** as the device
4. Click **Generate**
5. Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

### 3. Update `.env` File
Open `Backend/.env` and replace the placeholder values:

```env
SMTP_USER=your-actual-gmail@gmail.com
SMTP_PASS=abcdefghijklmnop
```

> ⚠️ Use the App Password from step 2, NOT your Gmail password!
> Remove spaces from the app password.

### 4. Restart the Backend
```bash
# Stop the running server (Ctrl+C)
# Start again
npm run dev
```

You should see:
```
🚀 Sanjivani API running on http://localhost:5000
✅ SMTP connection verified — emails will be sent via smtp.gmail.com
```

If you see `⚠️ SMTP not configured`, double-check your `.env` values.

---

## How It Works Now

1. **User registers** → Backend creates account with `email_confirm: false`
2. **Backend generates** verification link via `admin.generateLink()`
3. **Nodemailer sends** a branded HTML email with the verification link
4. **User clicks link** → Supabase confirms the email → Redirects to `/login?verified=true`
5. **User logs in** normally

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No email received | Check spam/promotions folder |
| SMTP connection failed | Verify 2FA is enabled and app password is correct |
| "Less secure apps" error | Use App Password, not your real password |
| Link doesn't work | Check `FRONTEND_URL` in `.env` matches your dev server |
| `rate limit` in logs | Wait a few minutes, Gmail has sending limits |

---

## Production Setup
For production, replace Gmail SMTP with a professional service:

### Resend (Recommended)
```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_your_api_key
```

### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your_api_key
```
