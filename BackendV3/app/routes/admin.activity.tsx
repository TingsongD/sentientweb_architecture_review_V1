import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";
import { requireAdminSession } from "~/lib/auth.server";
import { withTenantDb } from "~/lib/tenant-db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { tenant } = await requireAdminSession(request);

  const [conversations, tools, bookings, crmSyncEvents] = await withTenantDb(
    tenant.id,
    (db) =>
      Promise.all([
        db.conversation.findMany({
          where: { tenantId: tenant.id },
          orderBy: { updatedAt: "desc" },
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: 2,
            },
            lead: true,
          },
          take: 10,
        }),
        db.toolExecution.findMany({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        db.demoBooking.findMany({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        db.crmSyncEvent.findMany({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]),
  );

  return { conversations, tools, bookings, crmSyncEvents };
}

export async function action({ request }: ActionFunctionArgs) {
  const { tenant } = await requireAdminSession(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent !== "review-booking") {
    return redirect("/admin/activity");
  }

  const bookingId = String(form.get("bookingId") ?? "");
  const salesDisposition = String(form.get("salesDisposition") ?? "pending");
  const salesDispositionReason = String(
    form.get("salesDispositionReason") ?? "",
  ).trim();

  await withTenantDb(tenant.id, (db) =>
    db.demoBooking.updateMany({
      where: {
        id: bookingId,
        tenantId: tenant.id,
      },
      data: {
        salesDisposition,
        salesDispositionReason: salesDispositionReason || null,
        reviewedAt: salesDisposition === "pending" ? null : new Date(),
      },
    }),
  );

  return redirect("/admin/activity");
}

export default function ActivityPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="grid two">
      <section className="panel stack">
        <h2 style={{ margin: 0 }}>Conversation feed</h2>
        {data.conversations.length === 0 ? (
          <p className="muted">No conversations yet.</p>
        ) : (
          data.conversations.map((conversation) => (
            <article
              key={conversation.id}
              className="panel stack"
              style={{ padding: 16 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <strong>
                  {conversation.visitorEmail ?? conversation.sessionId}
                </strong>
                <span className="status">{conversation.status}</span>
              </div>
              <div className="muted">
                Updated {conversation.updatedAt.toISOString()}
              </div>
              {conversation.messages.map((message) => (
                <div key={message.id}>
                  <strong>{message.role}</strong>
                  <div className="muted">{message.content}</div>
                </div>
              ))}
            </article>
          ))
        )}
      </section>

      <div className="stack">
        <section className="panel stack">
          <h2 style={{ margin: 0 }}>Tool execution log</h2>
          {data.tools.length === 0 ? (
            <p className="muted">No tool calls yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Status</th>
                  <th>Latency</th>
                </tr>
              </thead>
              <tbody>
                {data.tools.map((tool) => (
                  <tr key={tool.id}>
                    <td>{tool.toolName}</td>
                    <td>{tool.status}</td>
                    <td>{tool.latencyMs ?? 0}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel stack">
          <h2 style={{ margin: 0 }}>Booking outcomes</h2>
          {data.bookings.length === 0 ? (
            <p className="muted">No booking attempts yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Sales review</th>
                </tr>
              </thead>
              <tbody>
                {data.bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>{booking.createdAt.toISOString()}</td>
                    <td>{booking.status}</td>
                    <td>
                      <Form method="post" style={{ display: "grid", gap: 8 }}>
                        <input
                          type="hidden"
                          name="intent"
                          value="review-booking"
                        />
                        <input
                          type="hidden"
                          name="bookingId"
                          value={booking.id}
                        />
                        <select
                          name="salesDisposition"
                          defaultValue={booking.salesDisposition}
                        >
                          <option value="pending">pending</option>
                          <option value="accepted">accepted</option>
                          <option value="rejected">rejected</option>
                        </select>
                        <input
                          name="salesDispositionReason"
                          defaultValue={booking.salesDispositionReason ?? ""}
                          placeholder="Reason or notes"
                        />
                        <button type="submit" className="button-secondary">
                          Save
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel stack">
          <h2 style={{ margin: 0 }}>CRM sync audit</h2>
          {data.crmSyncEvents.length === 0 ? (
            <p className="muted">No CRM sync attempts yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {data.crmSyncEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{event.createdAt.toISOString()}</td>
                    <td>{event.status}</td>
                    <td>{event.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
