import assert from 'node:assert/strict';
import test from 'node:test';
import { assertQ12MobileEnvironment } from './assert-q12-mobile-environment.mjs';

const isolated = {
  APOIS_MOBILE_BUILD_TIER: 'homologation',
  VITE_SUPABASE_URL: 'https://apois-mobile-qa-sem-backend.invalid',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'nonsecret-qa-placeholder',
  VITE_TSS_SERVER_FN_BASE: 'https://apois-mobile-qa-api.invalid/_serverFn/',
  APOIS_Q12_RESOLVED_SERVER_FN_BASE: 'https://apois-mobile-qa-api.invalid/_serverFn/',
};
test('mobile Q12: independent/no-backend homologation allowed, not functional', () => {
  assert.doesNotThrow(() => assertQ12MobileEnvironment(isolated));
});
test('mobile Q12: original production packaging remains unchanged', () => {
  assert.doesNotThrow(() => assertQ12MobileEnvironment({ ...isolated, APOIS_MOBILE_BUILD_TIER: '' }));
  assert.doesNotThrow(() => assertQ12MobileEnvironment({ ...isolated, APOIS_MOBILE_BUILD_TIER: 'production' }));
});
test('mobile Q12: official Corridas production DB forbidden', () => {
  assert.throws(() => assertQ12MobileEnvironment({ ...isolated, VITE_SUPABASE_URL: 'https://tbbzkrfupmqdywnzgnms.supabase.co' }));
});
test('mobile Q12: legacy MOVVI project forbidden', () => {
  assert.throws(() => assertQ12MobileEnvironment({ ...isolated, VITE_SUPABASE_PROJECT_ID: 'vqtucstyduxrqjgyigfk' }));
});
test('mobile Q12: preexisting remote server functions endpoint forbidden', () => {
  assert.throws(() => assertQ12MobileEnvironment({ ...isolated, APOIS_Q12_RESOLVED_SERVER_FN_BASE: 'https://movvi-go-connect.lovable.app/_serverFn/' }));
});
test('mobile Q12: explicit API is compulsory in homologation', () => {
  assert.throws(() => assertQ12MobileEnvironment({ ...isolated, VITE_TSS_SERVER_FN_BASE: '' }));
});
test('mobile Q12: TLS is compulsory', () => {
  assert.throws(() => assertQ12MobileEnvironment({ ...isolated, VITE_SUPABASE_URL: 'http://qa.example.invalid' }));
});
test('mobile Q12: privileged key is forbidden', () => {
  assert.throws(() => assertQ12MobileEnvironment({ ...isolated, SUPABASE_SERVICE_ROLE_KEY: 'fake-test-secret' }));
});
test('mobile Q12: unrecognized build tiers fail closed', () => {
  assert.throws(() => assertQ12MobileEnvironment({ ...isolated, APOIS_MOBILE_BUILD_TIER: 'staging-x' }));
});
