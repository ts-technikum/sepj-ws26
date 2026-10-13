// Festes Vokabular für alle Zustände und Stile.
//
// Zweck: Das Sprachmodell soll sich keine Namen ausdenken können, die der
// Renderer nicht kennt. Diese Listen gehen wörtlich in den Prompt und
// werden bei jedem Aufruf geprüft. Erweitern ist jederzeit möglich —
// jeder neue Wert braucht dann eine Darstellung im Renderer.

/** Zustände, die ein Knoten annehmen kann. */
export const NODE_STATES = Object.freeze([
  'default',    // unberührt
  'active',     // wird gerade bearbeitet
  'frontier',   // bekannt, aber noch nicht bearbeitet (Warteschlange, Stapel)
  'visited',    // fertig bearbeitet
]);

/** Zustände, die eine Kante annehmen kann. */
export const EDGE_STATES = Object.freeze([
  'default',    // unberührt
  'active',     // wird gerade betrachtet
  'tree',       // gehört zum Durchlaufbaum
  'rejected',   // betrachtet und verworfen, z.B. führt zu bereits Besuchtem
]);

/** Stile, die eine Hervorhebung verwenden kann. */
export const HIGHLIGHT_STYLES = Object.freeze([
  'compare',    // Elemente werden verglichen
  'active',     // aktuelles Element
  'swap',       // gerade getauscht
  'sorted',     // endgültig an seinem Platz
  'range',      // aktueller Suchbereich
  'excluded',   // aus der Suche ausgeschlossen
]);

/**
 * Wirft, wenn `value` nicht in `allowed` enthalten ist.
 *
 * Die Meldung listet die erlaubten Werte mit Absicht auf: Sie geht in den
 * nächsten Prompt zurück, wenn das Modell einen unbekannten Wert verwendet
 * hat, und muss daher sagen, was stattdessen zu nehmen ist.
 */
export function assertIn(value, allowed, what) {
  if (!allowed.includes(value)) {
    throw new Error(
      `Unbekannter Wert "${value}" für ${what}. Erlaubt: ${allowed.join(', ')}`);
  }
}
