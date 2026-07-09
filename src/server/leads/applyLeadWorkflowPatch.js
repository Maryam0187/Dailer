import {
  LEAD_PHASE_VALUES,
  contactOutcomeActivityLabel,
  formatAppointmentActivity,
  getLeadPaymentMethodMeta,
  getLeadProgressTagMeta,
  normalizeContactCounts,
  normalizeLeadContactTag,
  normalizeLeadPaymentMethod,
  parseLeadProgressTags,
} from "@/lib/leadWorkflow";
import {
  getWorkflowTagRegistry,
  workflowTagFullLabel,
} from "@/server/workflowTags/registry";

function trimField(value, maxLen) {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function parseAppointmentAt(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function progressTagsEqual(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

export async function applyLeadWorkflowPatch(lead, body) {
  const registry = await getWorkflowTagRegistry();
  const contactLabel = (tag) => workflowTagFullLabel(registry, "contact", tag, tag);
  const phaseLabel = (phase) => workflowTagFullLabel(registry, "phase", phase, phase);
  const progressLabel = (tag) => workflowTagFullLabel(registry, "progress", tag, getLeadProgressTagMeta(tag).label);
  const paymentLabel = (method) =>
    workflowTagFullLabel(registry, "payment", method, getLeadPaymentMethodMeta(method).label);
  const update = {};
  const activity = [];
  const errors = [];

  const current = {
    leadPhase: lead.leadPhase || "active",
    leadProgressTags: lead.leadProgressTags || [],
    leadProcessedRequired: Boolean(lead.leadProcessedRequired),
    leadContactTag: lead.leadContactTag || null,
    leadContactCounts: normalizeContactCounts(lead.leadContactCounts),
    leadAppointmentAt: lead.leadAppointmentAt || null,
    leadAppointmentNote: lead.leadAppointmentNote || null,
    leadPaymentMethod: lead.leadPaymentMethod || null,
    leadCancelReason: lead.leadCancelReason || null,
  };

  if (body?.leadProcessedRequired !== undefined) {
    update.leadProcessedRequired = Boolean(body.leadProcessedRequired);
    if (update.leadProcessedRequired !== current.leadProcessedRequired) {
      activity.push({
        type: "lead_phase_change",
        body: update.leadProcessedRequired ? "Processed required" : "Processed not required",
      });
      if (!update.leadProcessedRequired && lead.processorUserId != null) {
        update.processorUserId = null;
        activity.push({
          type: "lead_phase_change",
          body: "Processor cleared",
        });
      }
    }
  }

  if (body?.leadProgressTags !== undefined) {
    const tags = parseLeadProgressTags(body.leadProgressTags);
    if (tags === null) {
      errors.push("Invalid progress tags");
    } else if (!progressTagsEqual(tags, current.leadProgressTags)) {
      const prev = new Set(current.leadProgressTags);
      const next = new Set(tags);
      const added = [...next].filter((t) => !prev.has(t)).map((t) => `+${progressLabel(t)}`);
      const removed = [...prev].filter((t) => !next.has(t)).map((t) => `-${progressLabel(t)}`);
      update.leadProgressTags = tags;
      if (added.length || removed.length) {
        activity.push({
          type: "lead_phase_change",
          body: `Progress: ${[...added, ...removed].join(", ")}`,
        });
      }
    }
  }

  if (body?.leadPaymentMethod !== undefined) {
    const method = normalizeLeadPaymentMethod(body.leadPaymentMethod);
    if (method === undefined) {
      errors.push("Invalid payment method");
    } else if (method !== current.leadPaymentMethod) {
      update.leadPaymentMethod = method;
      activity.push({
        type: "lead_phase_change",
        body: method
          ? `Payment collected: ${paymentLabel(method)}`
          : "Payment collected: Cleared",
      });
    }
  }

  let nextContactTag = current.leadContactTag;
  let nextCounts = { ...current.leadContactCounts };
  let nextAppointmentAt = current.leadAppointmentAt;
  let nextAppointmentNote = current.leadAppointmentNote;
  let contactChanged = false;

  if (body?.leadContactTag !== undefined) {
    const tag = normalizeLeadContactTag(body.leadContactTag);
    if (tag === undefined) {
      errors.push("Invalid call outcome");
    } else if (tag === null) {
      if (current.leadContactTag) {
        nextCounts[current.leadContactTag] = 0;
        nextContactTag = null;
        nextAppointmentAt = null;
        nextAppointmentNote = null;
        contactChanged = true;
        activity.push({
          type: "lead_phase_change",
          body: `Call: ${contactLabel(current.leadContactTag)} → Cleared`,
        });
      }
    } else if (tag === "appointment") {
      const at =
        body.leadAppointmentAt !== undefined ? parseAppointmentAt(body.leadAppointmentAt) : current.leadAppointmentAt;
      if (at === undefined) errors.push("Invalid appointment date");
      if (!at) errors.push("Appointment date is required");

      const note =
        body.leadAppointmentNote !== undefined
          ? trimField(body.leadAppointmentNote, 2000)
          : current.leadAppointmentNote;

      if (!errors.length) {
        const sameTag = current.leadContactTag === "appointment";
        if (sameTag) {
          nextCounts.appointment = (nextCounts.appointment || 0) + 1;
        } else {
          if (current.leadContactTag) nextCounts[current.leadContactTag] = 0;
          nextCounts.appointment = 1;
        }
        nextContactTag = "appointment";
        nextAppointmentAt = at;
        nextAppointmentNote = note;
        contactChanged = true;
        const count = nextCounts.appointment;
        const apptBody = formatAppointmentActivity(at, note);
        activity.push({
          type: "lead_phase_change",
          body: count > 1 ? `${apptBody} (${count})` : apptBody,
        });
      }
    } else {
      const sameTag = current.leadContactTag === tag;
      if (sameTag) {
        nextCounts[tag] = (nextCounts[tag] || 0) + 1;
        contactChanged = true;
        activity.push({
          type: "lead_phase_change",
          body: contactOutcomeActivityLabel(tag, nextCounts[tag], registry),
        });
      } else {
        if (current.leadContactTag) nextCounts[current.leadContactTag] = 0;
        nextCounts[tag] = 1;
        nextContactTag = tag;
        if (current.leadContactTag === "appointment") {
          nextAppointmentAt = null;
          nextAppointmentNote = null;
        }
        contactChanged = true;
        if (current.leadContactTag) {
          activity.push({
            type: "lead_phase_change",
            body: `Call: ${contactLabel(current.leadContactTag)} → ${contactLabel(tag)}`,
          });
        } else {
          activity.push({
            type: "lead_phase_change",
            body: contactOutcomeActivityLabel(tag, 1, registry),
          });
        }
      }
    }
  }

  if (contactChanged) {
    update.leadContactTag = nextContactTag;
    update.leadContactCounts = nextCounts;
    update.leadAppointmentAt = nextAppointmentAt;
    update.leadAppointmentNote = nextAppointmentNote;
  }

  if (body?.leadPhase !== undefined) {
    const phase = String(body.leadPhase).trim().toLowerCase();
    if (!LEAD_PHASE_VALUES.has(phase)) {
      errors.push("Invalid lead phase");
    } else if (phase !== current.leadPhase) {
      const effectiveProgress = update.leadProgressTags ?? current.leadProgressTags;
      const effectiveRequired = update.leadProcessedRequired ?? current.leadProcessedRequired;

      if (phase === "closed") {
        if (!effectiveProgress.includes("verified")) {
          errors.push("Verified is required before closing this sale");
        }
        if (!effectiveProgress.includes("sale_done")) {
          errors.push("Sale done is required before closing this sale");
        }
        if (effectiveRequired && !effectiveProgress.includes("processed")) {
          errors.push("Processed is required before closing this sale");
        }
      }

      if (phase === "cancelled") {
        const reason =
          body.leadCancelReason !== undefined ? trimField(body.leadCancelReason, 2000) : current.leadCancelReason;
        if (!reason) errors.push("Cancel reason is required");
        else update.leadCancelReason = reason;
      }

      if (phase === "active" || phase === "closed") {
        update.leadCancelReason = null;
      }

      if (!errors.length) {
        update.leadPhase = phase;
        if (phase === "closed") {
          update.status = "closed";
        } else if (phase === "cancelled") {
          update.status = "dnc";
        }
        if (update.status && update.status !== lead.status) {
          activity.push({
            type: "status_change",
            previousStatus: lead.status,
            newStatus: update.status,
            body: null,
          });
        }
        if (phase === "closed") {
          activity.push({ type: "lead_phase_change", body: "Closed: Sale close" });
        } else if (phase === "cancelled") {
          activity.push({
            type: "lead_phase_change",
            body: `Cancelled: ${update.leadCancelReason}`,
          });
        } else if (phase === "active" && current.leadPhase === "cancelled") {
          activity.push({ type: "lead_phase_change", body: "Reactivated lead" });
        } else {
          activity.push({
            type: "lead_phase_change",
            body: `Phase: ${phaseLabel(current.leadPhase)} → ${phaseLabel(phase)}`,
          });
        }
      }
    }
  }

  if (body?.leadCancelReason !== undefined && body?.leadPhase === undefined) {
    const effectivePhase = update.leadPhase ?? current.leadPhase;
    const reason = trimField(body.leadCancelReason, 2000);
    if (effectivePhase === "cancelled") {
      if (!reason) errors.push("Cancel reason is required");
      else if (reason !== current.leadCancelReason) {
        update.leadCancelReason = reason;
        activity.push({ type: "lead_phase_change", body: `Cancel reason updated: ${reason}` });
      }
    }
  }

  if (
    body?.leadPhase === "cancelled" &&
    body?.leadCancelReason === undefined &&
    !current.leadCancelReason &&
    update.leadPhase === "cancelled"
  ) {
    errors.push("Cancel reason is required");
  }

  return { update, activity, errors };
}
