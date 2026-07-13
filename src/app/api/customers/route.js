import { NextResponse } from "next/server";
import { Op, fn, col } from "sequelize";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import { serializeCustomer } from "@/server/customers/serializeCustomer";

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 25), 100);
  const offset = (page - 1) * pageSize;
  const q = String(searchParams.get("q") || "").trim();

  const where = {};
  if (q) {
    const phoneDigits = q.replace(/\D/g, "");
    const or = [{ phone: { [Op.like]: `%${q}%` } }];
    if (phoneDigits) {
      or.push({ phone: { [Op.like]: `%${phoneDigits}%` } });
    }
    const normalized = normalizeToE164(q);
    if (normalized) or.push({ phone: normalized });
    where[Op.or] = or;
  }

  const lastLeadCreatedAt = `(
    SELECT MAX(\`createdAt\`) FROM \`Leads\` AS \`l\`
    WHERE \`l\`.\`customerId\` = \`Customer\`.\`id\`
  )`;

  const { rows, count } = await db.Customer.findAndCountAll({
    where,
    order: [
      [db.sequelize.literal(`${lastLeadCreatedAt} IS NULL`), "ASC"],
      [db.sequelize.literal(lastLeadCreatedAt), "DESC"],
      ["id", "DESC"],
    ],
    offset,
    limit: pageSize,
  });

  const customerIds = rows.map((r) => r.id);
  const leadStats =
    customerIds.length > 0
      ? await db.Lead.findAll({
          attributes: [
            "customerId",
            [fn("COUNT", col("id")), "leadCount"],
            [fn("MIN", col("createdAt")), "firstLeadAt"],
            [fn("MAX", col("createdAt")), "lastLeadAt"],
            [fn("MAX", col("id")), "latestLeadId"],
          ],
          where: { customerId: { [Op.in]: customerIds } },
          group: ["customerId"],
          raw: true,
        })
      : [];

  const paymentCounts =
    customerIds.length > 0
      ? await db.CustomerPaymentMethod.findAll({
          attributes: ["customerId", [fn("COUNT", col("id")), "paymentMethodCount"]],
          where: { customerId: { [Op.in]: customerIds } },
          group: ["customerId"],
          raw: true,
        })
      : [];

  const statsByCustomer = new Map(
    leadStats.map((s) => [
      Number(s.customerId),
      {
        leadCount: Number(s.leadCount) || 0,
        firstLeadAt: s.firstLeadAt,
        lastLeadAt: s.lastLeadAt,
        latestLeadId: Number(s.latestLeadId) || null,
      },
    ]),
  );
  const paymentsByCustomer = new Map(
    paymentCounts.map((s) => [Number(s.customerId), Number(s.paymentMethodCount) || 0]),
  );

  const latestLeadIds = [...statsByCustomer.values()]
    .map((s) => s.latestLeadId)
    .filter((id) => Number.isInteger(id) && id > 0);
  const latestLeads =
    latestLeadIds.length > 0
      ? await db.Lead.findAll({
          where: { id: { [Op.in]: latestLeadIds } },
          attributes: ["id", "fullName", "customerId"],
        })
      : [];
  const latestByCustomer = new Map(
    latestLeads.map((l) => [Number(l.customerId), l]),
  );

  return NextResponse.json({
    customers: rows.map((c) => {
      const stats = statsByCustomer.get(c.id) || {
        leadCount: 0,
        firstLeadAt: null,
        lastLeadAt: null,
      };
      return serializeCustomer(c, {
        ...stats,
        latestLead: latestByCustomer.get(c.id) || null,
        paymentMethodCount: paymentsByCustomer.get(c.id) || 0,
      });
    }),
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
      hasNext: offset + rows.length < count,
      hasPrev: page > 1,
    },
  });
}
