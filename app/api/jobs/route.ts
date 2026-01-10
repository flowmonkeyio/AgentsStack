import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getJobsCollection, getUsersCollection } from "@/lib/db";
import type { CreateJobInput } from "@/types/job";
import { ObjectId } from "mongodb";

export async function GET() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await getUsersCollection();
    const user = await users.findOne({ clerkId });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const jobs = await getJobsCollection();
    const userJobs = await jobs
      .find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    return NextResponse.json({ jobs: userJobs });
  } catch (error) {
    console.error("Failed to fetch jobs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const users = await getUsersCollection();
    const user = await users.findOne({ clerkId });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const jobs = await getJobsCollection();
    const jobInput: CreateJobInput = {
      userId: user._id,
      prompt,
      metadata: {},
    };

    const result = await jobs.insertOne({
      ...jobInput,
      status: "pending",
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const job = await jobs.findOne({ _id: result.insertedId });

    // TODO: Trigger orchestration graph

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    console.error("Failed to create job:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
