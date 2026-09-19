# Property Staging App

Native iPhone and Android application, version 0.2.0. This is an engineering beta, not a market-ready release.

## Implemented

- Email/password sign-in and account creation through Supabase Auth. Confirmation emails use the project's existing email configuration.
- Saved projects and interior/exterior spaces, with database-enforced owner isolation.
- Private photo/video imports (10 MB per file) and design briefs with ten style choices.
- iPhone: ARKit floor-corner capture; RoomPlan 3D room capture on supported devices; camera/photo library; rectangular reference measurements.
- Android: ARCore floor-corner capture, camera preview and anchored corner markers; media import; rectangular reference measurements.
- Server-side capture normalization, floor-polygon validation, meter-to-millimeter conversion, and authenticated saving.
- Shared furniture-placement, measurement-provenance, product-variant, offer-comparison, and operating-cost engines.

## Run and build

```sh
npm ci --ignore-scripts
npm test
npm run test:db
```

The database test runs real Postgres logic in PGlite with minimal Auth/Storage scaffolding. It is separate from hosted integration and physical-device testing.

**iPhone:** use a Mac with Xcode and XcodeGen. From `apps/ios`, run `xcodegen generate`, open `SpaceStaging.xcodeproj`, choose your signing team and iPhone, then run. The bundle identifier is provisional. The simulator can build the UI but cannot validate real camera/AR behavior.

**Android:** use Android Studio with JDK 17, Android SDK 36, and Gradle 8.13. Open `apps/android` or run `gradle :app:assembleDebug`. ARCore is optional; unsupported devices use reference measurements. The application ID is provisional. Use the phone camera separately and import media in this beta.

The GitHub workflow builds an Android debug APK and an unsigned iOS simulator app. An APK is a development build, not a Play Store release. TestFlight needs Apple signing and distribution credentials.

## Backend

The checked-in client configuration contains only a publishable key. All user data requires authentication and row-level policies. No service-role or image-provider keys belong in the apps or repository.

Apply the migration under `supabase/migrations` to a Supabase project, and deploy the `capture` Edge Function with JWT verification enabled. Its body also verifies the session with Supabase Auth and checks space ownership before writing with the service role. The hosted migration history is the deployment source of truth.

Beta limits: 10 projects, 40 spaces, 50 media reservations, 100 floor captures, and 100 saved design briefs per user. Media is limited to 10 MB per object. Limits are not a claim that 25,000 active users have been load-tested. Rendering is not enabled and makes no paid AI calls.

## Remaining launch work

- AI image editing/rendering with architecture-preservation checks, usage limits, and billing.
- Licensed product feeds, variant-aware shopping, delivery/stock refresh, and service-provider integrations.
- Calibration against physical ground truth on iPhone and Android; cross-view consistency, irregular geometry, obstacles, doors and delivery access.
- Recoverable offline captures, encrypted persistent sessions, robust upload retry/cleanup, media viewing/export, account deletion, and accessibility review.
- Production SMTP, abuse controls, retention policies, monitoring/load tests, payments, and store assets/signing/review.

Every captured floor remains **unverified**. AR tracking and photorealistic imagery alone cannot establish accurate dimensions or furniture fit. RoomPlan JSON is stored as source evidence; it is not silently converted into a verified floor. Exterior floor capture needs a level, trackable surface and is not a terrain survey.

Source layout: `apps/ios`, `apps/android`, `packages/core`, `supabase`, `scripts`, and `test`.
