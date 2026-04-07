import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import prisma from "~/db.server";
import { requireAdminSession } from "~/lib/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { tenant } = await requireAdminSession(request);
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);

  const [conversationCount, qualifiedLeadCount, bookingCount, unansweredCount, acceptedCount, reviewedCount, knowledgeSources, latestBookings] =
    await Promise.all([
      prisma.conversation.count({ where: { tenantId: tenant.id } }),
      prisma.lead.count({ where: { tenantId: tenant.id, bookingEligible: true } }),
      prisma.demoBooking.count({ where: { tenantId: tenant.id, status: "booked" } }),
      prisma.toolExecution.count({
        where: {
          tenantId: tenant.id,
          toolName: "route_to_human",
          createdAt: { gte: since }
        }
      }),
      prisma.demoBooking.count({
        where: { tenantId: tenant.id, salesDisposition: "accepted" }
      }),
      prisma.demoBooking.count({
        where: {
          tenantId: tenant.id,
          salesDisposition: { in: ["accepted", "rejected"] }
        }
      }),
      prisma.knowledgeSource.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
        take: 5
      }),
      prisma.demoBooking.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
        take: 5
      })
    ]);

  return {
    tenant,
    summary: {
      conversationCount,
      qualifiedLeadCount,
      bookingCount,
      unansweredCount,
      acceptanceRate: reviewedCount > 0 ? Math.round((acceptedCount / reviewedCount) * 100) : null,
      reviewedCount
    },
    knowledgeSources,
    latestBookings
  };
}

export default function AdminDashboardPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="stack">
      <section className="hero-card stack">
        <span className="pill">Phase 1 operator dashboard</span>
        <h1 style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 3.4rem)" }}>
          Convert inbound traffic into booked demos.
        </h1>
        <p className="muted" style={{ maxWidth: 720 }}>
          This dashboard tracks the live Phase 1 loop: knowledge retrieval, qualification, bookings,
          and webhook delivery for the current tenant.
        </p>
        <div className="form-actions">
          <Link className="button" to="/admin/settings">Configure tenant</Link>
          <Link className="button-secondary" to="/admin/activity">Review activity feed</Link>
        </div>
      </section>

      <section className="grid">
        <div className="metric">
          <div className="muted">Conversations</div>
          <strong>{data.summary.conversationCount}</strong>
        </div>
        <div className="metric">
          <div className="muted">Qualified leads</div>
          <strong>{data.summary.qualifiedLeadCount}</strong>
        </div>
        <div className="metric">
          <div className="muted">Booked demos</div>
          <strong>{data.summary.bookingCount}</strong>
        </div>
        <div className="metric">
          <div className="muted">SQL acceptance</div>
          <strong>
            {data.summary.acceptanceRate === null ? "Pending" : `${data.summary.acceptanceRate}%`}
          </strong>
          <div className="muted">
            {data.summary.reviewedCount} reviewed
          </div>
        </div>
      </section>

      <section className="grid two">
        <article className="panel stack">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Knowledge sources</h2>
            <Link to="/admin/settings" className="button-secondary">Manage</Link>
          </div>
          {data.knowledgeSources.length === 0 ? (
            <p className="muted">No crawls yet. Start by adding the docs or marketing site URL in settings.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Chunks</th>
                </tr>
              </thead>
              <tbody>
                {data.knowledgeSources.map((source) => (
                  <tr key={source.id}>
                    <td>{source.title ?? source.rootUrl ?? source.uploadName ?? "Source"}</td>
                    <td><span className="status">{source.status}</span></td>
                    <td>{source.chunkCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <article className="panel stack">
          <h2 style={{ margin: 0 }}>Recent bookings</h2>
          {data.latestBookings.length === 0 ? (
            <p className="muted">No booked demos yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Status</th>
                  <th>Sales review</th>
                </tr>
              </thead>
              <tbody>
                {data.latestBookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>{booking.startTime ? booking.startTime.toISOString() : booking.createdAt.toISOString()}</td>
                    <td><span className="status">{booking.status}</span></td>
                    <td>{booking.salesDisposition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </section>
    </div>
  );
}
