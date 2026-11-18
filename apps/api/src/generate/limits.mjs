// Gemeinsame Grenzen für Anfrage, Eingabeobjekt und generierten Code.
// Werden im Prompt genannt und in der Prüfung durchgesetzt.
export const LIMITS = Object.freeze({
  maxPromptChars: 2000,   // Wunsch der Lehrperson
  maxDataChars: 5000,     // optionale Daten als Freitext
  maxValues: 50,          // Array- und Suchwerte
  maxNodes: 30,
  maxEdges: 100,
  maxParams: 10,
  maxStringValueChars: 20,
  maxCodeChars: 20000,
  targetSteps: 300,       // Richtwert im Prompt, kein hartes Limit
  maxAttempts: 2,         // erster Versuch plus eine Korrekturrunde
});
