/** @type {import('next').NextConfig} */

// Content-Security-Policy
// - default-src 'self'
// - script-src allows Next.js inline scripts (nonce-based would be ideal but
//   requires dynamic rendering; sha-based covers the inline hydration script)
// - connect-src allows Supabase project URL + Google AI API
// - style-src 'unsafe-inline' required by Tailwind CSS
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  : '*.supabase.co';

const cspDirectives = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,          // unsafe-eval needed by Next.js dev; tighten in prod if possible
  `style-src 'self' 'unsafe-inline'`,                          // Tailwind requires unsafe-inline
  `img-src 'self' data: blob:`,
  `font-src 'self'`,
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://generativelanguage.googleapis.com`,
  `frame-ancestors 'none'`,                                    // equivalent to X-Frame-Options DENY
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy',   value: cspDirectives },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control',    value: 'on' },
  {
    key:   'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
