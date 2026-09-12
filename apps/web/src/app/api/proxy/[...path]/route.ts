import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api/server";
import { ApiError } from "@/lib/api/errors";

async function forward(request: Request, path: string[], method: string) {
  const url = new URL(request.url);
  const target = `/${path.join("/")}${url.search}`;
  const body =
    method === "GET" || method === "DELETE" ? undefined : await request.text();

  try {
    const data = await apiFetch<unknown>(target, { method, body });
    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { type: error.type, title: error.message, status: error.status },
        { status: error.status },
      );
    }
    throw error;
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path, "GET");
}
export async function POST(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path, "POST");
}
export async function PATCH(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path, "PATCH");
}
export async function PUT(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path, "PUT");
}
export async function DELETE(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path, "DELETE");
}
