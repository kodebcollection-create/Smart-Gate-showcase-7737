# SmartGate expansion plan (credit-efficient, phased)

There are 13 features here, so they are split into 4 phases. Each phase ends with a working, tested app. Cheap, high-value features come first. Features that build on another feature come after it.

## Phase 1 — Guard scanner upgrades (small, high value)
1. **Instant lost-device broadcast**: when a student reports a laptop lost, every guard with the scanner open sees a live red banner, hears a beep and gets a refreshed offline list.
2. **Sound & haptic controls**: a guard settings toggle with Normal, Loud siren (higher, longer tones) and Continuous vibration until Acknowledge is tapped. Saved on the phone.
3. **Flagged guard audit trail**: every scan, sign-in/out, status change and lost-report update records which guard did it. Admins can read it in the Admin tab.
4. **Lost & Found completion**: add a "Log unattended device" form (serial or QR scan, location, note, photo) and include these items in the existing CSV export.

## Phase 2 — Installable app + true offline
5. **Installable app**: app name, icon, full-screen mode and no browser address bar on Android and iOS.
6. **Offline caching**: the scanner, sounds and styles are cached so the app opens with zero data, using the existing offline registry and sync queue.
   - This works only in the published app, not in the editor preview.

## Phase 3 — Students & devices
7. **Multi-device support**: a device type (laptop, tablet, lab kit, other) on each registration. The guard result shows the type. If a student has several devices, the guard picks the right one from a selector. The rule "only one laptop on campus at a time" stays, but only for laptops.
8. **Student-to-student transfer**: Student A starts a handover to Student B's username. B accepts or declines in the app. When B accepts, the owner changes, the QR is rotated and the change is saved to the transfer log. No admin is needed. A device cannot be transferred while it is on campus or flagged.
9. **Expiring QR passes**: the student's pass screen shows a QR that refreshes every 30 seconds and stops working after 60. A screenshot stops working within a minute. Offline scanning still accepts the last valid pass using a signed short window.

## Phase 4 — Command center
10. **Live occupancy counter**: a big live count of devices on campus vs off campus at the top of the Admin tab.
11. **Peak hour heatmap**: an interactive chart of entries and exits by hour and day, with a date range filter.
12. **Multi-gate support**: an admin manages gates (Main, Library, Hostel) and assigns guards to posts. Each scan is tagged with the guard's gate, and the CSV and charts can be filtered by gate.

## Needs a decision
13. **ID card OCR**: the app can read the name and registration number from a photo of the ID card and pre-fill the profile. But it **cannot check them against university records** without access to the CUK student system. The proposal is to pre-fill only and flag mismatches for admin review.

## Technical notes
- Broadcast: realtime on the lost-report events table. Guards subscribe while the scanner is mounted.
- New tables: guard_audit (actor, action, laptop, details), gates and guard_posts, transfer_requests (pending/accepted/declined), found_items. New columns: device_type on laptops, gate_id on gate_events and scan_logs. All with RLS and grants.
- Expiring QR: a server-signed HMAC over (secret_qr_id, 30-second window). Lookup accepts the current and previous window. The secret is generated server-side.
- PWA: vite-plugin-pwa generateSW with a guarded registration wrapper. It never registers in the preview.
- OCR: the AI Gateway vision model, behind a server function.
- Charts: recharts (already available through shadcn chart).
- Emails stay out of scope until an email domain is set up.

Each phase is one build and test pass, so if credits run low, the finished phases already work.
