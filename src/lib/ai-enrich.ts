import "server-only";

export interface AiEnrichInput {
  name: string;
  author?: string;
  publisher?: string;
  description?: string;
  category?: string;
  language?: string;
}

export interface AiEnrichResult {
  suggested_category: string;
  suggested_summary: string;
}

/** OpenAI-compatible chat completions (OpenAI, Azure OpenAI, gateways). */
export async function enrichCatalogRow(
  input: AiEnrichInput,
): Promise<AiEnrichResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const base =
    (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const userPayload = {
    task: "Suggest a single bookshelf category label and a short plain-text summary for catalog curation.",
    book: {
      title: input.name,
      author: input.author ?? "",
      publisher: input.publisher ?? "",
      existing_category: input.category ?? "",
      existing_description: input.description ?? "",
      language: input.language ?? "",
    },
  };

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            'You help bookstore operators normalize catalog rows. Reply with JSON only, no markdown, in this exact shape: {"suggested_category":"string","suggested_summary":"string"}. suggested_category should be concise (e.g. Fiction, Children, Self-Help). suggested_summary should be 1-3 sentences, suitable for a product card; if the source description is empty, infer cautiously from the title and author only.',
        },
        {
          role: "user",
          content: JSON.stringify(userPayload),
        },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI provider HTTP ${res.status}: ${t.slice(0, 400)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- provider JSON
  const body: any = await res.json();
  const text: string =
    body?.choices?.[0]?.message?.content?.trim() ?? "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripMarkdownFence(text));
  } catch {
    throw new Error("AI returned non-JSON output");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("suggested_category" in parsed) ||
    !("suggested_summary" in parsed)
  ) {
    throw new Error("AI JSON missing suggested_category or suggested_summary");
  }

  const sc = (parsed as { suggested_category: unknown }).suggested_category;
  const ss = (parsed as { suggested_summary: unknown }).suggested_summary;

  if (typeof sc !== "string" || typeof ss !== "string") {
    throw new Error("AI JSON fields must be strings");
  }

  return {
    suggested_category: sc.trim(),
    suggested_summary: ss.trim(),
  };
}

function stripMarkdownFence(s: string): string {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  return (m ? m[1] : s).trim();
}
