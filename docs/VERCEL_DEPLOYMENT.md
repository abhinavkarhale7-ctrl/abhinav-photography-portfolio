# Vercel Deployment

## Import the project

1. Sign in to [Vercel](https://vercel.com) and choose **Add New → Project**.
2. Import `abhinavkarhale7-ctrl/abhinav-photography-portfolio`.
3. Keep the project root at the repository root and use the detected Next.js settings.
4. Choose `abhinavkarhale-photography` as the project name if available. The desired URL is `https://abhinavkarhale-photography.vercel.app`; confirm Vercel assigns it before relying on that URL.

## Production environment variables

Add these in **Project Settings → Environment Variables**, selecting the **Production** environment. Use real values from the services you configure. Never commit `.env.local` or paste secret values into issues or chat.

Required by the application:

- `DATABASE_URL`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_IMAGE_BUCKET_NAME`
- `R2_BLOG_IMG_BUCKET_NAME`
- `R2_ABOUT_IMG_BUCKET_NAME`
- `R2_CUSTOM_IMG_BUCKET_NAME`
- `R2_ACCOUNT_ID`
- `R2_REGION`
- `FLAGS_SECRET`
- `JWT_SECRET` (at least 32 characters; use a unique random value)
- `JWT_EXPIRATION_HOURS`
- `SITE_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The Upstash Vercel integration's `UPSTASH_REDIS_REST_KV_REST_API_URL` and
`UPSTASH_REDIS_REST_KV_REST_API_TOKEN` names are also supported.

Email delivery is optional while the portfolio is being launched. Password
reset, verification, storage-alert, and order email flows remain unavailable
until `RESEND_API_KEY` and `ADMIN_EMAIL` are configured. Resend requires a
verified domain you own; the free `vercel.app` hostname cannot be used as a
sender domain. `EDGE_CONFIG` is optional because the app does not currently
read it.

Set these site and feature values:

- `SITE_URL=https://abhinavkarhale-photography.vercel.app`
- `NEXT_PUBLIC_SITE_URL=https://abhinavkarhale-photography.vercel.app`
- `NEXT_PUBLIC_STORE_ENABLED=false`
- `NEXT_PUBLIC_AI_ENABLED=false`
- `CRON_SECRET` to a new, long random value to protect scheduled jobs

If Vercel assigns a different project URL, replace both site URL values with the assigned URL and redeploy. Stripe and Google AI credentials are unnecessary while those features remain disabled.

## Before launch

- Replace all example credentials with valid production credentials.
- Configure and verify the PostgreSQL schema using the project migrations before depending on database-backed routes. Review migrations and back up any database containing data before applying them.
- Configure the R2 buckets and public image URLs. The `r2.dev` URLs are
  rate-limited and not recommended for production; connect an owned custom
  domain before relying on them for substantial traffic.
- Confirm email delivery, admin access, image uploads, and gallery display in the deployed app.
- The About page shows a temporary biography until real content is saved. Add approved portfolio images and replace the temporary text before public launch.
- There is no confirmed public contact email in this repository yet. Add one before advertising a contact method.
