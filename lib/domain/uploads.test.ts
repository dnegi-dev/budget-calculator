import { describe, expect, it } from 'vitest';
import { classifyUpload, MAX_UPLOAD_BYTES } from './uploads';

describe('classifyUpload', () => {
  it('nimmt Bilder und PDF', () => {
    expect(classifyUpload('kasse.jpg', 'image/jpeg', 1000)).toEqual({
      ok: true,
      mime: 'image/jpeg',
    });
    expect(classifyUpload('rechnung.pdf', 'application/pdf', 1000)).toEqual({
      ok: true,
      mime: 'application/pdf',
    });
  });

  it('schließt den Typ aus der Endung, wenn der Browser keinen meldet', () => {
    expect(classifyUpload('beleg.HEIC', '', 1000)).toEqual({ ok: true, mime: 'image/heic' });
    expect(classifyUpload('beleg.pdf', '', 1000)).toEqual({ ok: true, mime: 'application/pdf' });
  });

  it('lehnt ohne Typ und ohne bekannte Endung ab', () => {
    expect(classifyUpload('beleg', '', 1000)).toEqual({ ok: false, reason: 'typ' });
    expect(classifyUpload('beleg.xyz', '', 1000)).toEqual({ ok: false, reason: 'typ' });
    // Ein Punkt am Anfang ist keine Endung.
    expect(classifyUpload('.pdf', '', 1000)).toEqual({ ok: false, reason: 'typ' });
  });

  it('lehnt andere Typen ab, auch wenn die Endung passt', () => {
    expect(classifyUpload('beleg.pdf', 'text/plain', 1000)).toEqual({ ok: false, reason: 'typ' });
    expect(classifyUpload('notizen.txt', 'text/plain', 1000)).toEqual({ ok: false, reason: 'typ' });
    expect(classifyUpload('makro.xlsm', 'application/vnd.ms-excel', 1000)).toEqual({
      ok: false,
      reason: 'typ',
    });
  });

  it('versteht einen Typ mit Parameter', () => {
    expect(classifyUpload('a.jpg', 'image/jpeg; charset=binary', 10)).toEqual({
      ok: true,
      mime: 'image/jpeg',
    });
  });

  it('lehnt leere und zu große Dateien ab', () => {
    expect(classifyUpload('leer.jpg', 'image/jpeg', 0)).toEqual({ ok: false, reason: 'leer' });
    expect(classifyUpload('gross.jpg', 'image/jpeg', MAX_UPLOAD_BYTES + 1)).toEqual({
      ok: false,
      reason: 'zu-gross',
    });
    expect(classifyUpload('grenze.jpg', 'image/jpeg', MAX_UPLOAD_BYTES)).toEqual({
      ok: true,
      mime: 'image/jpeg',
    });
  });

  it('prüft die Größe vor dem Typ — eine riesige Textdatei ist zuerst zu groß', () => {
    expect(classifyUpload('gross.txt', 'text/plain', MAX_UPLOAD_BYTES + 1)).toEqual({
      ok: false,
      reason: 'zu-gross',
    });
  });
});
