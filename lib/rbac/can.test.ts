import { describe, expect, it } from 'vitest';
import { assertCan, can, PermissionDeniedError } from './can';
import type { Principal } from './can';

const admin: Principal = { userId: 'u1', householdId: 'h1', role: 'admin' };
const member: Principal = { userId: 'u2', householdId: 'h1', role: 'member' };
const viewer: Principal = { userId: 'u3', householdId: 'h1', role: 'viewer' };

describe('can', () => {
  it('gibt dem Admin alles', () => {
    expect(can(admin, 'pot.delete')).toBe(true);
    expect(can(admin, 'member.manage')).toBe(true);
    expect(can(admin, 'data.import')).toBe(true);
  });

  it('lässt Nutzer buchen, aber keine Töpfe anlegen', () => {
    expect(can(member, 'entry.create')).toBe(true);
    expect(can(member, 'receipt.upload')).toBe(true);
    expect(can(member, 'pot.create')).toBe(false);
    expect(can(member, 'settings.manage')).toBe(false);
  });

  it('lässt Leser nur exportieren', () => {
    expect(can(viewer, 'data.export')).toBe(true);
    expect(can(viewer, 'entry.create')).toBe(false);
  });

  it('erlaubt dem Nutzer fremde Buchungen nicht', () => {
    expect(can(member, 'entry.edit.any', { ownerId: 'u9' })).toBe(false);
    expect(can(member, 'entry.edit.any', { ownerId: 'u2' })).toBe(true);
  });

  it('leitet eigene aus beliebigen Rechten ab', () => {
    expect(can(admin, 'entry.edit.own', { ownerId: 'u9' })).toBe(true);
  });

  it('verweigert über Haushaltsgrenzen hinweg', () => {
    expect(can(admin, 'pot.delete', { householdId: 'fremd' })).toBe(false);
  });

  it('verweigert ohne Session', () => {
    expect(can(null, 'data.export')).toBe(false);
  });
});

describe('assertCan', () => {
  it('wirft mit Rolle und Recht im Fehler', () => {
    expect(() => assertCan(viewer, 'entry.create')).toThrow(PermissionDeniedError);
    try {
      assertCan(viewer, 'entry.create');
    } catch (error) {
      expect((error as PermissionDeniedError).permission).toBe('entry.create');
      expect((error as PermissionDeniedError).role).toBe('viewer');
    }
  });

  it('lässt Erlaubtes durch', () => {
    expect(() => assertCan(admin, 'entry.create')).not.toThrow();
  });
});
