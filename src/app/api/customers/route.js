import { NextResponse } from "next/server";
import { Op, fn, col } from "sequelize";
import db from "@/server/db";
import { requireAdmin } from "@/server/auth/requireAdmin";
import { normalizeToE164 } from "@/server/calls/normalizePhone";
import {
  PAYMENT_METHOD_TYPES,
  serializeCustomer,
} from "@/server/customers/serializeCustomer";
import { LEAD_PHASE_VALUES } from "@/lib/leadWorkflow";
import { validateListSearchQuery } from "@/lib/listSearchValidation";
import { getStateByCode } from "@/lib/usStates";

const SEARCH_BY_VALUES = new Set(["all", "phone", "name", "last4"]);
const PAYMENT_FILTER_VALUES = new Set(PAYMENT_METHOD_TYPES);

const SALE_FILTER_MAP = {
  active: "active",
  closed: "closed",
  cancelled: "cancelled",
};

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function pushAnd(where, clause) {
  if (!where[Op.and]) where[Op.and] = [];
  where[Op.and].push(clause);
}

function leadDateColumn(salePhase) {
  return salePhase === "closed" || salePhase === "cancelled" ? "updatedAt" : "createdAt";
}

function leadDateBetweenSql(salePhase, fromDate, toDate) {
  const field = leadDateColumn(salePhase);
  const after = `${fromDate} 00:00:00`;
  const before = `${toDate} 23:59:59`;
  return `\`l\`.\`${field}\` BETWEEN ${db.sequelize.escape(after)} AND ${db.sequelize.escape(before)}`;
}

/**
 * Build one EXISTS so sale status, payment, and date range apply to the same lead
 * when those filters are combined.
 */
function buildLeadFilterLiteral({ salePhase, paymentType, fromDate, toDate }) {
  const hasSale = Boolean(salePhase && LEAD_PHASE_VALUES.has(salePhase));
  const hasPay = Boolean(paymentType && PAYMENT_FILTER_VALUES.has(paymentType));
  const hasDate = Boolean(fromDate && toDate);
  if (!hasSale && !hasPay && !hasDate) return null;

  // Payment alone (no sale/date): also include customers with that saved PM type.
  if (hasPay && !hasSale && !hasDate) {
    const payEsc = db.sequelize.escape(paymentType);
    return db.sequelize.literal(`(
      EXISTS (
        SELECT 1 FROM \`Leads\` AS \`l\`
        LEFT JOIN \`CustomerPaymentMethods\` AS \`pm\`
          ON \`pm\`.\`id\` = \`l\`.\`customerPaymentMethodId\`
        WHERE \`l\`.\`customerId\` = \`Customer\`.\`id\`
          AND (
            \`l\`.\`leadPaymentMethod\` = ${payEsc}
            OR \`pm\`.\`type\` = ${payEsc}
          )
      )
      OR EXISTS (
        SELECT 1 FROM \`CustomerPaymentMethods\` AS \`cpm\`
        WHERE \`cpm\`.\`customerId\` = \`Customer\`.\`id\`
          AND \`cpm\`.\`type\` = ${payEsc}
      )
    )`);
  }

  const clauses = ["`l`.`customerId` = `Customer`.`id`"];
  let needsPmJoin = false;

  if (hasSale) {
    clauses.push(`\`l\`.\`leadPhase\` = ${db.sequelize.escape(salePhase)}`);
  }

  if (hasPay) {
    needsPmJoin = true;
    const payEsc = db.sequelize.escape(paymentType);
    clauses.push(`(
      \`l\`.\`leadPaymentMethod\` = ${payEsc}
      OR \`pm\`.\`type\` = ${payEsc}
    )`);
  }

  if (hasDate) {
    clauses.push(leadDateBetweenSql(hasSale ? salePhase : null, fromDate, toDate));
  }

  const join = needsPmJoin
    ? `LEFT JOIN \`CustomerPaymentMethods\` AS \`pm\`
         ON \`pm\`.\`id\` = \`l\`.\`customerPaymentMethodId\``
    : "";

  return db.sequelize.literal(`EXISTS (
    SELECT 1 FROM \`Leads\` AS \`l\`
    ${join}
    WHERE ${clauses.join("\n      AND ")}
  )`);
}

export async function GET(req) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(req.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 25), 100);
  const offset = (page - 1) * pageSize;
  const q = String(searchParams.get("q") || "").trim();
  const searchByRaw = String(searchParams.get("searchBy") || "all").trim();
  const searchBy = SEARCH_BY_VALUES.has(searchByRaw) ? searchByRaw : "all";
  const saleFilter = String(searchParams.get("saleFilter") || "").trim();
  const paymentFilter = String(searchParams.get("paymentFilter") || "").trim();
  const stateRaw = String(searchParams.get("state") || "").trim().toUpperCase();
  const fromDate = parseDateOnly(searchParams.get("fromDate"));
  const toDate = parseDateOnly(searchParams.get("toDate"));

  if (stateRaw && !getStateByCode(stateRaw)) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    return NextResponse.json(
      { error: "fromDate and toDate must both be provided" },
      { status: 400 },
    );
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json(
      { error: "fromDate must be before or equal to toDate" },
      { status: 400 },
    );
  }

  const where = {};

  if (q) {
    const check = validateListSearchQuery(searchBy, q);
    if (!check.isValid) {
      return NextResponse.json({ error: check.message }, { status: 400 });
    }

    if (searchBy === "name") {
      const like = `%${check.normalized}%`;
      pushAnd(where, {
        [Op.or]: [
          { fullName: { [Op.like]: like } },
          db.sequelize.literal(`EXISTS (
            SELECT 1 FROM \`Leads\` AS \`ln\`
            WHERE \`ln\`.\`customerId\` = \`Customer\`.\`id\`
              AND \`ln\`.\`fullName\` LIKE ${db.sequelize.escape(like)}
          )`),
        ],
      });
    } else if (searchBy === "last4") {
      const last4 = check.normalized;
      pushAnd(where, {
        [Op.or]: [
          { phone: { [Op.like]: `%${last4}` } },
          db.sequelize.literal(`EXISTS (
            SELECT 1 FROM \`Leads\` AS \`ln\`
            WHERE \`ln\`.\`customerId\` = \`Customer\`.\`id\`
              AND (
                \`ln\`.\`phone\` LIKE ${db.sequelize.escape(`%${last4}`)}
                OR \`ln\`.\`cellNumber\` LIKE ${db.sequelize.escape(`%${last4}`)}
              )
          )`),
        ],
      });
    } else if (searchBy === "all") {
      const like = `%${check.normalized}%`;
      const digits = check.normalized.replace(/\D/g, "");
      const or = [
        { fullName: { [Op.like]: like } },
        { phone: { [Op.like]: like } },
        db.sequelize.literal(`EXISTS (
          SELECT 1 FROM \`Leads\` AS \`ln\`
          WHERE \`ln\`.\`customerId\` = \`Customer\`.\`id\`
            AND (
              \`ln\`.\`fullName\` LIKE ${db.sequelize.escape(like)}
              OR \`ln\`.\`phone\` LIKE ${db.sequelize.escape(like)}
              OR \`ln\`.\`cellNumber\` LIKE ${db.sequelize.escape(like)}
            )
        )`),
      ];
      if (digits) {
        or.push({ phone: { [Op.like]: `%${digits}%` } });
        or.push(
          db.sequelize.literal(`EXISTS (
            SELECT 1 FROM \`Leads\` AS \`ln\`
            WHERE \`ln\`.\`customerId\` = \`Customer\`.\`id\`
              AND (
                \`ln\`.\`phone\` LIKE ${db.sequelize.escape(`%${digits}%`)}
                OR \`ln\`.\`cellNumber\` LIKE ${db.sequelize.escape(`%${digits}%`)}
              )
          )`),
        );
        if (digits.length >= 4) {
          const last4 = digits.slice(-4);
          or.push({ phone: { [Op.like]: `%${last4}` } });
          or.push(
            db.sequelize.literal(`EXISTS (
              SELECT 1 FROM \`Leads\` AS \`ln\`
              WHERE \`ln\`.\`customerId\` = \`Customer\`.\`id\`
                AND (
                  \`ln\`.\`phone\` LIKE ${db.sequelize.escape(`%${last4}`)}
                  OR \`ln\`.\`cellNumber\` LIKE ${db.sequelize.escape(`%${last4}`)}
                )
            )`),
          );
        }
        const normalized = normalizeToE164(digits);
        if (normalized) or.push({ phone: normalized });
      }
      pushAnd(where, { [Op.or]: or });
    } else {
      const phoneDigits = check.normalized;
      const or = [{ phone: { [Op.like]: `%${phoneDigits}%` } }];
      const normalized = normalizeToE164(phoneDigits);
      if (normalized) or.push({ phone: normalized });
      where[Op.or] = or;
    }
  }

  if (stateRaw) {
    pushAnd(where, {
      [Op.or]: [
        { state: stateRaw },
        db.sequelize.literal(`EXISTS (
          SELECT 1 FROM \`Leads\` AS \`ln\`
          WHERE \`ln\`.\`customerId\` = \`Customer\`.\`id\`
            AND \`ln\`.\`state\` = ${db.sequelize.escape(stateRaw)}
        )`),
      ],
    });
  }

  const salePhase = SALE_FILTER_MAP[saleFilter] || null;
  const paymentType = PAYMENT_FILTER_VALUES.has(paymentFilter) ? paymentFilter : null;
  const leadFilter = buildLeadFilterLiteral({
    salePhase,
    paymentType,
    fromDate,
    toDate,
  });
  if (leadFilter) pushAnd(where, leadFilter);

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
