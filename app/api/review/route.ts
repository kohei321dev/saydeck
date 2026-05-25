import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { isDevAuthBypassEnabled, isOwnerAuthorized } from "@/lib/auth-policy";

export const runtime = "nodejs";
export const maxDuration = 30;

const reviewRequestSchema = z.object({
  cardId: z.string().min(1).max(80),
  level: z.string().min(1).max(20),
  promptJa: z.string().min(1).max(500),
  promptEn: z.string().min(1).max(500),
  modelAnswerEn: z.string().min(1).max(500),
  reviewPoints: z.string().max(500).optional(),
  userAnswer: z.string().trim().min(1).max(800),
});

const reviewResponseSchema = z.object({
  score: z.number().int().min(0).max(10),
  goodPoint: z.string().min(1),
  fix: z.string().min(1),
  naturalAnswer: z.string().min(1),
  phraseToRemember: z.string().min(1),
  nextPractice: z.string().min(1),
});

type XaiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "score",
    "goodPoint",
    "fix",
    "naturalAnswer",
    "phraseToRemember",
    "nextPractice",
  ],
  properties: {
    score: {
      type: "integer",
      description: "Score from 0 to 10.",
    },
    goodPoint: {
      type: "string",
      description: "A short Japanese explanation of what worked.",
    },
    fix: {
      type: "string",
      description: "A corrected English answer close to the learner's wording.",
    },
    naturalAnswer: {
      type: "string",
      description: "One natural conversational English answer.",
    },
    phraseToRemember: {
      type: "string",
      description: "One reusable English phrase.",
    },
    nextPractice: {
      type: "string",
      description: "One short Japanese next practice prompt.",
    },
  },
};

export async function POST(request: Request) {
  const session = isDevAuthBypassEnabled() ? null : await auth();

  if (!isOwnerAuthorized(session?.user?.githubLogin)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.XAI_API_KEY) {
    return NextResponse.json(
      { error: "XAI_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const parsedRequest = reviewRequestSchema.safeParse(await request.json());

  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const input = parsedRequest.data;
  const model = process.env.XAI_MODEL || "grok-4.3";

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      stream: false,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "scene_builder_review",
          strict: true,
          schema: jsonSchema,
        },
      },
      messages: [
        {
          role: "system",
          content:
            "You are an English coach for a Japanese learner around Eiken grade 3. Review short conversational English for skateboard and daily-life scenes. Keep the correction simple, practical, and easy to say aloud. Return only the requested JSON.",
        },
        {
          role: "user",
          content: [
            `Topic Japanese: ${input.promptJa}`,
            `Topic English: ${input.promptEn}`,
            `Target level: ${input.level}`,
            `Model answer: ${input.modelAnswerEn}`,
            `Review point: ${input.reviewPoints || "Use simple words and clear word order."}`,
            `Learner answer: ${input.userAnswer}`,
          ].join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Grok review failed with status ${response.status}` },
      { status: 502 },
    );
  }

  const data = (await response.json()) as XaiChatResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    return NextResponse.json(
      { error: "Grok review returned no content" },
      { status: 502 },
    );
  }

  const parsedResponse = reviewResponseSchema.safeParse(JSON.parse(content));

  if (!parsedResponse.success) {
    return NextResponse.json(
      { error: "Grok review returned an unexpected shape" },
      { status: 502 },
    );
  }

  return NextResponse.json(parsedResponse.data);
}
