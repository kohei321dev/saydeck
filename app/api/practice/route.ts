import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import {
  getOwnerGitHubUsername,
  isDevAuthBypassEnabled,
  isOwnerAuthorized,
} from "@/lib/auth-policy";
import { isDatabaseConfigured } from "@/lib/db";
import { getPracticeRecord, upsertPracticeRecord } from "@/lib/practice-records";

export const runtime = "nodejs";

const modeSchema = z.enum(["topic", "diary"]);
const levelSchema = z.enum(["L1", "L2", "L3", "L4"]);
const statusSchema = z.enum(["new", "learned", "review"]);

const checksSchema = z.object({
  meaning: z.boolean(),
  subjectVerb: z.boolean(),
  tense: z.boolean(),
  stolenPhrase: z.boolean(),
  speakable: z.boolean(),
});

const reviewSchema = z.object({
  score: z.number().int().min(0).max(10),
  goodPoint: z.string().min(1).max(1000),
  fix: z.string().min(1).max(1000),
  naturalAnswer: z.string().min(1).max(1000),
  phraseToRemember: z.string().min(1).max(300),
  nextPractice: z.string().min(1).max(1000),
});

const getPracticeSchema = z.object({
  mode: modeSchema,
  itemId: z.string().min(1).max(120),
  level: levelSchema,
});

const putPracticeSchema = getPracticeSchema.extend({
  answer: z.string().max(2000),
  checks: checksSchema,
  status: statusSchema,
  review: reviewSchema.optional(),
});

async function getOwnerLogin() {
  const session = isDevAuthBypassEnabled() ? null : await auth();

  if (!isOwnerAuthorized(session?.user?.githubLogin)) {
    return null;
  }

  return session?.user?.githubLogin || getOwnerGitHubUsername();
}

function databaseUnavailable() {
  return NextResponse.json(
    { error: "DATABASE_URL is not configured" },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const ownerLogin = await getOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return databaseUnavailable();
  }

  const url = new URL(request.url);
  const parsed = getPracticeSchema.safeParse({
    mode: url.searchParams.get("mode"),
    itemId: url.searchParams.get("itemId"),
    level: url.searchParams.get("level"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const record = await getPracticeRecord({
    ownerLogin,
    ...parsed.data,
  });

  return NextResponse.json({ record });
}

export async function PUT(request: Request) {
  const ownerLogin = await getOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return databaseUnavailable();
  }

  const parsed = putPracticeSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const record = await upsertPracticeRecord({
    ownerLogin,
    ...parsed.data,
  });

  return NextResponse.json({ record });
}

