const SOURCES = new Set(['roomplan', 'arkit', 'arcore', 'reference_measurement', 'manufacturer']);
export function measurement(input) {
  if (!input || !Number.isFinite(input.value) || input.value <= 0) throw new TypeError('A positive measurement is required.');
  const factor = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 }[input.unit];
  if (!factor) throw new TypeError('Unsupported measurement unit.');
  if (!SOURCES.has(input.source) || !input.evidenceId) throw new TypeError('Measurement provenance is required.');
  if (input.uncertainty != null && (!Number.isFinite(input.uncertainty) || input.uncertainty < 0 || input.uncertainty >= input.value)) {
    throw new TypeError('Invalid measurement uncertainty.');
  }
  const verification = input.verification ?? 'unverified';
  if (!['unverified', 'confirmed', 'validated_scan'].includes(verification)) throw new TypeError('Invalid verification state.');
  if (verification !== 'unverified' && !input.verificationEvidenceId) throw new TypeError('Verification evidence is required.');
  const mm = input.value * factor;
  const uncertaintyMm = input.uncertainty == null ? null : input.uncertainty * factor;
  return Object.freeze({ mm, uncertaintyMm, source: input.source, evidenceId: input.evidenceId,
    verification, verificationEvidenceId: input.verificationEvidenceId ?? null });
}

export function interval(value) {
  if (!value || !Number.isFinite(value.mm) || value.mm <= 0 ||
      !Number.isFinite(value.uncertaintyMm) || value.uncertaintyMm < 0 ||
      value.uncertaintyMm >= value.mm || !value.evidenceId || !value.verificationEvidenceId ||
      !['confirmed', 'validated_scan'].includes(value.verification)) return null;
  return { min: value.mm - value.uncertaintyMm, max: value.mm + value.uncertaintyMm };
}

export function captureRoute(capability) {
  if (!['ios', 'android'].includes(capability?.platform)) throw new TypeError('A native platform is required.');
  if (capability.platform === 'ios' && capability.roomPlanSupported === true) return 'roomplan';
  if (capability.worldTrackingSupported !== true) return 'reference_measurement';
  if (capability.platform === 'ios') return 'arkit_guided';
  return capability.depthSupported === true ? 'arcore_depth' : 'arcore_guided';
}
