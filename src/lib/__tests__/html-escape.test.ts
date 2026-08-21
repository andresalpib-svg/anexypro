import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../html-escape';

describe('escapeHtml', () => {
  it('escapa las cinco entidades peligrosas', () => {
    expect(escapeHtml(`<img src=x onerror="alert('hi')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;hi&#39;)&quot;&gt;&amp;'
    );
  });

  it('un nombre normal pasa sin cambios', () => {
    expect(escapeHtml('María José Rodríguez')).toBe('María José Rodríguez');
  });

  it('cierra una etiqueta abierta a propósito sin que rompa el resto del correo', () => {
    const malicioso = '</div><script>document.location="https://phishing.example"</script>';
    const escapado = escapeHtml(malicioso);
    expect(escapado).not.toContain('<script>');
    expect(escapado).not.toContain('</div>');
  });
});
