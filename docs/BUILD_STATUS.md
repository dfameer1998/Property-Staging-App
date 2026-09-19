# Engineering beta milestone

Date: 2026-09-19. Working product name: Space Staging.

The original product scope remains native iPhone and Android scanning at paid launch, AI staging, shopping comparison, and physical setup services. This commit establishes the capture and storage milestone; it does not reduce that launch scope.

## Capture contract

Clients submit `schemaVersion: 1`, UUID `id` and `spaceId`, platform/route, `unit: m`, `coordinateSystem: right_handed_y_up`, and ordered `floorPoints: [[x,y,z], ...]`. Optional `ceilingHeightM` is a user observation. Points must share a floor level within 15 cm, not cross, and form a nondegenerate boundary. The server converts coordinates to millimeters relative to the first point and computes estimated area. A 15 cm consistency check is not an accuracy tolerance or confidence bound.

The service discards all client verification, obstacle, and uncertainty assertions. It stores `verification: unverified`, unknown uncertainty/obstacles, and `delivery_access: not_assessed`. Verified-fit decisions require an independently authorized measurement review that is not implemented yet.

## Data and access

Projects own spaces; spaces own media, captures, and briefs. Composite foreign keys include owner IDs to prevent attaching one user's children to another user's project or space. Client capture writes are denied; the Edge Function validates and writes after verifying user identity and space ownership. Private uploads need a matching owner/space reservation; upload bytes/type must match it. Upload completion checks for an existing storage object. Existing files cannot be overwritten by clients.

Client session tokens are in memory only in this beta. No password or refresh token is committed or written to persistent app storage. Native session persistence and offline drafts are scheduled next. Failed uploads can leave reservations; cleanup/retry is a release blocker, not an assumed success.

## Release gates

1. Native compilation and physical phone smoke tests on LiDAR and non-LiDAR iPhone plus depth and non-depth Android.
2. Ground-truth measurement study, photo/video QA, interruption recovery, outdoor failure cases, and accessibility.
3. Image-provider billing account/key stored only as a server secret; product image evaluation before enabling paid rendering.
4. Retail/service provider access and real integration tests. Consumer account connections do not grant catalog API rights.
5. Production email, deletion/retention, store signing, payment policy review, concurrency/load and cost tests.

An app-store launch and 25,000-user readiness have not been established by this milestone.
