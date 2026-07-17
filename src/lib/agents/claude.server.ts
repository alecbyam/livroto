// SERVER ONLY — ne jamais importer depuis un composant client.
// La clé ANTHROPIC_API_KEY reste côté serveur (variable Railway) ; elle ne doit
// JAMAIS atteindre le navigateur. Ce module est chargé dynamiquement dans les
// handlers de serverFn (voir agents.functions.ts).
//
// Note version : le helper `zodOutputFormat` du SDK est typé contre zod 4, or le
// projet est en zod 3. On envoie donc à l'API un JSON Schema BRUT (output_config)
// — indépendant de la version de zod — et on re-valide la réponse avec zod côté
// serveur. Les deux représentations (JSON Schema pour l'API, zod pour la validation)
// décrivent le MÊME format et doivent rester alignées avec prompts.ts.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AGENT_PROMPTS, type AgentType } from "./prompts";

// Haiku 4.5 : adapté au budget (~0,003 $/appel) et suffisant pour de la rédaction
// de brouillons + classification. Pour plus de finesse : "claude-sonnet-5" (~0,01 $)
// ou "claude-opus-4-8" (~0,018 $) — un seul mot à changer.
const MODEL = "claude-haiku-4-5";
const TIMEOUT_MS = 30_000;
const MAX_TOKENS = 1500;

let _client: Anthropic | null = null;
function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY non configuré. Ajoute la variable au service Railway livroto-frontend.",
    );
  }
  if (!_client) _client = new Anthropic({ apiKey, timeout: TIMEOUT_MS });
  return _client;
}

// --- Schémas zod : typage TS (z.infer) + validation runtime de la réponse ---
export const AGENT_SCHEMAS = {
  orchestrateur: z.object({
    taches: z.array(
      z.object({
        agent: z.enum(["commercial", "contenu", "analytics", "support", "humain"]),
        priorite: z.enum(["haute", "normale", "basse"]),
        instruction: z.string(),
        contexte: z.object({ client: z.string(), produit: z.string(), details: z.string() }),
      }),
    ),
    raisonnement: z.string(),
  }),
  commercial: z.object({
    type_message: z.enum(["offre", "relance", "remerciement", "reactivation"]),
    canal: z.enum(["whatsapp", "sms", "email"]),
    variantes: z.array(z.object({ ton: z.enum(["sobre", "enthousiaste"]), texte: z.string() })),
    notes_validation: z.string(),
  }),
  contenu: z.object({
    canal: z.enum(["whatsapp", "facebook", "tiktok", "fiche_produit"]),
    contenu: z.string(),
    hashtags: z.array(z.string()),
    suggestion_visuel: z.string(),
    notes_validation: z.string(),
  }),
  analytics: z.object({
    periode_analysee: z.string(),
    indicateurs_cles: z.array(
      z.object({ nom: z.string(), valeur: z.string(), evolution: z.string() }),
    ),
    observations: z.array(z.string()),
    interpretations: z.array(z.string()),
    recommandations: z.array(
      z.object({
        action: z.string(),
        justification: z.string(),
        effort: z.enum(["faible", "moyen", "eleve"]),
      }),
    ),
    anomalies_donnees: z.array(z.string()),
    notes_validation: z.string(),
  }),
  support: z.object({
    categorie: z.enum(["question", "reclamation", "suivi_commande", "autre"]),
    niveau_urgence: z.enum(["normal", "urgent", "humain_urgent"]),
    brouillon_reponse: z.string(),
    options_geste_commercial: z.string().nullable(),
    notes_validation: z.string(),
  }),
} satisfies Record<AgentType, z.ZodType>;

export type AgentOutputs = { [K in AgentType]: z.infer<(typeof AGENT_SCHEMAS)[K]> };

// --- JSON Schemas bruts pour l'API (structured outputs). additionalProperties:false
//     + required sur chaque objet, comme l'exige la fonctionnalité. ---
const str = { type: "string" } as const;
const strArr = { type: "array", items: { type: "string" } } as const;
function obj(props: Record<string, unknown>) {
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(props),
    properties: props,
  } as const;
}

const AGENT_JSON_SCHEMAS: Record<AgentType, Record<string, unknown>> = {
  orchestrateur: obj({
    taches: {
      type: "array",
      items: obj({
        agent: { type: "string", enum: ["commercial", "contenu", "analytics", "support", "humain"] },
        priorite: { type: "string", enum: ["haute", "normale", "basse"] },
        instruction: str,
        contexte: obj({ client: str, produit: str, details: str }),
      }),
    },
    raisonnement: str,
  }),
  commercial: obj({
    type_message: { type: "string", enum: ["offre", "relance", "remerciement", "reactivation"] },
    canal: { type: "string", enum: ["whatsapp", "sms", "email"] },
    variantes: {
      type: "array",
      items: obj({ ton: { type: "string", enum: ["sobre", "enthousiaste"] }, texte: str }),
    },
    notes_validation: str,
  }),
  contenu: obj({
    canal: { type: "string", enum: ["whatsapp", "facebook", "tiktok", "fiche_produit"] },
    contenu: str,
    hashtags: strArr,
    suggestion_visuel: str,
    notes_validation: str,
  }),
  analytics: obj({
    periode_analysee: str,
    indicateurs_cles: {
      type: "array",
      items: obj({ nom: str, valeur: str, evolution: str }),
    },
    observations: strArr,
    interpretations: strArr,
    recommandations: {
      type: "array",
      items: obj({
        action: str,
        justification: str,
        effort: { type: "string", enum: ["faible", "moyen", "eleve"] },
      }),
    },
    anomalies_donnees: strArr,
    notes_validation: str,
  }),
  support: obj({
    categorie: { type: "string", enum: ["question", "reclamation", "suivi_commande", "autre"] },
    niveau_urgence: { type: "string", enum: ["normal", "urgent", "humain_urgent"] },
    brouillon_reponse: str,
    options_geste_commercial: { type: ["string", "null"] },
    notes_validation: str,
  }),
};

/**
 * Exécute un agent et renvoie sa sortie JSON validée. Le format est garanti par
 * l'API (structured outputs) puis re-validé par zod côté serveur.
 */
export async function runAgent<T extends AgentType>(
  agent: T,
  message: string,
): Promise<AgentOutputs[T]> {
  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: AGENT_PROMPTS[agent],
    messages: [{ role: "user", content: message }],
    output_config: { format: { type: "json_schema", schema: AGENT_JSON_SCHEMAS[agent] } },
  });

  if (resp.stop_reason === "refusal") {
    throw new Error("La demande a été refusée par le filtre de sécurité de l'IA.");
  }
  const textBlock = resp.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "";
  if (!raw) throw new Error("Réponse vide de l'IA. Réessaie.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("La réponse de l'IA n'était pas un JSON valide. Réessaie.");
  }
  // Re-validation stricte du format (défense en profondeur au-delà du contrat API).
  return AGENT_SCHEMAS[agent].parse(parsed) as AgentOutputs[T];
}
