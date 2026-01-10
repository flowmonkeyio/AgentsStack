import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSSEStream, createSSEHeaders } from "@/lib/api";
import { getJobsCollection, getUsersCollection } from "@/lib/db";
import { ObjectId } from "mongodb";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { jobId } = await params;

  if (!ObjectId.isValid(jobId)) {
    return new Response("Invalid job ID", { status: 400 });
  }

  // Verify user owns job
  const users = await getUsersCollection();
  const user = await users.findOne({ clerkId });

  if (!user) {
    return new Response("User not found", { status: 404 });
  }

  const jobs = await getJobsCollection();
  const job = await jobs.findOne({
    _id: new ObjectId(jobId),
    userId: user._id,
  });

  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  // Create SSE stream
  const { readable, send, close } = createSSEStream();

  // Send initial status
  send({
    type: "status",
    data: { jobId, status: job.status },
    timestamp: new Date().toISOString(),
  });

  // TODO: Subscribe to job updates and stream them

  // For now, close after sending initial status
  // In production, this would keep connection open for real-time updates
  setTimeout(() => {
    send({
      type: "complete",
      data: { message: "Stream ended" },
      timestamp: new Date().toISOString(),
    });
    close();
  }, 1000);

  return new Response(readable, {
    headers: createSSEHeaders(),
  });
}
