/**
 * Security headers middleware.
 * Applies CSP, X-Frame-Options, Permissions-Policy, and other
 * hardened headers to all responses.
 */
export function securityHeaders() {
  return (req, res, next) => {
    // Prevent framing (anti-clickjacking)
    res.setHeader('X-Frame-Options', 'DENY')

    // XSS protection (legacy, but still useful)
    res.setHeader('X-XSS-Protection', '1; mode=block')

    // Prevent MIME-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff')

    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

    // Permissions policy — restrict browser features
    res.setHeader('Permissions-Policy', [
      'camera=(self)',
      'microphone=(self)',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'bluetooth=()',
      'serial=()',
      'hid=()',
    ].join(', '))

    // Content Security Policy
    // Allow self, inline styles (TailwindCSS), blob for camera,
    // specific CDNs for fonts/monaco/tensorflow
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob:",
      "connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com https://judge0-ce.p.rapidapi.com wss://*.supabase.co",
      "worker-src 'self' blob:",
      "frame-src 'none'",
    ].join('; '))

    next()
  }
}
