/**
 * Agent Approve Endpoint
 *
 * DEV ONLY - Approves a pending agent, setting status to "active".
 *
 * @example
 *   POST /api/agents/{id}/approve
 */

import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAgentsCollection } from '@/lib/db';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Agent approval via API is not available in production' },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const agents = await getAgentsCollection();

    // Try to find by ObjectId or agent_id
    const query: { _id?: ObjectId; agent_id?: string } = {};
    if (ObjectId.isValid(id)) {
      query._id = new ObjectId(id);
    } else {
      query.agent_id = id;
    }

    const result = await agents.updateOne(query, {
      $set: {
        status: 'active',
        updatedAt: new Date(),
      },
    });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Fetch updated agent
    const agent = await agents.findOne(query);

    return NextResponse.json({
      success: true,
      message: 'Agent approved successfully',
      agent,
    });
  } catch (error) {
    console.error('Approve error:', error);
    return NextResponse.json(
      { error: 'Failed to approve agent', details: String(error) },
      { status: 500 }
    );
  }
}
