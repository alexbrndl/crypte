// L'erreur que le CLI montre à l'utilisateur, sans trace de pile.
// La cause d'origine est conservée : elle ne s'affiche pas, mais reste
// atteignable pour qui cherche d'où vient une panne trois niveaux plus bas.

export class ConfigError extends Error {}
