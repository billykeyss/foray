import test from "node:test";
import assert from "node:assert/strict";

process.env.TZ = "America/Los_Angeles"; // sunTimes picks the event on the device-local date
const { sunTimes } = await import("../lib/daylight.ts");
const { licenseWarning, parseLicenses } = await import("../lib/license.ts");
const { fishingHoursWindow } = await import("../lib/fishing-hours.ts");

// Truckee (39.33, -120.18), 2026-11-15. Reference: sunrise-sunset.org API (NOAA-based) returned
// sunrise 14:44:42Z, sunset 00:46:01Z (Nov 16); the NOAA spreadsheet equations (our implementation)
// agree within 20 s. gml.noaa.gov/grad/solcalc is interactive-only (no fetchable endpoint).
const REF_SUNRISE = Date.UTC(2026, 10, 15, 14, 44, 42);
const REF_SUNSET = Date.UTC(2026, 10, 16, 0, 46, 1);

test("Truckee sunrise/sunset within 2 minutes of NOAA", () => {
  const s = sunTimes(39.33, -120.18, new Date(2026, 10, 15, 12));
  assert.ok(Math.abs(s.sunrise.getTime() - REF_SUNRISE) <= 120000, s.sunrise.toISOString());
  assert.ok(Math.abs(s.sunset.getTime() - REF_SUNSET) <= 120000, s.sunset.toISOString());
});

test("polar night returns invalid dates, not a throw", () => {
  const s = sunTimes(80, 0, new Date(2026, 11, 21));
  assert.ok(Number.isNaN(s.sunrise.getTime()));
});

const T = "2026-11-15";
test("licenseWarning: expired, soon, today, fine", () => {
  assert.equal(licenseWarning([{ state: "NV", expires: "2026-11-14" }], ["NV"], T), "License expired");
  assert.equal(licenseWarning([{ state: "NV", expires: "2026-11-20" }], ["NV"], T), "License expires in 5 days");
  assert.equal(licenseWarning([{ state: "NV", expires: "2026-11-16" }], ["NV"], T), "License expires in 1 day");
  assert.equal(licenseWarning([{ state: "NV", expires: "2026-11-29" }], ["NV"], T), "License expires in 14 days");
  assert.equal(licenseWarning([{ state: "NV", expires: "2026-11-15" }], ["NV"], T), "License expires today");
  assert.equal(licenseWarning([{ state: "NV", expires: "2026-11-30" }], ["NV"], T), null);
});

test("licenseWarning: missing state, two-state water, nothing saved", () => {
  const nv = [{ state: "NV", expires: "2027-06-01" }];
  assert.equal(licenseWarning(nv, ["CA"], T), "No CA license for this water");
  assert.equal(licenseWarning([{ state: "CA", expires: "2027-06-01" }], ["NV"], T), "No NV license for this water");
  assert.equal(licenseWarning(nv, ["CA", "NV"], T), null); // either suffices
  assert.equal(licenseWarning([{ state: "CA", expires: "2026-01-01" }, ...nv], ["CA", "NV"], T), null); // best wins
  assert.equal(licenseWarning([], ["CA"], T), null);
});

test("parseLicenses is tolerant and keeps one per state", () => {
  assert.deepEqual(parseLicenses("nope"), []);
  assert.deepEqual(parseLicenses(null), []);
  assert.deepEqual(
    parseLicenses(
      JSON.stringify([
        { state: "CA", expires: "2026-01-01" },
        { state: "CA", expires: "2027-01-01" },
        { state: "OR", expires: "2027-01-01" },
        { state: "NV", expires: "bad" },
      ]),
    ),
    [{ state: "CA", expires: "2027-01-01" }],
  );
});

test("fishing_hours window from TimeSpec", () => {
  const d = new Date(2026, 10, 15, 12);
  const w = fishingHoursWindow(
    {
      allowed_from: { anchor: "sunrise", offset_minutes: -60, verbatim: "1 hour before sunrise" },
      allowed_to: { anchor: "sunset", offset_minutes: 120, verbatim: "2 hours after sunset" },
    },
    39.33,
    -120.18,
    d,
  );
  assert.ok(w);
  assert.ok(Math.abs(w.from.getTime() - (REF_SUNRISE - 3600000)) <= 120000);
  assert.ok(Math.abs(w.to.getTime() - (REF_SUNSET + 7200000)) <= 120000);
  const c = fishingHoursWindow({ allowed_from: "5:00 AM", allowed_to: "10:00 PM" }, 39, -120, d);
  assert.equal(c.from.getHours(), 5);
  assert.equal(c.to.getHours(), 22);
  assert.equal(fishingHoursWindow({ basis: "any_hour" }, 39, -120, d), null);
  assert.equal(fishingHoursWindow({ allowed_from: { anchor: "dawn" }, allowed_to: "5:00 PM" }, 39, -120, d), null);
});

test("pickHoursRule: water-wide wins; reach/species rules never shown as water-wide", async () => {
  const { pickHoursRule } = await import("../lib/fishing-hours.ts");
  const fh = (species = []) => ({ ruleType: "fishing_hours", polarity: "applies", species });
  const water = fh(), reach = fh();
  assert.equal(pickHoursRule([{ kind: "reach", rules: [reach] }, { kind: "water", rules: [water] }]).rule, water);
  assert.deepEqual(pickHoursRule([{ kind: "reach", rules: [reach] }, { kind: "water", rules: [] }]), { kind: "varies", rule: reach, why: "section" });
  const sp = fh(["trout"]);
  assert.equal(pickHoursRule([{ kind: "water", rules: [sp] }]).why, "species");
  assert.equal(pickHoursRule([{ kind: "water", rules: [{ ...water, polarity: "asserts_none" }] }]), null);
  assert.equal(pickHoursRule([]), null);
});
